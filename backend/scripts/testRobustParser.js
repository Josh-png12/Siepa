/* eslint-disable no-console */
const path = require('path');
const { extractPagesFromPdf } = require('../src/services/pdfImportBatchService');
const { parseQuestionsFromText } = require('../src/services/robustQuestionParser');

const sampleText = `
PREGUNTA 1
En el siguiente texto, ¿cuál es la idea principal?
A) La energía solar se transforma en calor.
B ) El autor critica la educación pública.
(C) Se explica el ciclo del agua.
D- Ninguna de las anteriores.

Pregunta l.
Si x + 2 = 5, entonces x es:
A. 1
B. 2
C. 3
D. 4
`;

const runOnText = async () => {
  const parsed = await parseQuestionsFromText(sampleText, { page: 1, jobId: 'manual-test', debug: false });
  console.log('sample metrics:', parsed.metrics);
  console.log('sample detected:', parsed.questions.length);
  if (parsed.questions.length <= 0) {
    process.exitCode = 1;
  }
};

const runOnPdf = async (pdfPath) => {
  const abs = path.resolve(pdfPath);
  const pages = await extractPagesFromPdf(abs);
  let total = 0;

  for (const page of pages) {
    // eslint-disable-next-line no-await-in-loop
    const parsed = await parseQuestionsFromText(page.text, {
      page: page.page,
      jobId: 'manual-test',
      debug: true
    });
    total += parsed.questions.length;
    console.log(`page ${page.page}: ${parsed.questions.length} questions, method=${parsed.methodUsed}, reason=${parsed.reason}`);
  }

  console.log('total detected:', total);
  if (total <= 0) {
    console.error('No questions detected (>0 expected).');
    process.exitCode = 1;
  }
};

(async () => {
  try {
    const pdfArg = process.argv[2];
    if (!pdfArg) {
      await runOnText();
      return;
    }
    await runOnPdf(pdfArg);
  } catch (error) {
    console.error('test failed:', error?.message || error);
    process.exitCode = 1;
  }
})();

