
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const FALLBACK = 'No se pudo generar la explicación en este momento. Intenta de nuevo más tarde.';

function buildPrompt({ question, studentAnswer, correctAnswer, area, competencia }) {
  const options = Array.isArray(question.options)
    ? question.options.map((o) => `  ${o.label || o.key || ''}. ${o.text || o.value || ''}`).join('\n')
    : '';

  return `Eres un tutor pedagógico para estudiantes colombianos que se preparan para el examen ICFES Saber 11.

Un estudiante respondió incorrectamente la siguiente pregunta. Ayúdale a entender su error de forma clara, amigable y motivadora.

**Área ICFES:** ${area}
**Competencia:** ${competencia}

**Enunciado de la pregunta:**
${question.statementText || question.statement || '(sin enunciado de texto)'}

**Opciones de respuesta:**
${options}

**El estudiante eligió:** Opción ${studentAnswer}
**La respuesta correcta es:** Opción ${correctAnswer}

Explícale al estudiante:
1. Por qué la opción ${studentAnswer} es incorrecta (sin usar términos condescendientes)
2. El razonamiento correcto para llegar a la opción ${correctAnswer}
3. Un consejo de estudio concreto para reforzar esta competencia

Usa un tono cálido, directo y motivador. Máximo 180 palabras. Responde en español.`;
}

