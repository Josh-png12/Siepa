const fs = require('fs/promises');
const path = require('path');

const QUESTION_ANCHOR = /^(?:\s*(?:pregunta\s*)?)\(?\s*([0-9OIlS]{1,3})\s*(?:[\)\.\-:]|\b)/i;
const QUESTION_ANCHOR_INLINE = /(?:^|\n)\s*(?:pregunta\s*)?\(?\s*([0-9OIlS]{1,3})\s*(?:[\)\.\-:]|\b)/gi;
const OPTION_ANCHOR = /^\(?\s*([ABCD])\s*[\)\.\-:]\s*/i;
const OPTION_ANCHOR_INLINE = /(?:^|\n)\s*\(?\s*([ABCD])\s*[\)\.\-:]\s*/gi;

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const toClean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const normalizeQuestionNumberToken = (token) => String(token || '')
  .replace(/[oO]/g, '0')
  .replace(/[iIlL]/g, '1')
  .replace(/[sS]/g, '5');

const normalizeTextForParsing = (text) => {
  let out = String(text || '');
  out = out.replace(/\r\n?/g, '\n');
  out = out.replace(/\u00A0/g, ' ');
  out = out.replace(/[\t\f\v]+/g, ' ');

  // OCR repairs around question numbering
  out = out.replace(/(^|\n)\s*[lI]\s*([\)\.\-:])/g, '$11$2');
  out = out.replace(/(^|\n)\s*(pregunta\s+)[lI](\s*[\)\.\-:]?)/gi, '$1$21$3');
  out = out.replace(/(^|\n)\s*(pregunta\s+)([oO])(\s*[\)\.\-:]?)/gi, '$1$20$4');

  // Normalize option markers at line start
  out = out.replace(/(^|\n)\s*\(?\s*([ABCD])\s*\)?\s*[\)\-:]+\s*/g, '$1$2. ');
  out = out.replace(/(^|\n)\s*\(?\s*([ABCD])\s*\)?\s+([A-Za-zÁÉÍÓÚáéíóúÑñ])/g, '$1$2. $3');

  out = out.replace(/[ ]{2,}/g, ' ');
  out = out.replace(/\n[ ]+/g, '\n');
  out = out.replace(/[ ]+\n/g, '\n');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
};

