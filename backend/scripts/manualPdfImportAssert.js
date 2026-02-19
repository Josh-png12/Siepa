const fs = require('fs');
const path = require('path');
const { parseMultiAreaPDF } = require('../src/services/pdfImportBatchService');

const args = process.argv.slice(2);
const questionsPdfArg = args[0];
const answersPdfArg = args[1] && !args[1].startsWith('--') ? args[1] : '';
const forceOcr = args.includes('--force-ocr');

if (!questionsPdfArg) {
  // eslint-disable-next-line no-console
  console.error('Uso: node scripts/manualPdfImportAssert.js <questions.pdf> [answers.pdf] [--force-ocr]');
  process.exit(1);
}

const questionsPdfPath = path.resolve(questionsPdfArg);
const answersPdfPath = answersPdfArg ? path.resolve(answersPdfArg) : '';

if (!fs.existsSync(questionsPdfPath)) {
  // eslint-disable-next-line no-console
  console.error(`No existe questions.pdf: ${questionsPdfPath}`);
  process.exit(1);
}

if (answersPdfPath && !fs.existsSync(answersPdfPath)) {
  // eslint-disable-next-line no-console
  console.error(`No existe answers.pdf: ${answersPdfPath}`);
  process.exit(1);
}

(async () => {
  try {
    const preview = await parseMultiAreaPDF(questionsPdfPath, answersPdfPath, { forceOcr });
    const total = Number(preview?.detectedQuestions?.length || preview?.questions?.length || 0);

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      ocrUsed: Boolean(preview?.ocrUsed),
      totalDetected: total,
      pages: Number(preview?.totals?.pages || 0),
      warnings: preview?.warnings || [],
      progress: preview?.progress || {}
    }, null, 2));

    if (total <= 0) {
      throw new Error('assert failed: detectedQuestions.length > 0');
    }

    // eslint-disable-next-line no-console
    console.log('ASSERT OK: detectedQuestions.length > 0');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('ASSERT FAIL:', error.message || error);
    process.exit(1);
  }
})();