async function explainWrongAnswer({ question, studentAnswer, correctAnswer, area, competencia }) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY no configurada');

  const prompt = buildPrompt({ question, studentAnswer, correctAnswer, area, competencia });

  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 450,
      temperature: 0.65,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`DeepSeek ${response.status}: ${body}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Respuesta vacía de DeepSeek');
  return text;
}

async function safeExplain(params) {
  try {
    return await explainWrongAnswer(params);
  } catch (err) {
    console.error('[aiExplanationService] error:', err?.message || err);
    return FALLBACK;
  }
}

// ─── Question generator ────────────────────────────────────────────────────────

// Per-area configuration: text-base policy, language, and quality directives.
const AREA_PROFILES = {
  'Lectura Crítica': {
    textBase: 'always',
    textBaseMin: 180,
    textBaseDesc:
      'Crea un fragmento de calidad literaria o periodística (mínimo 180 palabras). ' +
      'Puede ser: fragmento de novela colombiana o latinoamericana, crónica periodística, ' +
      'ensayo académico, artículo de opinión o poema extenso, según el tema. ' +
      'El texto debe prestarse para el análisis del discurso, no solo para la comprensión literal. ' +
      'Ejemplos de fuentes: Gabriel García Márquez, Tomás González, Piedad Bonnett, El Espectador, Semana.',
    questionDesc:
      'Evalúa EXCLUSIVAMENTE: inferencia, propósito del autor, análisis del discurso, ' +
      'relaciones intertextuales y registro. NUNCA comprensión literal. ' +
      'Cada enunciado debe referenciar el texto: "Según el fragmento anterior...", ' +
      '"El propósito del autor al usar la expresión X es...", "De acuerdo con el texto...".',
    lang: 'es',
  },
  'Inglés': {
    textBase: 'always',
    textBaseMin: 120,
    textBaseDesc:
      'Create an English text (minimum 120 words) at B1-B2 CEFR level. ' +
      'Choose the format according to the topic: short article, email, advertisement, ' +
      'blog post, informational paragraph, or letter. ' +
      'Use clear structure, academic vocabulary, and varied sentence complexity.',
    questionDesc:
      'Write ALL question stems and answer choices IN ENGLISH. ' +
      'Evaluate inferential comprehension: author\'s purpose, implied meaning, ' +
      'vocabulary in context, text organization, tone. ' +
      'NEVER ask what the text "explicitly states" or literal recall questions. ' +
      'Level: B1-B2 CEFR. Explanations (explicacion_correcta, explicacion_distractores) may be in Spanish.',
    lang: 'en',
  },
  'Ciencias Sociales': {
    textBase: 'frequent',
    textBaseMin: 120,
    textBaseDesc:
      'Incluye texto base cuando el tema lo permita (mínimo 120 palabras). ' +
      'Tipos: fuente histórica primaria, fragmento de la Constitución Política de Colombia de 1991, ' +
      'artículo de opinión sobre realidad social colombiana, tabla de datos socioeconómicos descrita ' +
      'en prosa, caricatura política descrita verbalmente, decreto o ley relevante. ' +
      'Si el tema es puramente conceptual (sin fuente natural), usa textoBase: null.',
    questionDesc:
      'Evalúa: interpretación de fuentes históricas, análisis de estructuras sociales y políticas, ' +
      'comprensión de conceptos constitucionales, pensamiento crítico sobre la realidad colombiana. ' +
      'NUNCA preguntas de memorización de fechas, nombres o definiciones textuales.',
    lang: 'es',
  },
  'Ciencias Naturales': {
    textBase: 'optional',
    textBaseMin: 100,
    textBaseDesc:
      'Incluye texto base SOLO si el tema requiere interpretación de datos o contexto experimental. ' +
      'Tipos válidos: descripción de un experimento escolar, situación ambiental del entorno colombiano ' +
      '(ecosistemas, ríos, biodiversidad), gráfica o tabla de resultados explicada en texto. ' +
      'Para preguntas conceptuales o de aplicación directa de fórmulas, usa textoBase: null.',
    questionDesc:
      'Evalúa: aplicación de conceptos a situaciones reales, interpretación de resultados experimentales, ' +
      'razonamiento científico. Usa fenómenos del entorno colombiano (Andes, Amazonía, Caribe) cuando ' +
      'sea posible. NUNCA preguntas de definición memorística o nomenclatura aislada.',
    lang: 'es',
  },
  'Matemáticas': {
    textBase: 'never',
    textBaseMin: 0,
    textBaseDesc: null,
    questionDesc:
      'Cada pregunta DEBE presentar una situación problema narrativa en el enunciado, ' +
      'ambientada en la vida cotidiana colombiana: precios en pesos COP, distancias entre ' +
      'ciudades colombianas, datos de fútbol colombiano, situaciones de mercado o transporte. ' +
      'El enunciado narra el contexto y luego plantea la pregunta matemática. ' +
      'Evalúa: razonamiento cuantitativo, modelación matemática, comunicación matemática. ' +
      'NUNCA ejercicios algorítmicos sin contexto ("Calcule: 3x + 2 = 14").',
    lang: 'es',
  },
};

const DIFFICULTY_TRI = {
  'fácil':   'fácil — nivel TRI bajo (b ≈ −1): la responde correctamente más del 70% de los estudiantes; aplicación directa de conceptos conocidos',
  'media':   'media — nivel TRI moderado (b ≈ 0): la responde entre el 40% y 70% de los estudiantes; requiere análisis y transferencia de conocimiento',
  'difícil': 'difícil — nivel TRI alto (b ≈ 1–2): la responde menos del 40% de los estudiantes; requiere pensamiento crítico avanzado, síntesis y evaluación',
};

function buildGeneratePrompt({ area, competencia, dificultad, tema, cantidad }) {
  const profile = AREA_PROFILES[area] || AREA_PROFILES['Matemáticas'];
  const diffDesc = DIFFICULTY_TRI[dificultad] || dificultad;
  const temaLine = tema?.trim() ? `\nTema / contexto específico: ${tema.trim()}` : '';

  // ── Text base block ──────────────────────────────────────────────────────────
  let textBaseBlock;
  if (profile.textBase === 'always') {
    textBaseBlock =
      `TEXTO BASE (obligatorio para ${area}):\n` +
      profile.textBaseDesc + '\n' +
      `Escribe el texto en el campo textoBase.contenido (mínimo ${profile.textBaseMin} palabras).\n` +
      `En textoBase.titulo indica la fuente o tipo de texto (ej: "Fragmento de 'La hojarasca' — García Márquez").`;
  } else if (profile.textBase === 'frequent') {
    textBaseBlock =
      `TEXTO BASE (frecuente para ${area}):\n` +
      profile.textBaseDesc + '\n' +
      'Decide según el tema: si hay una fuente natural para analizar, inclúyela. Si no, usa textoBase: null.';
  } else if (profile.textBase === 'optional') {
    textBaseBlock =
      `TEXTO BASE (opcional para ${area}):\n` +
      profile.textBaseDesc + '\n' +
      'Si el tema no requiere texto base, usa textoBase: null.';
  } else {
    textBaseBlock = 'TEXTO BASE: No aplica para esta área. Usa textoBase: null obligatoriamente.';
  }

  // ── Language note ────────────────────────────────────────────────────────────
  const langNote = profile.lang === 'en'
    ? '\nIDIOMA: textoBase.contenido, todos los enunciados y todas las opciones deben estar en INGLÉS. ' +
      'Las explicaciones (explicacion_correcta y explicacion_distractores) pueden estar en español.'
    : '';

  return `Eres un experto en diseño de pruebas estandarizadas para el ICFES Colombia con amplia experiencia en evaluación educativa.
