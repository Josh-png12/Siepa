const fs = require('fs/promises');
const path = require('path');

const QUESTION_START_RE = /^\s*(\d{1,3})[\.\)]\s+/;
const OPTION_START_RE = /^\s*([A-D])[\.\)]\s+/i;

const normalizeLine = (line) => String(line || '').replace(/\s+/g, ' ').trim();

const normalizeTextForParser = (text) => String(text || '')
  .replace(/\r\n?/g, '\n')
  .replace(/\u00A0/g, ' ')
  .replace(/[ \t]{2,}/g, ' ')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const buildRepeatedLinesSet = (allPagesText = []) => {
  const counter = new Map();
  allPagesText.forEach((text) => {
    normalizeTextForParser(text).split('\n').forEach((line) => {
      const key = normalizeLine(line).toUpperCase();
      if (!key || key.length < 4 || key.length > 120) return;
      counter.set(key, (counter.get(key) || 0) + 1);
    });
  });

  const threshold = Math.max(2, Math.floor(allPagesText.length * 0.5));
  const repeated = new Set();
  counter.forEach((count, key) => {
    if (count >= threshold) repeated.add(key);
  });
  return repeated;
};

const parseQuestionsFromPage = ({
  text,
  page,
  source,
  repeatedLines = new Set(),
  ocrCorrections = 0
}) => {
  const lines = normalizeTextForParser(text)
    .split('\n')
    .map((line) => normalizeLine(line))
    .filter((line) => {
      if (!line) return false;
      if (/^\d{1,3}$/.test(line)) return false;
      return !repeatedLines.has(line.toUpperCase());
    });

  const questions = [];
  let current = null;
  let currentOption = null;
  let anchorsQuestions = 0;
  let anchorsOptions = 0;

  const finalize = () => {
    if (!current) return;

    ['A', 'B', 'C', 'D'].forEach((label) => {
      current.options[label] = normalizeLine(current.options[label] || '');
    });
    current.stem = normalizeLine(current.stem);

    const optionsCount = ['A', 'B', 'C', 'D'].filter((label) => current.options[label]).length;
    const flags = [...current.flags];
    if (optionsCount < 4) flags.push('missing_options');

    let confidence = 0.4;
    confidence += optionsCount * 0.15;
    if (optionsCount === 4) confidence += 0.1;
    if (current.stem.length < 20) confidence -= 0.2;
    if (ocrCorrections > 3) confidence -= 0.1;
    confidence = Math.max(0, Math.min(1, Number(confidence.toFixed(2))));

    questions.push({
      number: current.number,
      stem: current.stem,
      options: current.options,
      pageStart: page,
      source,
      confidence,
      flags
    });

    current = null;
    currentOption = null;
  };

  for (const line of lines) {
    const qMatch = line.match(QUESTION_START_RE);
    if (qMatch) {
      anchorsQuestions += 1;
      finalize();
      current = {
        number: Number(qMatch[1]),
        stem: normalizeLine(line.replace(QUESTION_START_RE, '')),
        options: { A: '', B: '', C: '', D: '' },
        flags: []
      };
      continue;
    }

    if (!current) continue;

    const oMatch = line.match(OPTION_START_RE);
    if (oMatch) {
      anchorsOptions += 1;
      const label = String(oMatch[1] || '').toUpperCase();
      const value = normalizeLine(line.replace(OPTION_START_RE, ''));
      if (current.options[label]) {
        if (value.length > current.options[label].length) current.options[label] = value;
        current.flags.push(`duplicate_option_${label}`);
      } else {
        current.options[label] = value;
      }
      currentOption = label;
      continue;
    }

    if (currentOption && current.options[currentOption] !== undefined) {
      current.options[currentOption] = normalizeLine(`${current.options[currentOption]} ${line}`);
    } else {
      current.stem = normalizeLine(`${current.stem} ${line}`);
    }
  }

  finalize();

  return {
    questions,
    metrics: {
      page,
      anchorsQuestions,
      anchorsOptions,
      methodUsed: 'flex_line_parser',
      source,
      questionsDetected: questions.length
    }
  };
};

const savePageDebug = async ({ jobId, page, normalizedText, metrics, baseTmpDir = '' }) => {
  if (!jobId) return;
  const base = baseTmpDir
    ? path.join(baseTmpDir, String(jobId), 'debug')
    : path.join(process.cwd(), 'uploads', 'tmp', String(jobId), 'debug');

  await fs.mkdir(base, { recursive: true });
  await fs.writeFile(path.join(base, `page_${page}.txt`), String(normalizedText || ''), 'utf8');
  await fs.writeFile(path.join(base, `page_${page}.json`), JSON.stringify(metrics || {}, null, 2), 'utf8');
};

module.exports = {
  QUESTION_START_RE,
  OPTION_START_RE,
  normalizeTextForParser,
  buildRepeatedLinesSet,
  parseQuestionsFromPage,
  savePageDebug
};
