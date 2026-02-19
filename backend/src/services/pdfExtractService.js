const fs = require('fs/promises');
const path = require('path');
const ApiError = require('../utils/ApiError');

const PDF_TEXT_THRESHOLD = Number(process.env.PDF_TEXT_THRESHOLD || 200);
const PDF_OCR_ENGINE = String(process.env.PDF_OCR_ENGINE || 'auto').toLowerCase();

const getPdfParse = () => {
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    return require('pdf-parse');
  } catch (_error) {
    throw new ApiError(500, 'DependencyMissing', [
      'pdf-parse no esta instalado en backend/package.json'
    ]);
  }
};

const getPdf2Pic = () => {
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    return require('pdf2pic');
  } catch (_error) {
    throw new ApiError(500, 'DependencyMissing', [
      'pdf2pic no esta instalado para OCR de PDF escaneado'
    ]);
  }
};

const getTesseract = () => {
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    return require('tesseract.js');
  } catch (_error) {
    throw new ApiError(500, 'DependencyMissing', [
      'tesseract.js no esta instalado para OCR de PDF escaneado'
    ]);
  }
};

const extractTextFromPdf = async (filePath) => {
  const pdfParse = getPdfParse();
  const buffer = await fs.readFile(filePath);
  const parsed = await pdfParse(buffer);
  return {
    text: String(parsed.text || '').trim(),
    pages: Number(parsed.numpages || 0)
  };
};

const performOcr = async ({ filePath, outputDir }) => {
  const { fromPath } = getPdf2Pic();
  const tesseract = getTesseract();

  const imageDir = path.join(outputDir, 'ocr-pages');
  await fs.mkdir(imageDir, { recursive: true });

  const converter = fromPath(filePath, {
    density: 200,
    format: 'png',
    width: 1800,
    height: 2400,
    savePath: imageDir,
    saveFilename: 'page'
  });

  const convertedPages = await converter.bulk(-1, { responseType: 'image' });
  const pages = Array.isArray(convertedPages) ? convertedPages.length : 0;
  const chunks = [];

  for (const pageResult of convertedPages || []) {
    const imagePath = pageResult.path || pageResult?.name || '';
    if (!imagePath) continue;
    // OCR secuencial para no saturar memoria del servidor.
    // eslint-disable-next-line no-await-in-loop
    const result = await tesseract.recognize(imagePath, 'spa+eng');
    chunks.push(String(result?.data?.text || '').trim());
  }

  return {
    text: chunks.join('\n').trim(),
    pages
  };
};

const extract = async ({ filePath, outputDir }) => {
  const direct = await extractTextFromPdf(filePath);
  const hasEnoughNativeText = direct.text.length >= PDF_TEXT_THRESHOLD;

  if (hasEnoughNativeText) {
    return {
      text: direct.text,
      pages: direct.pages,
      isScanned: false,
      ocrEngine: 'pdfText'
    };
  }

  if (!['auto', 'tesseract'].includes(PDF_OCR_ENGINE)) {
    throw new ApiError(400, 'ValidationError', [
      `PDF_OCR_ENGINE invalido: ${PDF_OCR_ENGINE}`
    ]);
  }

  const ocr = await performOcr({ filePath, outputDir });
  if (!ocr.text) {
    throw new ApiError(422, 'ExtractionFailed', [
      'No se pudo extraer texto del PDF (OCR sin resultados)'
    ]);
  }

  return {
    text: ocr.text,
    pages: ocr.pages || direct.pages,
    isScanned: true,
    ocrEngine: 'tesseract'
  };
};

module.exports = {
  extract
};
