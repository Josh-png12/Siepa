const fs = require('fs/promises');

const QUESTION_NUMBER_LINE = /^\s*(\d{1,3})\s*[.)-](?:\s+|$)/;
const QUESTION_LABEL_LINE = /^\s*Pregunta\s+(\d{1,3})\s*[:.)-](?:\s+|$)/i;
const QUESTION_NUMBER_ONLY_LINE = /^\s*(\d{1,3})\s*$/;

const OPTION_LINE = /^\s*\(?([A-E])\)?\s*[\.\):\-]\s*(.*)$/i;
const INLINE_OPTION = /(?:^|\s)\(?([A-E])\)?\s*[\.\):\-]\s+/g;
const ANSWER_LINE = /(?:^|\b)(?:Respuesta|Clave)\s*[:\-]\s*([ABCDE])\b/i;
const SHORT_ANSWER_LINE = /^\s*R\.\s*([ABCDE])\b/i;
const EXPLANATION_LINE = /^\s*(Explicaci[oó]n|Justificaci[oó]n)\s*[:\-]\s*(.*)$/i;

const normalizeText = (text) => String(text || '')
  .replace(/\r\n?/g, '\n')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/[ \t]{2,}/g, ' ')
  .replace(/[•◦▪‣·●○■◆►]/g, '-')
  .replace(/\u00A0/g, ' ')
  .trim();

const normalizeLine = (line) => String(line || '').replace(/[ \t]{2,}/g, ' ').trim();

const hashText = (input) => {
  const value = String(input || '');
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) + value.charCodeAt(i);
    hash &= 0xffffffff;
  }
  return String(hash >>> 0);
};

const uniquePushFlag = (flags, flag) => {
  if (!flags.includes(flag)) flags.push(flag);
};

const isQuestionStart = (line) => {
  if (QUESTION_NUMBER_LINE.test(line)) return true;
  if (QUESTION_LABEL_LINE.test(line)) return true;
  if (QUESTION_NUMBER_ONLY_LINE.test(line)) return true;
  return false;
};

const getQuestionNumberAndRemainder = (line, nextLine = '') => {
  let match = line.match(QUESTION_NUMBER_LINE);
  if (match) {
    return {
      qNumber: Number(match[1]),
      remainder: normalizeLine(line.replace(QUESTION_NUMBER_LINE, ''))
    };
  }

  match = line.match(QUESTION_LABEL_LINE);
  if (match) {
    return {
      qNumber: Number(match[1]),
      remainder: normalizeLine(line.replace(QUESTION_LABEL_LINE, ''))
    };
  }

  match = line.match(QUESTION_NUMBER_ONLY_LINE);
  if (match) {
    return {
      qNumber: Number(match[1]),
      remainder: normalizeLine(nextLine || '')
    };
  }

  return { qNumber: null, remainder: normalizeLine(line) };
};

const splitQuestionBlocks = (text) => {
  const lines = normalizeText(text).split('\n');
  const starts = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (isQuestionStart(lines[i])) starts.push(i);
  }

  if (!starts.length) {
    return [{ qNumber: null, lines }];
  }

  const blocks = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    const end = starts[i + 1] || lines.length;
    const line = lines[start];
    const nextLine = lines[start + 1] || '';
    const parsed = getQuestionNumberAndRemainder(line, nextLine);
    const blockLines = lines.slice(start, end);

    if (QUESTION_NUMBER_ONLY_LINE.test(line) && parsed.remainder) {
      blockLines.splice(1, 1);
    }

    if (parsed.remainder) {
      blockLines[0] = parsed.remainder;
    } else {
      blockLines[0] = normalizeLine(blockLines[0].replace(QUESTION_NUMBER_LINE, '').replace(QUESTION_LABEL_LINE, ''));
    }

    blocks.push({
      qNumber: parsed.qNumber,
      lines: blockLines
    });
  }

  return blocks;
};

const findRemainingOptionMarkers = (lines, fromIndex) => {
  let count = 0;
  for (let i = fromIndex; i < lines.length; i += 1) {
    if (OPTION_LINE.test(lines[i])) count += 1;
  }
  return count;
};

