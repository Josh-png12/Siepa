const fs = require('fs/promises');
const path = require('path');
const { parentPort, workerData } = require('worker_threads');
const { parsePreviewFromPages } = require('../services/pdfImportBatchService');
const { extractTextByPage, normalizePageText } = require('../services/pdfPageTextService');
const {
  buildRepeatedLinesSet,
  parseQuestionsFromPage,
  savePageDebug
} = require('../services/flexibleQuestionParser');
const { ocrPdfPageWithRetry } = require('../services/pdfOcrService');

const isImageError = (msg) => {
  const s = String(msg || '').toLowerCase();
  return s.includes('read image') || s.includes('failed to load image') || s.includes('image');
};

process.on('uncaughtException', (err) => {
  if (isImageError(err.message)) {
    // Tesseract internal Worker emitted an image-decode error via MessagePort.
    // The pending ocrImage() call will resolve via its timeout with empty text.
    console.warn('[WORKER] uncaughtException: imagen no soportada (JBIG2/JPEG2000), continuando...');
    return;
  }
  console.error('[WORKER CRASH] uncaughtException:', err.message, err.stack);
  if (parentPort) parentPort.postMessage({ type: 'error', error: err.message });
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  if (isImageError(reason?.message || String(reason))) {
    console.warn('[WORKER] unhandledRejection: imagen no soportada, continuando...');
    return;
  }
  console.error('[WORKER CRASH] unhandledRejection:', reason);
  if (parentPort) parentPort.postMessage({ type: 'error', error: String(reason) });
  process.exit(1);
});

let cancelRequested = false;
if (parentPort) {
  parentPort.on('message', (message) => {
    if (message?.type === 'cancel') cancelRequested = true;
  });
}

const ensureNotCanceled = () => {
  if (cancelRequested) {
    const err = new Error('OCR job cancelado');
    err.code = 'JOB_CANCELED';
    throw err;
  }
};

const normalizeForMatch = (text) => String(text || '')
  .replace(/\r\n?/g, '\n')
  .replace(/\u00A0/g, ' ')
  .replace(/[ \t]{2,}/g, ' ')
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase();

const sendProgress = (currentPage, totalPages) => {
  if (!parentPort) return;
  const total = Math.max(0, Number(totalPages || 0));
  const current = Math.max(0, Number(currentPage || 0));
  parentPort.postMessage({
    type: 'progress',
    currentPage: current,
    totalPages: total,
    percent: total ? Math.round((current / total) * 100) : 0
  });
};

const mapFlexibleQuestion = (q, areaGuess = 'Sin clasificar') => ({
  number: Number.isFinite(Number(q?.number)) && Number(q.number) > 0 ? Number(q.number) : null,
  text: String(q?.stem || '').trim(),
  page: Number(q?.pageStart || 0),
  areaGuess,
  competenciaGuess: 'Sin clasificar',
  nivelGuess: 'comprender',
  answerGuess: null,
  options: ['A', 'B', 'C', 'D']
    .filter((label) => String(q?.options?.[label] || '').trim())
    .map((label) => ({ label, text: String(q.options[label] || '').trim() })),
  confidence: Number(q?.confidence || 0),
  flags: Array.isArray(q?.flags)
    ? q.flags.map((f) => String(f || '').toUpperCase())
    : []
});

const detectNeedsOcr = ({ text, density, threshold }) => {
  const clean = String(text || '').replace(/\s/g, '');
  return Number(density || 0) < threshold || clean.length < 40;
};

