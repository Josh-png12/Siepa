const fs = require('fs/promises');
const path = require('path');
const ApiError = require('../utils/ApiError');
require('../utils/canvasShim');

const loadPdfJs = () => {
  try {
    return require('pdfjs-dist/legacy/build/pdf.js');
  } catch (_error) {
    throw new ApiError(500, 'DependencyMissing', ['pdfjs-dist no esta instalado']);
  }
};

const loadCanvas = () => {
  try {
    return require('canvas');
  } catch (_error) {
    try {
      return require('@napi-rs/canvas');
    } catch (_error2) {
      throw new ApiError(500, 'DependencyMissing', ['canvas no esta instalado']);
    }
  }
};

const loadTesseract = () => {
  try {
    return require('tesseract.js');
  } catch (_error) {
    throw new ApiError(500, 'DependencyMissing', ['tesseract.js no esta instalado']);
  }
};

const renderPageToImage = async ({ pdfPath, pageNumber, outPngPath, dpi = 200 }) => {
  const pdfjsLib = await loadPdfJs();
  const { createCanvas } = loadCanvas();

  const buffer = await fs.readFile(pdfPath);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const doc = await loadingTask.promise;
  const safePage = Math.min(Math.max(1, Number(pageNumber || 1)), Number(doc.numPages || 1));

  const page = await doc.getPage(safePage);
  const scale = Math.max(1.5, Number(dpi || 200) / 72);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');

  await page.render({ canvasContext: context, viewport }).promise;

  await fs.mkdir(path.dirname(outPngPath), { recursive: true });
  await fs.writeFile(outPngPath, canvas.toBuffer('image/png'));

  return {
    pageNumber: safePage,
    outPngPath
  };
};

const ocrImage = async ({ imagePath, lang = 'spa+eng', timeoutMs = 45000 }) => {
  const tesseract = loadTesseract();
  const imageBuffer = await fs.readFile(imagePath);
  const { createCanvas, loadImage } = loadCanvas();

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve({ data: { text: '' }, __timeout: true }), Math.max(5000, Number(timeoutMs) || 45000));
  });

  let canvas = null;
  try {
    const img = await loadImage(imageBuffer);
    canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
  } catch (_imageError) {
    // PNG is unreadable — likely corrupt output from a JBIG2/JPEG2000 page.
    // Passing the same corrupt buffer to Tesseract would crash its internal Worker
    // via MessagePort (uncatchable). Return empty text immediately.
    return { text: '', timedOut: false };
  }

  const isReadImageErr = (err) => {
    const msg = String(err?.message || '').toLowerCase();
    return msg.includes('read image') || msg.includes('failed to load image');
  };

  try {
    const result = await Promise.race([tesseract.recognize(canvas, lang), timeoutPromise]);
    return {
      text: String(result?.data?.text || '').trim(),
      timedOut: Boolean(result?.__timeout)
    };
  } catch (firstError) {
    if (isReadImageErr(firstError)) return { text: '', timedOut: false };
    // Fallback path for environments where direct recognize() input handling differs.
    if (typeof tesseract.createWorker !== 'function') throw firstError;

    const worker = await tesseract.createWorker(lang);
    try {
      const result = await Promise.race([worker.recognize(canvas), timeoutPromise]);
      return {
        text: String(result?.data?.text || '').trim(),
        timedOut: Boolean(result?.__timeout)
      };
    } catch (fallbackError) {
      if (isReadImageErr(fallbackError)) return { text: '', timedOut: false };
      throw fallbackError;
    } finally {
      await worker.terminate().catch(() => {});
    }
  }
};

const ocrPdfPageWithRetry = async ({
  pdfPath,
  pageNumber,
  outPngPath,
  lang = 'spa+eng',
  dpi = 200,
  pageTimeoutMs = 45000,
  maxRetries = 1
}) => {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const rendered = await renderPageToImage({ pdfPath, pageNumber, outPngPath, dpi });
      // eslint-disable-next-line no-await-in-loop
      const ocr = await ocrImage({ imagePath: rendered.outPngPath, lang, timeoutMs: pageTimeoutMs });
      return {
        pageNumber: rendered.pageNumber,
        text: ocr.text,
        timedOut: ocr.timedOut,
        attempts: attempt + 1,
        ok: true
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    pageNumber: Number(pageNumber || 1),
    text: '',
    timedOut: false,
    attempts: maxRetries + 1,
    ok: false,
    error: lastError?.message || 'ocr_page_failed'
  };
};

const ocrPdfPage = async ({
  filePath,
  pageNumber,
  lang = 'spa+eng',
  dpi = 200,
  pageTimeoutMs = 45000,
  outPngPath
}) => {
  const fallbackOut = outPngPath || path.join(process.cwd(), 'uploads', 'tmp', 'ocr', `page_${pageNumber}.png`);
  const result = await ocrPdfPageWithRetry({
    pdfPath: filePath,
    pageNumber,
    outPngPath: fallbackOut,
    lang,
    dpi,
    pageTimeoutMs,
    maxRetries: 1
  });

  return {
    pageNumber: result.pageNumber,
    text: String(result.text || '').trim()
  };
};

const ocrPdfPages = async ({
  filePath,
  lang = 'spa+eng',
  dpi = 180,
  maxPages = null,
  pageTimeoutMs = 45000,
  onProgress
}) => {
  const pdfjsLib = await loadPdfJs();
  const buffer = await fs.readFile(filePath);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const doc = await loadingTask.promise;

  const totalAll = Number(doc.numPages || 0);
  const totalPages = Number.isFinite(Number(maxPages)) && Number(maxPages) > 0
    ? Math.min(totalAll, Number(maxPages))
    : totalAll;

  const pages = [];
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const outPngPath = path.join(process.cwd(), 'uploads', 'tmp', 'ocr', `page_${pageNumber}.png`);
    // eslint-disable-next-line no-await-in-loop
    const page = await ocrPdfPageWithRetry({
      pdfPath: filePath,
      pageNumber,
      outPngPath,
      lang,
      dpi,
      pageTimeoutMs,
      maxRetries: 1
    });

    pages.push({ pageNumber, text: page.text || '' });

    if (typeof onProgress === 'function') {
      onProgress({
        currentPage: pageNumber,
        totalPages,
        percent: Math.round((pageNumber / Math.max(1, totalPages)) * 100)
      });
    }
  }

  return {
    pages,
    progress: {
      currentPage: totalPages,
      totalPages,
      percent: totalPages ? 100 : 0
    }
  };
};

module.exports = {
  renderPageToImage,
  ocrImage,
  ocrPdfPageWithRetry,
  ocrPdfPage,
  ocrPdfPages
};