const isLikelyOptionStart = (line, lines, index) => {
  if (!OPTION_LINE.test(line)) return false;
  const markerCountAhead = findRemainingOptionMarkers(lines, index);
  return markerCountAhead >= 2 || index >= 2;
};

const parseInlineOptionsFromLine = (line) => {
  const matches = [...String(line || '').matchAll(new RegExp(INLINE_OPTION))];
  if (matches.length < 2) return null;

  const segments = [];
  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const next = matches[i + 1];
    const label = String(current[1] || '').toUpperCase();
    const start = current.index + current[0].length;
    const end = next ? next.index : line.length;
    segments.push({ label, text: normalizeLine(line.slice(start, end)) });
  }

  return segments.filter((segment) => segment.label && segment.text);
};

const cleanupStatement = (statementRaw) => {
  const lines = String(statementRaw || '')
    .split('\n')
    .map(normalizeLine)
    .filter(Boolean);

  const seenPrompts = new Set();
  const cleaned = [];

  for (const line of lines) {
    const isPrompt = /(seleccione|marque).*(respuesta|opci[oó]n|correcta)/i.test(line);
    if (isPrompt) {
      const key = line.toLowerCase();
      if (seenPrompts.has(key)) continue;
      seenPrompts.add(key);
    }
    cleaned.push(line);
  }

  return normalizeLine(cleaned.join(' '));
};

const parseBlock = ({ qNumber, lines }) => {
  const options = {};
  const flags = [];
  const statementLines = [];
  const explanationLines = [];
  let detectedAnswer;
  let currentOption;
  let inExplanation = false;

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = String(lines[i] || '');
    const line = normalizeLine(rawLine);
    if (!line) continue;

    const explanationMatch = line.match(EXPLANATION_LINE);
    if (explanationMatch) {
      inExplanation = true;
      uniquePushFlag(flags, 'HAS_EXPLANATION');
      if (explanationMatch[2]) explanationLines.push(normalizeLine(explanationMatch[2]));
      continue;
    }

    const answerMatch = line.match(ANSWER_LINE) || line.match(SHORT_ANSWER_LINE);
    if (answerMatch) {
      detectedAnswer = String(answerMatch[1] || '').toUpperCase();
      uniquePushFlag(flags, 'HAS_ANSWER_KEY');
      continue;
    }

    if (inExplanation) {
      if (isQuestionStart(line)) break;
      explanationLines.push(line);
      continue;
    }

    const inlineOptions = parseInlineOptionsFromLine(line);
    if (inlineOptions) {
      inlineOptions.forEach((entry) => {
        options[entry.label] = normalizeLine(`${options[entry.label] || ''} ${entry.text}`);
      });
      currentOption = inlineOptions[inlineOptions.length - 1].label;
      continue;
    }

    if (isLikelyOptionStart(line, lines, i)) {
      const optionMatch = line.match(OPTION_LINE);
      const label = String(optionMatch[1] || '').toUpperCase();
      const text = normalizeLine(optionMatch[2] || '');
      options[label] = normalizeLine(`${options[label] || ''} ${text}`);
      currentOption = label;
      continue;
    }

    if (currentOption && Object.keys(options).length > 0) {
      options[currentOption] = normalizeLine(`${options[currentOption] || ''} ${line}`);
      continue;
    }

    if (OPTION_LINE.test(line)) {
      uniquePushFlag(flags, 'OPTION_PARSE_AMBIGUOUS');
    }

    statementLines.push(line);
  }

  const statement = cleanupStatement(statementLines.join('\n'));
  const explanation = normalizeLine(explanationLines.join(' '));
  const optionCount = Object.values(options).filter(Boolean).length;

  if (!statement) uniquePushFlag(flags, 'NO_STATEMENT');
  if (optionCount < 4) uniquePushFlag(flags, 'MISSING_OPTIONS');
  if (optionCount === 3) uniquePushFlag(flags, 'ONLY_3_OPTIONS');

  return {
    qNumber,
    statement,
    options,
    detectedAnswer,
    explanation: explanation || undefined,
    confidence: 0.4,
    flags
  };
};

