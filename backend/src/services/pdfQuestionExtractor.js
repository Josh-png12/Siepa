const fs = require('fs/promises');
const path = require('path');
require('../utils/canvasShim');
const { renderPageToImage } = require('./pdfOcrService');
const { extractQuestionsFromImage } = require('./replicateService');
const { extractImagesFromPdfPage } = require('./pdfImageExtractor');

const INTER_PAGE_DELAY_MS = 10000; // 10s para respetar rate limit de 6 req/min en Replicate
const loadPdfJs = () => require('pdfjs-dist/legacy/build/pdf.js');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Vision call (Replicate DeepSeek-VL) ─────────────────────────────────────

async function callVisionModel(base64Image, pageNum = 0) {
    try {
        const questions = await extractQuestionsFromImage(base64Image);
        console.log(`[PDF EXTRACTOR] Página ${pageNum}: ${questions.length} preguntas extraídas vía DeepSeek-VL`);
        return questions;
    } catch (err) {
        console.error(`[PDF EXTRACTOR ERROR] Página ${pageNum}:`, err.message);
        throw err;
    }
}

// ─── Mapping: DeepSeek-VL format → preview format ────────────────────────────

function mapToPreviewFormat(questions, imageUrls = []) {
    // Si hay imágenes extraídas, las asociamos a las preguntas de la página
    // (Asumimos que las preguntas de una página comparten las imágenes)
    return questions.map((q, idx) => {
        const opts = q.opciones || {};
        const options = ['A', 'B', 'C', 'D']
            .filter((k) => opts[k])
            .map((k) => ({ label: k, text: String(opts[k]).trim() }));

        let statement = String(q.pregunta || q.enunciado || '').trim();

        // Incluir descripción de imagen si existe (DeepSeek-VL)
        const imageDesc = q.imagen_descripcion || q.descripcion_imagen || null;
        if (imageDesc) {
            statement = `${statement}\n[Descripción de imagen: ${String(imageDesc).trim()}]`;
        }

        if (q.texto_base) {
            statement = `${String(q.texto_base).trim()}\n\n${statement}`;
        }

        const detectedAnswer = q.respuesta_correcta
            ? String(q.respuesta_correcta).trim().toUpperCase()
            : null;

        return {
            qNumber: Number(q.numero) || idx + 1,
            statement,
            options,
            detectedAnswer,
            area: 'General',
            competencia: 'General',
            nivelCognitivo: 'comprender',
            dificultadCualitativa: 'media',
            _source: 'deepseek-vl',
            imageDescription: imageDesc,
            // 🔥 NUEVO: URLs de las imágenes reales extraídas del PDF
            imageUrls: imageUrls // array de strings con las rutas
        };
    });
}

// ─── Main extraction pipeline ────────────────────────────────────────────────

async function extractQuestionsFromPdf({ filePath, maxPages = 50, onProgress }) {
    try {
        const apiKey = process.env.REPLICATE_API_TOKEN;
        if (!apiKey) throw new Error('REPLICATE_API_TOKEN no configurada. Agrega tu token en el archivo .env');

        console.log('[PDF EXTRACTOR] Cargando pdfjs...');
        const pdfjsLib = loadPdfJs();

        console.log(`[PDF EXTRACTOR] Leyendo archivo: ${filePath}`);
        const buffer = await fs.readFile(filePath);

        console.log('[PDF EXTRACTOR] Parseando documento PDF...');
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

        const totalAll = Number(doc.numPages || 0);
        const totalPages = Math.min(totalAll, Number(maxPages) || 50);
        console.log(`[PDF EXTRACTOR] Total páginas: ${totalAll}, procesando: ${totalPages}`);

        const tmpDir = path.join(process.cwd(), 'uploads', 'tmp', 'deepseek-extract');
        await fs.mkdir(tmpDir, { recursive: true });

        const imagesBaseDir = path.join(process.cwd(), 'uploads', 'extracted');
        await fs.mkdir(imagesBaseDir, { recursive: true });

        const allQuestions = [];
        let paginasConPreguntas = 0;

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            if (pageNum > 1) {
                console.log(`[PDF EXTRACTOR] Esperando ${INTER_PAGE_DELAY_MS / 1000}s antes de la siguiente página (rate limit)...`);
                await sleep(INTER_PAGE_DELAY_MS);
            }

            const outPngPath = path.join(tmpDir, `page_${Date.now()}_${pageNum}.png`);
            let extractedImageUrls = [];

            try {
                console.log(`[PDF EXTRACTOR] Renderizando página ${pageNum}/${totalPages}...`);

                // 1. Renderizar página para enviar a DeepSeek-VL
                await renderPageToImage({
                    pdfPath: filePath,
                    pageNumber: pageNum,
                    outPngPath,
                    dpi: 150
                });

                const imageBuffer = await fs.readFile(outPngPath);
                const base64 = imageBuffer.toString('base64');

                console.log(`[PDF EXTRACTOR] Enviando página ${pageNum} a DeepSeek-VL (${Math.round(base64.length / 1024)} KB)...`);
                const pageQuestions = await callVisionModel(base64, pageNum);

                // 2. Extraer imágenes reales de la página (diagramas, gráficos, etc.)
                console.log(`[PDF EXTRACTOR] Extrayendo imágenes incrustadas de página ${pageNum}...`);
                const imageUrls = await extractImagesFromPdfPage(
                    filePath,
                    pageNum,
                    imagesBaseDir,
                    `page_${pageNum}`
                );
                extractedImageUrls = imageUrls;

                if (pageQuestions.length === 0) {
                    console.log(`[PDF EXTRACTOR] Página ${pageNum}: 0 preguntas encontradas (posiblemente portada o sin preguntas)`);
                } else {
                    console.log(`[PDF EXTRACTOR] Página ${pageNum}: ${pageQuestions.length} preguntas encontradas, ${imageUrls.length} imágenes extraídas`);
                    paginasConPreguntas++;
                    
                    // Asociar las imágenes a las preguntas de esta página
                    const mappedQuestions = mapToPreviewFormat(pageQuestions, imageUrls);
                    allQuestions.push(...mappedQuestions);
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