const removeRepeatedNoiseLines = (lines) => {
  const keyOf = (line) => toClean(line).toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ');
  const counts = new Map();
  lines.forEach((line) => {
    const key = keyOf(line);
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return lines.filter((line) => {
    const clean = toClean(line);
    if (!clean) return false;
    const key = keyOf(line);
    const repeated = (counts.get(key) || 0) >= 3 && clean.length <= 80;
    const likelyPageNumber = /^\d{1,3}$/.test(clean);
    const likelyWatermark = /ICFES|SIEPA|CUADERNILLO|PROHIBIDA SU REPRODUCCION/i.test(clean) && clean.length < 90;
    return !repeated && !likelyPageNumber && !likelyWatermark;
  });
};

const parseQuestionsFromLines = (lines, page) => {
  const questions = [];
  let current = null;
  let currentOption = null;

  const flush = () => {
    if (!current) return;

    ['A', 'B', 'C', 'D'].forEach((label) => {
      current.options[label] = toClean(current.options[label] || '');
    });
    current.statementText = toClean(current.statementText);

    const optionCount = ['A', 'B', 'C', 'D'].filter((label) => current.options[label]).length;
    if (optionCount < 4) current.flags.push('missing_options');

    let confidence = 0.4;
    confidence += optionCount * 0.15;
    if (optionCount === 4) confidence += 0.1;
    if (current.statementText.length < 20) confidence -= 0.2;
    if (current.ocrCorrections > 3) confidence -= 0.1;
    current.confidence = clamp(Number(confidence.toFixed(2)), 0, 1);

    delete current.ocrCorrections;
    questions.push(current);
    current = null;
    currentOption = null;
  };

  lines.forEach((line) => {
    const clean = toClean(line);
    if (!clean) return;

    const qMatch = clean.match(QUESTION_ANCHOR);
    if (qMatch) {
      flush();
      const rawToken = qMatch[1];
      const repaired = normalizeQuestionNumberToken(rawToken);
      const number = Number.parseInt(repaired, 10);
      current = {
        number: Number.isFinite(number) ? number : null,
        statementText: toClean(clean.replace(QUESTION_ANCHOR, '')),
        options: { A: '', B: '', C: '', D: '' },
        page,
        confidence: 0,
        flags: [],
        ocrCorrections: repaired !== rawToken ? 1 : 0
      };
      currentOption = null;
      return;
    }

    if (!current) return;

    const optMatch = clean.match(OPTION_ANCHOR);
    if (optMatch) {
      const label = String(optMatch[1] || '').toUpperCase();
      const value = toClean(clean.replace(OPTION_ANCHOR, ''));

      if (current.options[label]) {
        if (value.length > current.options[label].length) {
          current.options[label] = value;
        }
        current.flags.push(`duplicate_option_${label}`);
      } else {
        current.options[label] = value;
      }
      currentOption = label;
      return;
    }

    if (currentOption && current.options[currentOption]) {
      current.options[currentOption] = toClean(`${current.options[currentOption]} ${clean}`);
      return;
    }

    current.statementText = toClean(`${current.statementText} ${clean}`);
  });

  flush();
  return questions;
};

const parseWithSlidingWindow = (normalizedText, page) => {
  const chunks = [];
  const matches = [...normalizedText.matchAll(QUESTION_ANCHOR_INLINE)];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index;
    const end = matches[i + 1] ? matches[i + 1].index : normalizedText.length;
    chunks.push(normalizedText.slice(start, end));
  }

  const result = [];
  chunks.forEach((chunk) => {
    const firstLine = chunk.split('\n')[0] || '';
    const qMatch = firstLine.match(QUESTION_ANCHOR);
    if (!qMatch) return;

    const number = Number.parseInt(normalizeQuestionNumberToken(qMatch[1]), 10);
    const options = { A: '', B: '', C: '', D: '' };
    const optionMatches = [...chunk.matchAll(OPTION_ANCHOR_INLINE)];

    let statementText = toClean(chunk.replace(firstLine, '').slice(0, optionMatches[0]?.index || chunk.length));
    if (!statementText) {
      statementText = toClean(firstLine.replace(QUESTION_ANCHOR, ''));
    }

    optionMatches.forEach((match, idx) => {
      const label = String(match[1] || '').toUpperCase();
      const start = match.index + match[0].length;
      const end = optionMatches[idx + 1] ? optionMatches[idx + 1].index : chunk.length;
      options[label] = toClean(chunk.slice(start, end));
    });

    const optionCount = ['A', 'B', 'C', 'D'].filter((l) => options[l]).length;
    let confidence = 0.4 + (optionCount * 0.15);
    if (optionCount === 4) confidence += 0.1;
    if (statementText.length < 20) confidence -= 0.2;

    result.push({
      number: Number.isFinite(number) ? number : null,
      statementText,
      options,
      page,
      confidence: clamp(Number(confidence.toFixed(2)), 0, 1),
      flags: optionCount < 4 ? ['missing_options', 'sliding_window_fallback'] : ['sliding_window_fallback']
    });
  });

  return result;
};

const maybeReorderColumns = (textOrItems) => {
  if (Array.isArray(textOrItems) && textOrItems.length) {
    const rowsByY = new Map();
    textOrItems.forEach((item) => {
      const str = toClean(item?.str || '');
      if (!str) return;
      const y = Number(item?.y ?? item?.transform?.[5] ?? 0);
      const x = Number(item?.x ?? item?.transform?.[4] ?? 0);
      const key = Math.round(y / 2) * 2;
      const row = rowsByY.get(key) || [];
      row.push({ str, x, y });
      rowsByY.set(key, row);
    });

    const rows = Array.from(rowsByY.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, row]) => row.sort((a, b) => a.x - b.x));

    const xs = rows.flat().map((t) => t.x).sort((a, b) => a - b);
    if (!xs.length) return { text: '', used: false, method: 'none' };
    const medianX = xs[Math.floor(xs.length / 2)];

    const left = [];
    const right = [];
    rows.forEach((tokens) => {
      const lineText = tokens.map((t) => t.str).join(' ').replace(/\s+/g, ' ').trim();
      const avgX = tokens.reduce((acc, t) => acc + t.x, 0) / Math.max(1, tokens.length);
      if (!lineText) return;
      if (avgX <= medianX) left.push(lineText);
      else right.push(lineText);
    });

    if (left.length && right.length) {
      return {
        text: `${left.join('\n')}\n${right.join('\n')}`,
        used: true,
        method: 'pdfjs_items_columns'
      };
    }
  }

  const text = String(textOrItems || '');
  const lines = text.split('\n');
  const left = [];
  const right = [];

  lines.forEach((line) => {
    const parts = line.split(/\t+|\s{3,}/).map((p) => toClean(p)).filter(Boolean);
    if (parts.length >= 2) {
      left.push(parts[0]);
      right.push(parts.slice(1).join(' '));
    } else if (parts.length === 1) {
      left.push(parts[0]);
    }
  });

  if (left.length > 2 && right.length > 2) {
    return {
      text: `${left.join('\n')}\n${right.join('\n')}`,
      used: true,
      method: 'text_gap_columns'
    };
  }

  return { text, used: false, method: 'none' };
};