const applyNumberingFlagsAndConfidence = (questions) => {
  const counts = new Map();
  questions.forEach((question) => {
    const key = String(question.qNumber);
    if (!Number.isFinite(question.qNumber)) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  let fallbackNumber = 1;
  questions.forEach((question) => {
    if (!Number.isFinite(question.qNumber)) {
      question.qNumber = fallbackNumber;
      fallbackNumber += 1;
      uniquePushFlag(question.flags, 'NO_NUMBER');
    } else {
      fallbackNumber = Math.max(fallbackNumber, question.qNumber + 1);
    }
  });

  const sorted = [...questions].sort((a, b) => a.qNumber - b.qNumber);
  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    const prev = sorted[i - 1];

    if ((counts.get(String(current.qNumber)) || 0) > 1) {
      uniquePushFlag(current.flags, 'DUPLICATE_NUMBER');
    }

    if (prev && current.qNumber - prev.qNumber > 1) {
      uniquePushFlag(current.flags, 'NUMBER_GAP');
    }

    const optionCount = Object.keys(current.options || {}).filter((key) => current.options[key]).length;
    const statementLength = String(current.statement || '').length;
    const hasConsistentNumbering = !current.flags.includes('DUPLICATE_NUMBER') && !current.flags.includes('NUMBER_GAP');

    if (statementLength >= 20 && optionCount >= 4 && hasConsistentNumbering) {
      current.confidence = 1.0;
    } else if (optionCount === 3 || statementLength < 20) {
      current.confidence = 0.7;
    } else {
      current.confidence = 0.4;
    }

    if (current.confidence < 0.7) {
      uniquePushFlag(current.flags, 'LOW_CONFIDENCE');
    }
  }

  return sorted;
};

const deduplicateQuestions = (questions) => {
  const seen = new Set();
  const deduped = [];

  for (const question of questions) {
    const key = `${question.qNumber}::${hashText(question.statement)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(question);
  }

  return deduped;
};

const buildMeta = (questions) => {
  const total = questions.length;
  const with4Options = questions.filter((item) => Object.keys(item.options || {}).filter((k) => item.options[k]).length >= 4).length;
  const withAnswer = questions.filter((item) => Boolean(item.detectedAnswer)).length;
  const flaggedCount = questions.filter((item) => (item.flags || []).length > 0).length;
  const avgConfidence = total
    ? Number((questions.reduce((acc, item) => acc + Number(item.confidence || 0), 0) / total).toFixed(2))
    : 0;

  const warnings = [];
  if (!total) warnings.push('No se detectaron preguntas');
  if (questions.some((item) => item.flags.includes('DUPLICATE_NUMBER'))) warnings.push('Se detectaron numeros duplicados');
  if (questions.some((item) => item.flags.includes('NUMBER_GAP'))) warnings.push('Se detectaron saltos en numeracion');

  return {
    warnings,
    stats: {
      total,
      with4Options,
      withAnswer,
      avgConfidence,
      flaggedCount
    }
  };
};

const parseQuestionBlocks = (text) => {
  const blocks = splitQuestionBlocks(text);
  const parsed = blocks.map(parseBlock);
  const withRules = applyNumberingFlagsAndConfidence(parsed);
  const questions = deduplicateQuestions(withRules).sort((a, b) => a.qNumber - b.qNumber);
  const meta = buildMeta(questions);
  return { questions, meta };
};

const toPreviewQuestion = (question) => {
  const optionEntries = ['A', 'B', 'C', 'D', 'E']
    .filter((label) => question.options?.[label])
    .map((label) => ({ label, text: question.options[label] }));

  return {
    qNumber: question.qNumber,
    statement: question.statement,
    options: optionEntries,
    detectedAnswer: question.detectedAnswer || null,
    explanation: question.explanation || '',
    area: '',
    competencia: '',
    nivelCognitivo: '',
    dificultadCualitativa: '',
    tri: { a: null, b: null, c: null },
    confidence: question.confidence,
    flags: question.flags || []
  };
};

const parseToPreview = async ({ extractedText, parsedJsonPath }) => {
  const parsed = parseQuestionBlocks(extractedText);

  const payload = {
    questions: parsed.questions.map(toPreviewQuestion),
    meta: parsed.meta
  };

  await fs.writeFile(parsedJsonPath, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
};

module.exports = {
  parseQuestionBlocks,
  parseToPreview
};
