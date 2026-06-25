const fs = require('fs/promises');
const path = require('path');
require('../utils/canvasShim');
const { renderPageToImage } = require('./pdfOcrService');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const MAX_RETRIES = 3;
const INTER_PAGE_DELAY_MS = 2000;

const EXTRACTION_PROMPT = `Eres un experto en extracción de preguntas de exámenes ICFES Colombia. Extrae TODAS las preguntas de esta imagen en JSON puro sin backticks:
{
  "preguntas": [
    {
      "numero": 1,
      "enunciado": "texto completo",
      "tiene_imagen": true,
      "descripcion_imagen": "descripción detallada de gráfica/tabla/diagrama si existe",
      "texto_base": "fragmento de texto compartido si las preguntas dependen de él, null si no",
      "opciones": { "A": "...", "B": "...", "C": "...", "D": "..." }
    }
  ]
}
Si la página no tiene preguntas (es portada, índice, etc), retorna: {"preguntas": []}`;

const loadPdfJs = () => require('pdfjs-dist/legacy/build/pdf.js');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseGeminiJson(raw) {
  let text = raw.trim()
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.preguntas)) return parsed.preguntas;
  } catch (_) {}

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(parsed.preguntas)) return parsed.preguntas;
    } catch (_) {}
  }

  return [];
}

// Extracts retryDelay in ms from a 429 response body.
// Gemini sends: { "error": { "details": [{ "retryDelay": "42s" }] } }
function parseRetryDelayMs(rawBody) {
  try {
    const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    const details = parsed?.error?.details || [];
    for (const detail of details) {
      const raw = detail?.retryDelay;
      if (raw) {
        const match = String(raw).match(/^(\d+(?:\.\d+)?)\s*s$/i);
        if (match) return Math.round(Number(match[1]) * 1000);
      }
    }
  } catch (_) {}
  return null;
}

async function callGeminiVision(base64Image, pageNum = 0) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');

  const requestBody = JSON.stringify({
    contents: [{
      parts: [
        { text: EXTRACTION_PROMPT },
        { inline_data: { mime_type: 'image/png', data: base64Image } }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096
    }
  });

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody
    });

    if (response.status === 429) {
      // eslint-disable-next-line no-await-in-loop
      const rawBody = await response.text().catch(() => '{}');
      const retryDelayMs = parseRetryDelayMs(rawBody);
      const waitMs = (retryDelayMs !== null ? retryDelayMs : 60000) + 2000;
      const waitSec = Math.round(waitMs / 1000);

      if (attempt < MAX_RETRIES) {
        console.log(`[PDF EXTRACTOR] Página ${pageNum}: rate limit, esperando ${waitSec}s antes de reintentar (intento ${attempt}/${MAX_RETRIES})...`);
        // eslint-disable-next-line no-await-in-loop
        await sleep(waitMs);
        continue;
      }

      throw new Error(`Gemini 429: rate limit después de ${MAX_RETRIES} intentos (última espera sugerida: ${waitSec}s)`);
    }

    if (!response.ok) {
      // eslint-disable-next-line no-await-in-loop
      const errBody = await response.text().catch(() => '');
      throw new Error(`Gemini ${response.status}: ${errBody}`);
    }

    // eslint-disable-next-line no-await-in-loop
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error('Respuesta vacía de Gemini');

    return parseGeminiJson(text);
  }

  throw new Error('Gemini: máximo de reintentos alcanzado');
}

// Maps a Gemini question to the previewQuestions format expected by pdfImportService
function mapToPreviewFormat(geminiQuestions) {
  return geminiQuestions.map((q, idx) => {
    const opts = q.opciones || {};
    const options = ['A', 'B', 'C', 'D']
      .filter((k) => opts[k])
      .map((k) => ({ label: k, text: String(opts[k]).trim() }));

    let statement = String(q.enunciado || '').trim();
    if (q.texto_base) {
      statement = `${String(q.texto_base).trim()}\n\n${statement}`;
    }
    if (q.tiene_imagen && q.descripcion_imagen) {
      statement = `${statement}\n[Imagen: ${String(q.descripcion_imagen).trim()}]`;
    }

    return {
      qNumber: Number(q.numero) || idx + 1,
      statement,
      options,
      detectedAnswer: null,
      area: 'General',
      competencia: 'General',
      nivelCognitivo: 'comprender',
      dificultadCualitativa: 'media',
      _source: 'gemini-vision'
    };
  });
}

async function extractQuestionsFromPdf({ filePath, maxPages = 50, onProgress }) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');

    console.log('[PDF EXTRACTOR] Cargando pdfjs...');
    const pdfjsLib = await loadPdfJs();

    console.log(`[PDF EXTRACTOR] Leyendo archivo: ${filePath}`);
    const buffer = await fs.readFile(filePath);

    console.log('[PDF EXTRACTOR] Parseando documento PDF...');
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

    const totalAll = Number(doc.numPages || 0);
    const totalPages = Math.min(totalAll, Number(maxPages) || 50);
    console.log(`[PDF EXTRACTOR] Total páginas: ${totalAll}, procesando: ${totalPages}`);

    const tmpDir = path.join(process.cwd(), 'uploads', 'tmp', 'gemini-extract');
    await fs.mkdir(tmpDir, { recursive: true });

    const allQuestions = [];
    let paginasConPreguntas = 0;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      // 2-second gap between pages to stay under the 15 req/min free-tier limit
      if (pageNum > 1) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(INTER_PAGE_DELAY_MS);
      }

      const outPngPath = path.join(tmpDir, `page_${Date.now()}_${pageNum}.png`);

      try {
        console.log(`[PDF EXTRACTOR] Renderizando página ${pageNum}/${totalPages}...`);
        // eslint-disable-next-line no-await-in-loop
        await renderPageToImage({ pdfPath: filePath, pageNumber: pageNum, outPngPath, dpi: 200 });
        // eslint-disable-next-line no-await-in-loop
        const imageBuffer = await fs.readFile(outPngPath);
        const base64 = imageBuffer.toString('base64');

        console.log(`[PDF EXTRACTOR] Enviando página ${pageNum} a Gemini...`);
        // eslint-disable-next-line no-await-in-loop
        const pageQuestions = await callGeminiVision(base64, pageNum);
        console.log(`[PDF EXTRACTOR] Página ${pageNum}: ${pageQuestions.length} preguntas encontradas`);

        if (pageQuestions.length > 0) {
          paginasConPreguntas++;
          allQuestions.push(...pageQuestions);
        }
      } catch (err) {
        console.error(`[PDF EXTRACTOR ERROR] Página ${pageNum}:`, err.message);
      } finally {
        await fs.unlink(outPngPath).catch(() => {});
      }

      if (typeof onProgress === 'function') {
        onProgress({
          currentPage: pageNum,
          totalPages,
          percent: Math.round((pageNum / Math.max(1, totalPages)) * 100)
        });
      }
    }

    console.log(`[PDF EXTRACTOR] Completado: ${allQuestions.length} preguntas en ${paginasConPreguntas} páginas`);
    return { preguntas: allQuestions, paginasProcesadas: totalPages, paginasConPreguntas };
  } catch (err) {
    console.error('[PDF EXTRACTOR ERROR]', err.message);
    console.error(err.stack);
    throw err;
  }
}

module.exports = { extractQuestionsFromPdf, mapToPreviewFormat };