const writeDebugArtifacts = async ({ jobId, page, normalizedText, metrics }) => {
  if (!jobId) return;
  const baseDir = path.join(process.cwd(), 'uploads', 'tmp', 'debug', String(jobId));
  await fs.mkdir(baseDir, { recursive: true });
  await fs.writeFile(path.join(baseDir, `page_${page}.txt`), String(normalizedText || ''), 'utf8');
  await fs.writeFile(path.join(baseDir, `page_${page}.json`), JSON.stringify(metrics, null, 2), 'utf8');
};

const parseQuestionsFromText = async (text, { page = 1, jobId = '', debug = false, textItems = null } = {}) => {
  const normalized = normalizeTextForParsing(text);
  const lines = removeRepeatedNoiseLines(normalized.split('\n').map((line) => toClean(line)));

  let methodUsed = 'direct';
  let questions = parseQuestionsFromLines(lines, page);

  if (!questions.length) {
    const reordered = maybeReorderColumns(Array.isArray(textItems) && textItems.length ? textItems : normalized);
    if (reordered.used) {
      const normalizedReordered = normalizeTextForParsing(reordered.text);
      const linesReordered = removeRepeatedNoiseLines(normalizedReordered.split('\n').map((line) => toClean(line)));
      questions = parseQuestionsFromLines(linesReordered, page);
      methodUsed = reordered.method;
    }
  }

  if (!questions.length) {
    questions = parseWithSlidingWindow(normalized, page);
    if (questions.length) methodUsed = 'sliding_window';
  }

  const anchorsQuestions = (normalized.match(QUESTION_ANCHOR_INLINE) || []).length;
  const anchorsOptions = (normalized.match(OPTION_ANCHOR_INLINE) || []).length;

  const metrics = {
    page,
    anchorsQuestions,
    anchorsOptions,
    methodUsed,
    questionsDetected: questions.length,
    reason: questions.length ? 'ok' : 'no_question_anchors_found'
  };

  if (debug) {
    await writeDebugArtifacts({ jobId, page, normalizedText: normalized, metrics });
  }

  return {
    questions,
    metrics,
    reason: metrics.reason,
    methodUsed,
    normalizedText: normalized
  };
};

module.exports = {
  parseQuestionsFromText,
  normalizeTextForParsing,
  maybeReorderColumns
};

