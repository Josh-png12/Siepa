const fs = require('fs/promises');
const ApiError = require('../utils/ApiError');
require('../utils/canvasShim');

const normalizePageText = (text) => String(text || '')
  .replace(/\r\n?/g, '\n')
  .replace(/\u00A0/g, ' ')
  .replace(/[ \t]{2,}/g, ' ')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const countDensity = (text) => (String(text || '').match(/[A-Za-z0-9]/g) || []).length;

const loadPdfJs = () => {
  try {
    return require('pdfjs-dist/legacy/build/pdf.js');
  } catch (_error) {
    throw new ApiError(500, 'DependencyMissing', ['pdfjs-dist no esta instalado']);
  }
};

const pageItemsToText = (items) => {
  const rows = new Map();

  (items || []).forEach((item) => {
    const str = String(item?.str || '').trim();
    if (!str) return;

    const x = Number(item?.transform?.[4] || 0);
    const y = Number(item?.transform?.[5] || 0);
    const rowKey = Math.round(y / 2) * 2;
    const row = rows.get(rowKey) || [];
    row.push({ str, x, y, transform: item?.transform });
    rows.set(rowKey, row);
  });

  return Array.from(rows.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => row.sort((a, b) => a.x - b.x).map((t) => t.str).join(' '))
    .join('\n');
};

const extractTextByPage = async (pdfPath) => {
  const pdfjsLib = await loadPdfJs();
  const buffer = await fs.readFile(pdfPath);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const doc = await loadingTask.promise;

  const pages = [];
  for (let pageNumber = 1; pageNumber <= Number(doc.numPages || 0); pageNumber += 1) {
    // eslint-disable-next-line no-await-in-loop
    const page = await doc.getPage(pageNumber);
    // eslint-disable-next-line no-await-in-loop
    const content = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
    const text = normalizePageText(pageItemsToText(content.items || []));

    pages.push({
      page: pageNumber,
      text,
      density: countDensity(text),
      textItems: (content.items || []).map((item) => ({
        str: item?.str,
        transform: item?.transform,
        x: Number(item?.transform?.[4] || 0),
        y: Number(item?.transform?.[5] || 0)
      }))
    });
  }

  return pages;
};

module.exports = {
  extractTextByPage,
  normalizePageText,
  countDensity
};
