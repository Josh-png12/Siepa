/* eslint-disable no-console */
const path = require('path');
const { extractTextByPage } = require('../src/services/pdfPageTextService');
const { buildRepeatedLinesSet, parseQuestionsFromPage } = require('../src/services/flexibleQuestionParser');

const sampleText = `
1. ¿Cuál es la idea principal del texto?
A) Opción uno
B) Opción dos
C) Opción tres
D) Opción cuatro
`;

const runSample = async () => {
  const repeated = buildRepeatedLinesSet([sampleText]);
  const parsed = await parseQuestionsFromPage({
    text: sampleText,
    page: 1,
    source: 'text',
    repeatedLines: repeated
  });
  console.log('sample metrics:', parsed.metrics);
  console.log('sample detected:', parsed.questions.length);
  if (parsed.questions.length <= 0) process.exitCode = 1;
};

const runPdf = async (pdfPath) => {
  const abs = path.resolve(pdfPath);
  const pages = await extractTextByPage(abs);
  const repeated = buildRepeatedLinesSet(pages.map((p) => p.text));

  let total = 0;
  for (const page of pages) {
    // eslint-disable-next-line no-await-in-loop
    const parsed = await parseQuestionsFromPage({
      text: page.text,
      page: page.page,
      source: 'text',
      repeatedLines: repeated
    });
    total += parsed.questions.length;
    console.log(`page ${page.page} density=${page.density} questions=${parsed.questions.length}`);
  }

  console.log('total detected:', total);
  if (total <= 0) {
    console.error('No questions detected (>0 expected).');
    process.exitCode = 1;
  }
};

(async () => {
  try {
    const arg = process.argv[2];
    if (!arg) {
      await runSample();
      return;
    }
    await runPdf(arg);
  } catch (error) {
    console.error('test failed:', error?.message || error);
    process.exitCode = 1;
  }
})();
