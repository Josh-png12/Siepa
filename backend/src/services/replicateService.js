/**
 * Servicio para interactuar con DeepSeek-VL2 a través de Replicate.
 *
 * Modelo: deepseek-ai/deepseek-vl2 (Mixture-of-Experts Vision-Language Model)
 * API schema: image (uri), prompt (string), temperature (0-1), top_p (0-1),
 *              max_length_tokens (0-4096), repetition_penalty (0-2)
 *
 * Rate limit: 6 req/min para cuentas con < $5 crédito → espaciar peticiones 10s+
 */

const Replicate = require('replicate');

// ─── Configuración ───────────────────────────────────────────────────────────────

const MODEL_NAME = process.env.REPLICATE_DEEPSEEK_VL_MODEL
  || 'deepseek-ai/deepseek-vl2:e5caf557dd9e5dcee46442e1315291ef1867f027991ede8ff95e304d4f734200';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

// ─── Cliente (inicialización lazy) ───────────────────────────────────────────────

let _replicate = null;
const getClient = () => {
  if (_replicate) return _replicate;

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error('REPLICATE_API_TOKEN no configurada. Agrega tu token de Replicate en el archivo .env');
  }

  _replicate = new Replicate({ auth: token });
  console.log('[REPLICATE] Cliente inicializado correctamente');
  return _replicate;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Parsea la respuesta JSON de DeepSeek-VL2.
 * El modelo puede devolver JSON puro, JSON dentro de backticks markdown, o texto con prefijos.
 */
const parseVisionJson = (raw, fallbackKey = null) => {
  if (!raw || typeof raw !== 'string') return fallbackKey ? { [fallbackKey]: [] } : [];

  let text = raw.trim();

  // Limpiar bloques de código markdown (```json ... ``` o ``` ... ```)
  text = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

  // Intento 1: parseo directo
  try {
    const parsed = JSON.parse(text);
    if (fallbackKey && !Array.isArray(parsed) && !parsed[fallbackKey]) {
      return { [fallbackKey]: Array.isArray(parsed) ? parsed : [] };
    }
    return parsed;
  } catch (_) { /* continuar */ }

  // Intento 2: extraer primer objeto/array JSON delimitado por { } o [ ]
  const jsonStart = text.indexOf(text.trimStart().startsWith('[') ? '[' : '{');
  const jsonEnd = text.lastIndexOf(text.trimStart().startsWith('[') ? ']' : '}');

  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    try {
      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      return parsed;
    } catch (_) { /* continuar */ }
  }

  // Intento 3: buscar primer [ ... ]
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd > arrStart) {
    try {
      const parsed = JSON.parse(text.slice(arrStart, arrEnd + 1));
      return parsed;
    } catch (_) { /* continuar */ }
  }

  console.warn('[REPLICATE] No se pudo parsear JSON de la respuesta:', text.slice(0, 200));
  return fallbackKey ? { [fallbackKey]: [] } : [];
};

// ─── Core: llamada a Replicate con reintentos ────────────────────────────────────

/**
 * Envía una imagen en base64 a DeepSeek-VL2 y devuelve el texto generado.
 *
 * Parámetros según el schema de deepseek-ai/deepseek-vl2 en Replicate:
 *   - image: string (uri format) — REQUERIDO
 *   - prompt: string — REQUERIDO
 *   - temperature: number (0-1, default 0.1)
 *   - top_p: number (0-1, default 0.9)
 *   - max_length_tokens: integer (0-4096, default 2048)
 *   - repetition_penalty: number (0-2, default 1.1)
 *
 * @param {string} imageBase64 - Imagen PNG en base64 (sin prefijo data:)
 * @param {string} prompt      - Instrucciones para el modelo
 * @param {object} opts
 * @param {number} opts.maxTokens        - max_length_tokens (default: 4096 para preguntas, 2048 para burbujas)
 * @param {number} opts.temperature      - Temperatura (default: 0.1)
 * @returns {Promise<string>} - Texto generado por el modelo
 */