Las preguntas deben seguir exactamente el formato, estilo y nivel de dificultad del examen ICFES Saber 11.

SOLICITUD: Genera EXACTAMENTE ${cantidad} pregunta${cantidad > 1 ? 's' : ''} de opción múltiple con una sola respuesta correcta.

PARÁMETROS DE GENERACIÓN:
- Área ICFES: ${area}
- Competencia: ${competencia}
- Dificultad: ${diffDesc}${temaLine}

CALIDAD DE PREGUNTAS (obligatorio):
- Evalúa pensamiento crítico y análisis. NUNCA memorización de datos o definiciones.
- Los distractores representan errores comunes de razonamiento, no opciones absurdas.
- El enunciado es claro, sin ambigüedad, con una única respuesta correcta defendible.
- ${profile.questionDesc}

${textBaseBlock}
${langNote}

FORMATO DE RESPUESTA (obligatorio, sin excepciones):
Responde SIEMPRE con exactamente este objeto JSON. Sin texto antes. Sin texto después. Sin backticks.
{
  "textoBase": null,
  "preguntas": [
    {
      "enunciado": "...",
      "opciones": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "correcta": "A",
      "explicacion_correcta": "por qué esta opción es la correcta",
      "explicacion_distractores": { "B": "error de razonamiento que lleva a B", "C": "...", "D": "..." },
      "competencia": "${competencia}",
      "dificultad_estimada": "${dificultad}"
    }
  ]
}
Cuando haya texto base, reemplaza null con: { "titulo": "Fuente o tipo de texto", "contenido": "Texto completo..." }
El campo "correcta" debe ser exactamente "A", "B", "C" o "D". Nada más.`;
}

// Returns the first array-valued property of a plain object, or null.
function findNestedArray(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  for (const val of Object.values(obj)) {
    if (Array.isArray(val) && val.length > 0) return val;
  }
  return null;
}

function extractJsonArray(raw) {
  let text = raw.trim();

  // Strip ALL code fences anywhere in the string: ```json, ```, ~~~json, ~~~
  text = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  text = text.replace(/~~~(?:json)?/gi, '').replace(/~~~/g, '').trim();

  // Fast path: whole cleaned text is already valid JSON
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    const nested = findNestedArray(parsed);
    if (nested) return nested;
  } catch (_) {}

  // Extract from first [ to last ] — strips any intro/outro prose
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');

  if (arrStart !== -1 && arrEnd > arrStart) {
    const candidate = text.slice(arrStart, arrEnd + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
    } catch (parseErr) {
      console.error('[aiExplanationService] JSON.parse falló en el candidato extraído.');
      console.error('[aiExplanationService] Raw de DeepSeek:\n', raw);
      throw new Error(`Formato JSON inválido en la respuesta de la IA: ${parseErr.message}`);
    }
  }

  // Last resort: find { ... } wrapper that contains an array property
  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');
  if (objStart !== -1 && objEnd > objStart) {
    try {
      const parsed = JSON.parse(text.slice(objStart, objEnd + 1));
      const nested = findNestedArray(parsed);
      if (nested) return nested;
    } catch (_) {}
  }

  console.error('[aiExplanationService] No se pudo extraer un array JSON. Raw de DeepSeek:\n', raw);
  throw new Error('La respuesta de la IA no contiene un array JSON válido');
}

/**
 * Parses the raw DeepSeek response and returns { questions, textoBase }.
 * Handles two formats:
 *   - Plain array:  [...] (areas without text base)
 *   - Object:       { textoBase: { titulo, contenido }, preguntas: [...] }
 */
function parseGenerateResponse(raw) {
  let text = raw.trim();

  // Strip code fences
  text = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  text = text.replace(/~~~(?:json)?/gi, '').replace(/~~~/g, '').trim();

  // Try to parse the whole cleaned text first
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    // Try to extract from first structural character
    const objStart = text.indexOf('{');
    const arrStart = text.indexOf('[');

    if (objStart !== -1 && (arrStart === -1 || objStart < arrStart)) {
      // Looks like an object — extract from { to last }
      const objEnd = text.lastIndexOf('}');
      if (objEnd > objStart) {
        try {
          parsed = JSON.parse(text.slice(objStart, objEnd + 1));
        } catch (e) {
          console.error('[aiExplanationService] JSON.parse falló (objeto). Raw:\n', raw);
          throw new Error(`Formato JSON inválido en la respuesta de la IA: ${e.message}`);
        }
      }
    } else if (arrStart !== -1) {
      // Looks like an array — extract from [ to last ]
      const arrEnd = text.lastIndexOf(']');
      if (arrEnd > arrStart) {
        try {
          parsed = JSON.parse(text.slice(arrStart, arrEnd + 1));
        } catch (e) {
          console.error('[aiExplanationService] JSON.parse falló (array). Raw:\n', raw);
          throw new Error(`Formato JSON inválido en la respuesta de la IA: ${e.message}`);
        }
      }
    }
  }

  if (!parsed) {
    console.error('[aiExplanationService] No se pudo parsear ningún JSON. Raw:\n', raw);
    throw new Error('La respuesta de la IA no contiene JSON válido');
  }

  // Format A: plain array  →  { preguntas: [...], textoBase: null }
  if (Array.isArray(parsed)) {
    return { questions: parsed, textoBase: null };
  }

  // Format B: { textoBase: {...}, preguntas: [...] }
  if (parsed.preguntas && Array.isArray(parsed.preguntas)) {
    return {
      questions: parsed.preguntas,
      textoBase: parsed.textoBase || null
    };
  }

  // Fallback: find any array-valued property
  const nested = findNestedArray(parsed);
  if (nested) {
    return { questions: nested, textoBase: null };
  }

  console.error('[aiExplanationService] No se encontró array de preguntas. Raw:\n', raw);
  throw new Error('La respuesta de la IA no contiene un array de preguntas válido');
}

async function generateQuestions({ area, competencia, dificultad, tema, cantidad }) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY no configurada');

  const qty = Math.min(10, Math.max(1, parseInt(cantidad, 10) || 3));
  const prompt = buildGeneratePrompt({ area, competencia, dificultad, tema, cantidad: qty });

  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You are a JSON API. Only respond with valid JSON. No explanations, no markdown, no backticks.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 6000,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`DeepSeek ${response.status}: ${body}`);
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error('Respuesta vacía de DeepSeek');

  const { questions, textoBase } = parseGenerateResponse(raw);

  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('DeepSeek devolvió un array vacío de preguntas');
  }

  for (const q of questions) {
    if (!q.enunciado || !q.opciones || !q.correcta) {
      throw new Error('Una o más preguntas generadas tienen formato incorrecto');
    }
  }

  return { questions, textoBase };
}

module.exports = { explainWrongAnswer, safeExplain, generateQuestions };