const run = async () => {
  try {
    const {
      jobId = '',
      pdfPath,
      answersPdfPath = '',
      config = {}
    } = workerData || {};

    console.log('[WORKER] Job iniciado:', jobId);
    console.log('[WORKER] pdfPath:', pdfPath);
    try {
      const { statSync } = require('fs');
      const stat = statSync(pdfPath);
      console.log('[WORKER] Tamaño en disco:', stat.size, 'bytes');
    } catch (statErr) {
      console.error('[WORKER] ERROR al leer archivo:', statErr.message);
    }

    const densityThreshold = Number(config.ocrDensityThreshold || process.env.PDF_OCR_DENSITY_THRESHOLD || 200);
    const dpi = Number(config.ocrDpi || process.env.PDF_OCR_DPI || 200);
    const pageTimeoutMs = Number(config.pageTimeoutMs || process.env.PDF_OCR_PAGE_TIMEOUT_MS || 45000);
    const lang = String(config.ocrLang || process.env.PDF_OCR_LANG || 'spa+eng');

    const tmpJobDir = path.join(process.cwd(), 'uploads', 'tmp', String(jobId || 'adhoc'));
    const ocrImageDir = path.join(tmpJobDir, 'ocr-images');
    const debugDir = path.join(tmpJobDir, 'debug');
    await fs.mkdir(ocrImageDir, { recursive: true });
    await fs.mkdir(debugDir, { recursive: true });

    const pages = await extractTextByPage(pdfPath);
    const totalPages = Number(pages.length || 0);

    console.log('[WORKER] PDF cargado, iniciando procesamiento...');
    console.log('[WORKER] Total páginas:', totalPages);

    if (!totalPages) {
      const emptyResult = await parsePreviewFromPages({
        pagesInput: [],
        answersPdfPath,
        hints: config,
        ocrUsed: false,
        progress: { currentPage: 0, totalPages: 0, percent: 0 },
        preDetectedQuestions: [],
        reason: 'no_text_layer',
        debugMeta: {
          metricsByPage: [],
          stats: { pagesText: 0, pagesOcr: 0, pagesFailedOcr: 0 }
        }
      });
      emptyResult.detectedQuestions = [];
      emptyResult.blocksDetected = [];
      emptyResult.stats = {
        ...(emptyResult.stats || {}),
        pagesText: 0,
        pagesOcr: 0,
        pagesFailedOcr: 0
      };
      emptyResult.diagnosisIfZero = {
        reason: 'no_text_layer',
        metrics: { pagesText: 0, pagesOcr: 0, pagesFailedOcr: 0, totalPages: 0 }
      };
      if (parentPort) parentPort.postMessage({ type: 'done', result: emptyResult });
      return;
    }

    const repeatedLines = buildRepeatedLinesSet(pages.map((p) => p.text));

    let pagesText = 0;
    let pagesOcr = 0;
    let pagesFailedOcr = 0;
    let usedOcr = false;

    const pagesInput = [];
    const detectedQuestions = [];
    const metricsByPage = [];

    for (let idx = 0; idx < pages.length; idx += 1) {
      ensureNotCanceled();

      const page = pages[idx];
      const pageNumber = Number(page.page || idx + 1);
      const needsOcr = detectNeedsOcr({ text: page.text, density: page.density, threshold: densityThreshold });

      console.log(`[WORKER] Procesando página ${pageNumber} / ${totalPages} | density=${page.density} needsOcr=${needsOcr}`);

      let finalText = normalizePageText(page.text);
      let source = 'text';
      let ocrError = '';

      if (needsOcr) {
        usedOcr = true;
        pagesOcr += 1;
        const outPngPath = path.join(ocrImageDir, `page_${pageNumber}.png`);
        try {
          // eslint-disable-next-line no-await-in-loop
          const ocrResult = await ocrPdfPageWithRetry({
            pdfPath,
            pageNumber,
            outPngPath,
            lang,
            dpi,
            pageTimeoutMs,
            maxRetries: 1
          });

          if (ocrResult.ok && String(ocrResult.text || '').trim()) {
            finalText = normalizePageText(ocrResult.text);
            source = 'ocr';
          } else {
            pagesFailedOcr += 1;
            ocrError = String(ocrResult.error || (ocrResult.timedOut ? 'ocr_timeout' : 'ocr_empty'));
            source = 'text';
          }
        } catch (pageErr) {
          const msg = String(pageErr.message || '').toLowerCase();
          if (msg.includes('read image') || msg.includes('image')) {
            console.warn(`[WORKER] Página ${pageNumber} - imagen JBIG2/JPEG2000 no soportada, usando texto nativo`);
            pagesFailedOcr += 1;
            ocrError = 'unsupported_image_format';
            source = 'text';
            // finalText retains whatever getTextContent() extracted (may be empty)
          } else {
            throw pageErr;
          }
        }
      } else {
        pagesText += 1;
      }

      console.log(`[WORKER] Página procesada: ${pageNumber} / ${totalPages} | source=${source}${ocrError ? ` error=${ocrError}` : ''}`);

      // eslint-disable-next-line no-await-in-loop
      const parsed = await parseQuestionsFromPage({
        text: finalText,
        page: pageNumber,
        source,
        repeatedLines
      });

      parsed.questions.forEach((q) => detectedQuestions.push(mapFlexibleQuestion(q)));

      const pageMetric = {
        page: pageNumber,
        density: Number(page.density || 0),
        needsOcr,
        source,
        ocrError,
        questionsDetected: parsed.questions.length,
        anchorsQuestions: Number(parsed.metrics?.anchorsQuestions || 0),
        anchorsOptions: Number(parsed.metrics?.anchorsOptions || 0),
        methodUsed: String(parsed.metrics?.methodUsed || 'flex_line_parser')
      };

      metricsByPage.push(pageMetric);

      // eslint-disable-next-line no-await-in-loop
      await savePageDebug({
        jobId,
        page: pageNumber,
        normalizedText: finalText,
        metrics: pageMetric,
        baseTmpDir: path.join(process.cwd(), 'uploads', 'tmp')
      });

      pagesInput.push({
        page: pageNumber,
        text: finalText,
        normalized: normalizeForMatch(finalText),
        needsOcr: source === 'ocr'
      });

      console.log(`[PDF_IMPORT][job:${jobId}] page=${pageNumber} density=${page.density} source=${source} needsOcr=${needsOcr} questions=${parsed.questions.length}${ocrError ? ` ocrError=${ocrError}` : ''}`);
      sendProgress(idx + 1, totalPages);
    }

    ensureNotCanceled();

    const preview = await parsePreviewFromPages({
      pagesInput,
      answersPdfPath,
      hints: config,
      ocrUsed: usedOcr,
      progress: {
        currentPage: totalPages,
        totalPages,
        percent: totalPages ? 100 : 0
      },
      preDetectedQuestions: detectedQuestions,
      reason: detectedQuestions.length ? '' : 'pattern_not_found',
      debugMeta: {
        metricsByPage,
        stats: { pagesText, pagesOcr, pagesFailedOcr }
      }
    });

    const diagnosisIfZero = (() => {
      if (detectedQuestions.length > 0) return null;
      const noTextLayer = pages.every((p) => Number(p.density || 0) < densityThreshold);
      if (noTextLayer && pagesOcr === 0) {
        return {
          reason: 'no_text_layer',
          metrics: { totalPages, pagesText, pagesOcr, pagesFailedOcr, densityThreshold }
        };
      }
      if (pagesOcr > 0 && pagesFailedOcr >= pagesOcr) {
        return {
          reason: 'ocr_failed',
          metrics: { totalPages, pagesText, pagesOcr, pagesFailedOcr, densityThreshold }
        };
      }
      return {
        reason: 'pattern_not_found',
        metrics: { totalPages, pagesText, pagesOcr, pagesFailedOcr, densityThreshold }
      };
    })();

    preview.detectedQuestions = preview.detectedQuestions || preview.questions || [];
    preview.blocksDetected = preview.blocksDetected || preview.blocks || [];
    preview.previewBlocks = preview.blocksDetected;
    preview.questionsDetected = preview.detectedQuestions;
    preview.stats = {
      ...(preview.stats || {}),
      pagesText,
      pagesOcr,
      pagesFailedOcr
    };
    preview.diagnosisIfZero = diagnosisIfZero || undefined;

    if (parentPort) parentPort.postMessage({ type: 'done', result: preview });
  } catch (error) {
    if (error?.code === 'JOB_CANCELED' || cancelRequested) {
      if (parentPort) {
        parentPort.postMessage({ type: 'canceled', error: 'OCR job cancelado' });
      }
      return;
    }

    if (parentPort) {
      parentPort.postMessage({
        type: 'error',
        error: error?.message || 'OCR worker failed'
      });
    }
  }
};

run();