const callReplicateVision = async (imageBase64, prompt, { maxTokens = 4096, temperature = 0.1 } = {}) => {
  const replicate = getClient();

  const dataUri = `data:image/png;base64,${imageBase64}`;

  // Input schema exacto de deepseek-ai/deepseek-vl2
  const input = {
    image: dataUri,
    prompt,
    temperature,
    top_p: 0.9,
    max_length_tokens: maxTokens,
    repetition_penalty: 1.1
  };

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[REPLICATE] Llamada a VL2 (intento ${attempt}/${MAX_RETRIES}, ${imageBase64.length} chars base64)...`);

      const output = await replicate.run(MODEL_NAME, { input });

      // replicate.run devuelve array de strings; unirlos
      const text = Array.isArray(output) ? output.join('') : String(output);

      if (!text || text.trim().length === 0) {
        throw new Error('DeepSeek-VL2 devolvió una respuesta vacía');
      }

      console.log(`[REPLICATE] Respuesta recibida (${text.length} caracteres)`);
      return text.trim();
    } catch (err) {
      lastError = err;
      const status = err?.response?.status || err?.status;
      const isRateLimit = status === 429;
      const isServerError = status >= 500;
      const isNotFound = status === 404;
      const isRetryable = isRateLimit || isServerError || err.message?.includes('fetch failed');

      console.error(`[REPLICATE] Error en intento ${attempt}/${MAX_RETRIES}:`, err.message);

      // 404 no es reintentable — modelo no encontrado
      if (isNotFound) {
        throw new Error(`Replicate 404: modelo "${MODEL_NAME}" no encontrado. Verifica REPLICATE_DEEPSEEK_VL_MODEL en .env`);
      }

      if (attempt < MAX_RETRIES && isRetryable) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 2s, 4s, 8s
        console.log(`[REPLICATE] Reintentando en ${delay / 1000}s...`);
        // eslint-disable-next-line no-await-in-loop
        await sleep(delay);
        continue;
      }

      if (attempt < MAX_RETRIES) {
        console.log(`[REPLICATE] Error no reintentable (status=${status}), abortando`);
        throw err;
      }
    }
  }

  throw new Error(`Replicate: máximo de reintentos (${MAX_RETRIES}) alcanzado. Último error: ${lastError?.message}`);
};

// ─── Funciones públicas ──────────────────────────────────────────────────────────

/**
 * Extrae preguntas tipo ICFES desde una imagen de página de cuadernillo.
 * Usa un prompt estricto para evitar alucinaciones.
 *
 * @param {string} imageBase64 - Página del PDF renderizada como PNG en base64
 * @returns {Promise<Array>} - Array de objetos con { pregunta, opciones: {A, B, C, D}, imagen_descripcion, respuesta_correcta }
 */
const extractQuestionsFromImage = async (imageBase64) => {
  const prompt = `Eres un sistema de extracción de texto. Analiza la imagen y extrae SOLO preguntas de opción múltiple que tengan claramente las opciones A, B, C, D.

REGLAS IMPORTANTES:
- SI la imagen NO contiene preguntas con opciones A, B, C, D → devuelve un array vacío: []
- SI la imagen contiene preguntas → extrae el texto EXACTO (no inventes ni parafrasees)
- Las preguntas deben tener enunciado completo y opciones con sus textos
- Las preguntas suelen comenzar con un número (1., 2., 3., etc.)

Devuelve un array JSON donde cada elemento tiene:
- "pregunta": el enunciado exacto de la pregunta
- "opciones": { "A": "texto exacto", "B": "...", "C": "...", "D": "..." }
- "imagen_descripcion": si hay figura, descríbela brevemente; si no, null
- "respuesta_correcta": null (siempre, porque no la extraemos)

EJEMPLO DE FORMATO CORRECTO:
[
  {
    "pregunta": "Algunas sustancias pueden emitir luz, característica conocida como fluorescencia...",
    "opciones": {
      "A": "el candidato 2, porque presenta mayor fluorescencia que el candidato 1.",
      "B": "el candidato 1, porque, aunque hay una disminución en la fluorescencia, el valor no llega a ser cero.",
      "C": "el candidato 1, porque presenta la mayor disminución de la fluorescencia.",
      "D": "el candidato 2, porque la fluorescencia no se afecta tanto por la presencia de X."
    },
    "imagen_descripcion": "Gráficas de fluorescencia de dos candidatos, mostrando decaimiento en presencia de X",
    "respuesta_correcta": null
  }
]

Si no hay preguntas, devuelve EXACTAMENTE: []

SOLO JSON, sin markdown, sin explicaciones, sin texto adicional.`;

  try {
    const raw = await callReplicateVision(imageBase64, prompt, { maxTokens: 4096, temperature: 0.1 });

    // Log de los primeros 200 caracteres para depuración
    console.log(`[REPLICATE] Respuesta RAW (primeros 200 chars): ${raw.slice(0, 200)}`);

    const parsed = parseVisionJson(raw);

    // Asegurar que sea un array
    if (Array.isArray(parsed)) {
      return parsed.filter((q) => q && typeof q.pregunta === 'string' && q.pregunta.trim().length > 0);
    }

    // Si el modelo devolvió { preguntas: [...] } o similar
    if (parsed && Array.isArray(parsed.preguntas)) {
      return parsed.preguntas.filter((q) => q && typeof q.pregunta === 'string' && q.pregunta.trim().length > 0);
    }

    console.warn('[REPLICATE] Formato inesperado en extractQuestionsFromImage:', typeof parsed);
    return [];
  } catch (err) {
    console.error('[REPLICATE] Error extrayendo preguntas:', err.message);
    throw err;
  }
};

/**
 * Valida las burbujas marcadas en una hoja de respuestas usando DeepSeek-VL2.
 * Se usa como fallback cuando OpenCV/canvas no tiene suficiente confianza.
 *
 * @param {string} imageBase64 - Hoja de respuestas renderizada como PNG en base64
 * @param {number} numQuestions - Número total de preguntas a leer (default: 60)
 * @returns {Promise<{answers: string[], confidence: number}>} - Array de letras (A-E o 'X') y confianza global
 */
const validateBubblesFromImage = async (imageBase64, numQuestions = 60) => {
  const optionsPerQuestion = 5; // A, B, C, D, E
  const optionsList = ['A', 'B', 'C', 'D', 'E'];

  const prompt = `Eres un sistema experto en lectura de hojas de respuestas ICFES.
Esta imagen contiene una hoja de respuestas con burbujas para ${numQuestions} preguntas.
Cada pregunta tiene ${optionsPerQuestion} opciones: ${optionsList.join(', ')}.

Para cada una de las ${numQuestions} preguntas, identifica qué burbuja está MARCADA (rellenada).
Reglas:
- Si exactamente UNA burbuja está claramente marcada, indica su letra (A, B, C, D o E).
- Si NINGUNA burbuja está marcada, indica "X".
- Si MÚLTIPLES burbujas están marcadas en la misma pregunta, indica "X".
- Si la imagen es borrosa o no puedes determinar con certeza, indica "X".

Devuelve ÚNICAMENTE un objeto JSON con estas dos claves, sin markdown ni texto adicional:
- "answers": array de exactamente ${numQuestions} strings (cada uno A-E o X)
- "confidence": número del 0 al 100 indicando qué tan seguro estás de la lectura global

Ejemplo: {"answers": ["A","B","X","D","C","X","A"], "confidence": 85}`;

  try {
    const raw = await callReplicateVision(imageBase64, prompt, { maxTokens: 2048, temperature: 0 });

    const parsed = parseVisionJson(raw, 'answers');

    let answers = [];
    let confidence = 0;

    if (Array.isArray(parsed)) {
      answers = parsed;
    } else if (parsed && Array.isArray(parsed.answers)) {
      answers = parsed.answers;
      confidence = Number(parsed.confidence) || 0;
    } else if (parsed && Array.isArray(parsed.respuestas)) {
      answers = parsed.respuestas;
    }

    answers = answers.map((a) => {
      const letter = String(a).trim().toUpperCase().charAt(0);
      return optionsList.includes(letter) || letter === 'X' ? letter : 'X';
    });

    while (answers.length < numQuestions) {
      answers.push('X');
    }
    if (answers.length > numQuestions) {
      answers = answers.slice(0, numQuestions);
    }

    const validCount = answers.filter((a) => a !== 'X').length;
    if (!confidence) {
      confidence = numQuestions > 0 ? Math.round((validCount / numQuestions) * 100) : 0;
    }

    console.log(`[REPLICATE] validateBubbles: ${validCount}/${numQuestions} burbujas detectadas (${confidence}% confianza)`);

    return { answers, confidence };
  } catch (err) {
    console.error('[REPLICATE] Error validando burbujas:', err.message);
    throw err;
  }
};

// ─── Export ──────────────────────────────────────────────────────────────────────

module.exports = {
  extractQuestionsFromImage,
  validateBubblesFromImage,
  callReplicateVision,
  MODEL_NAME
};