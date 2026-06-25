const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const prisma = require('../config/prisma');
const { logAudit } = require('./auditLogService');
const { ocrPdfPages } = require('./pdfOcrService');

const AREA_CATALOG = {
  'Lectura Crítica': {
    headings: ['LECTURA CRITICA', 'LECTURA CRÍTICA'],
    keywords: ['TEXTO', 'IDEA PRINCIPAL', 'AUTOR', 'INFERIR', 'ARGUMENTO', 'ENUNCIADO'],
    competencias: ['Interpretación y comprensión', 'Reflexión y evaluación']
  },
  Matemáticas: {
    headings: ['MATEMATICAS', 'MATEMÁTICAS'],
    keywords: ['ECUACION', 'ECUACIÓN', 'FUNCION', 'FUNCIÓN', 'PROBABILIDAD', 'GEOMETRIA', 'GEOMETRÍA'],
    competencias: ['Razonamiento y Argumentación', 'Comunicación, Representación y Modelación', 'Formulación y Ejecución']
  },
  'Sociales y Ciudadanas': {
    headings: ['SOCIALES Y CIUDADANAS', 'CIENCIAS SOCIALES'],
    keywords: ['DEMOCRACIA', 'ESTADO', 'CIUDADANIA', 'CIUDADANÍA', 'CONSTITUCION', 'CONSTITUCIÓN', 'HISTORIA'],
    competencias: ['Pensamiento social', 'Interpretación y análisis de perspectivas']
  },
  'Ciencias Naturales': {
    headings: ['CIENCIAS NATURALES'],
    keywords: ['ECOSISTEMA', 'ENERGIA', 'ENERGÍA', 'CELULA', 'CÉLULA', 'REACCION', 'REACCIÓN', 'BIOLOGIA', 'BIOLOGÍA'],
    competencias: ['Uso comprensivo del conocimiento científico', 'Explicación de fenómenos']
  },
  Inglés: {
    headings: ['INGLES', 'INGLÉS'],
    keywords: ['CHOOSE', 'READING', 'ENGLISH', 'COMPLETE THE SENTENCE', 'VOCABULARY'],
    competencias: ['Reading comprehension', 'Language use']
  }
};

const QUESTION_START_LINE = /^\s*(\d{1,3})\s*[.)-]\s*(.*)$/i;
const QUESTION_LABEL_LINE = /^\s*Pregunta\s+(\d{1,3})\s*[:.)-]?\s*(.*)$/i;
const QUESTION_NUMBER_ONLY = /^\s*(\d{1,3})\s*$/;
const OPTION_LINE = /^\s*\(?([A-E])\)?\s*[\.\):\-]\s*(.*)$/i;
const INLINE_OPTION = /(?:^|\s)\(?([A-E])\)?\s*[\.\):\-]\s+/g;
const KEY_LINE = /(?:^|\b)(?:Respuesta|Clave)\s*[:\-]\s*([ABCDE])\b/i;
const EXPLANATION_LINE = /^\s*(?:Explicaci[oó]n|Justificaci[oó]n)\s*[:\-]\s*(.*)$/i;

const normalizeLine = (line) => String(line || '').replace(/[ \t]{2,}/g, ' ').trim();

const normalizeText = (text) => String(text || '')
  .replace(/\r\n?/g, '\n')
  .replace(/ /g, ' ')
  .replace(/[•◦▪‣·●○■◆►]/g, '-')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/[ \t]{2,}/g, ' ')
  .trim();

const normalizeForMatch = (text) => normalizeText(text)
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toUpperCase();

const safeName = (name, fallback) => String(name || fallback).replace(/[^a-zA-Z0-9._-]/g, '_');
const getAuditPrefix = (user) => (user?.role === 'admin' ? 'admin' : 'teacher');

const ensurePdfParse = () => {
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    return require('pdf-parse');
  } catch (_error) {
    throw new ApiError(500, 'DependencyMissing', ['pdf-parse no esta instalado en backend/package.json']);
  }
};

const hashQuestion = (number, statement) =>
  crypto.createHash('sha1').update(`${number}::${String(statement || '').trim()}`).digest('hex');

const ocrCache = new Map();

const scoreAreaByKeywords = (pageNormalized) => {
  const entries = Object.entries(AREA_CATALOG).map(([area, def]) => {
    const score = def.keywords.reduce((acc, keyword) => (
      pageNormalized.includes(normalizeForMatch(keyword)) ? acc + 1 : acc
    ), 0);
    return { area, score };
  });

  const best = entries.sort((a, b) => b.score - a.score)[0] || { area: 'Sin clasificar', score: 0 };
  if (best.score <= 0) {
    return { area: 'Sin clasificar', score: 0 };
  }
  return best;
};

const detectHeadingOnPage = (pageNormalized) => {
  for (const [area, def] of Object.entries(AREA_CATALOG)) {
    for (const heading of def.headings) {
      const token = normalizeForMatch(heading);
      if (pageNormalized.includes(token)) {
        return { area, label: heading };
      }
    }
  }
  return null;
};

const extractPagesFromPdf = async (filePath) => {
  const pdfParse = ensurePdfParse();
  const fileBuffer = await fs.readFile(filePath);
  let pageCounter = 0;
  const marker = '[[[SIEPA_PAGE_MARKER_';

  const parsed = await pdfParse(fileBuffer, {
    pagerender: async (pageData) => {
      pageCounter += 1;
      const text = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
      const strings = (text.items || []).map((item) => item.str).join(' ');
      return `${marker}${pageCounter}]]]\n${strings}\n`;
    }
  });

  const pageMatches = [...String(parsed.text || '').matchAll(/\[\[\[SIEPA_PAGE_MARKER_(\d+)]]]\s*([\s\S]*?)(?=(\[\[\[SIEPA_PAGE_MARKER_|$))/g)];
  if (!pageMatches.length) {
    return [{
      page: 1,
      text: normalizeText(parsed.text || ''),
      normalized: normalizeForMatch(parsed.text || '')
    }];
  }

  return pageMatches.map((match) => {
    const text = normalizeText(match[2] || '');
    return {
      page: Number(match[1]),
      text,
      normalized: normalizeForMatch(text)
    };
  });
};

const buildBlocksFromPages = (pages) => {
  const anyHeading = pages.some((page) => Boolean(detectHeadingOnPage(page.normalized)));
  const blockCandidates = [];
  let current = null;

  pages.forEach((page) => {
    const heading = detectHeadingOnPage(page.normalized);
    const keywordGuess = scoreAreaByKeywords(page.normalized);
    const areaGuess = heading?.area || (anyHeading ? (current?.areaGuess || keywordGuess.area) : keywordGuess.area);
    const label = heading?.label || areaGuess;
    const confidence = heading ? 1 : Math.min(0.9, 0.35 + (keywordGuess.score * 0.15));

    if (!current || current.areaGuess !== areaGuess || current.label !== label) {
      current = {
        label,
        areaGuess: areaGuess || 'Sin clasificar',
        pages: [page.page],
        confidence
      };
      blockCandidates.push(current);
    } else {
      current.pages.push(page.page);
      current.confidence = Number(((current.confidence + confidence) / 2).toFixed(2));
    }
  });

  return blockCandidates;
};

const isQuestionStart = (line) =>
  QUESTION_START_LINE.test(line) || QUESTION_LABEL_LINE.test(line) || QUESTION_NUMBER_ONLY.test(line);

const splitQuestionBlocksFromPage = (pageText, pageNumber, areaGuess, blockLabel) => {
  const lines = normalizeText(pageText).split('\n').map((line) => String(line || ''));
  const starts = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (isQuestionStart(lines[i])) starts.push(i);
  }

  if (!starts.length) return [];

  const blocks = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    const end = starts[i + 1] || lines.length;
    const rawStart = lines[start];
    const nextLine = lines[start + 1] || '';

    let number = null;
    let firstText = '';
    let match = rawStart.match(QUESTION_START_LINE);
    if (match) {
      number = Number(match[1]);
      firstText = normalizeLine(match[2] || '');
    } else {
      match = rawStart.match(QUESTION_LABEL_LINE);
      if (match) {
        number = Number(match[1]);
        firstText = normalizeLine(match[2] || '');
      } else {
        match = rawStart.match(QUESTION_NUMBER_ONLY);
        if (match) {
          number = Number(match[1]);
          firstText = normalizeLine(nextLine || '');
        }
      }
    }

    const segment = lines.slice(start, end);
    if (QUESTION_NUMBER_ONLY.test(rawStart) && segment.length > 1) {
      segment.splice(1, 1);
    }
    segment[0] = firstText || normalizeLine(segment[0].replace(QUESTION_START_LINE, '').replace(QUESTION_LABEL_LINE, ''));

    blocks.push({
      number,
      page: pageNumber,
      areaGuess,
      blockLabel,
      lines: segment
    });
  }

  return blocks;
};

const parseInlineOptions = (line) => {
  const matches = [...String(line || '').matchAll(new RegExp(INLINE_OPTION))];
  if (matches.length < 2) return null;

  const parts = [];
  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const next = matches[i + 1];
    const label = String(current[1] || '').toUpperCase();
    const start = current.index + current[0].length;
    const end = next ? next.index : line.length;
    const text = normalizeLine(line.slice(start, end));
    if (label && text) parts.push({ label, text });
  }
  return parts.length ? parts : null;
};

const guessCompetencia = (area, questionText) => {
  const normalized = normalizeForMatch(questionText);
  if (area === 'Matemáticas') {
    if (/ARGUMENT|JUSTIF|DEDUC/.test(normalized)) return 'Razonamiento y Argumentación';
    if (/TABLA|GRAFIC|REPRESENT|MODEL/.test(normalized)) return 'Comunicación, Representación y Modelación';
    return 'Formulación y Ejecución';
  }
  if (area === 'Lectura Crítica') {
    if (/AUTOR|TESIS|INTENCION|INTENCI|PUNTO DE VISTA/.test(normalized)) return 'Reflexión y evaluación';
    return 'Interpretación y comprensión';
  }
  if (area === 'Ciencias Naturales') {
    if (/EXPLIC|CAUSA|EFECTO|HIPOTESIS|HIPÓTESIS/.test(normalized)) return 'Explicación de fenómenos';
    return 'Uso comprensivo del conocimiento científico';
  }
  if (area === 'Sociales y Ciudadanas') {
    if (/PERSPECTIVA|ACTOR|CONFLICTO|POSTURA/.test(normalized)) return 'Interpretación y análisis de perspectivas';
    return 'Pensamiento social';
  }
  if (area === 'Inglés') {
    return /VOCAB|GRAMMAR|LANGUAGE/.test(normalized) ? 'Language use' : 'Reading comprehension';
  }
  return 'Sin clasificar';
};

const guessNivel = (questionText) => {
  const normalized = normalizeForMatch(questionText);
  if (/EVALUAR|JUZGAR|VALORAR/.test(normalized)) return 'evaluar';
  if (/ANALIZAR|RELACIONAR|COMPARAR|INFERIR/.test(normalized)) return 'analizar';
  if (/APLICAR|RESOLVER|CALCULAR/.test(normalized)) return 'aplicar';
  if (/DEFINIR|IDENTIFICAR|RECONOCER/.test(normalized)) return 'recordar';
  return 'comprender';
};

const parseQuestionBlock = (block) => {
  const optionsMap = {};
  const statementParts = [];
  const flags = [];
  let answerGuess = null;
  let explanationMode = false;
  let lastOptionLabel = null;

  for (const rawLine of block.lines) {
    const line = normalizeLine(rawLine);
    if (!line) continue;

    const keyMatch = line.match(KEY_LINE);
    if (keyMatch) {
      answerGuess = String(keyMatch[1] || '').toUpperCase();
      if (!flags.includes('HAS_ANSWER_KEY')) flags.push('HAS_ANSWER_KEY');
      continue;
    }

    const explanationMatch = line.match(EXPLANATION_LINE);
    if (explanationMatch) {
      explanationMode = true;
      if (!flags.includes('HAS_EXPLANATION')) flags.push('HAS_EXPLANATION');
      continue;
    }

    if (explanationMode) continue;

    const inline = parseInlineOptions(line);
    if (inline) {
      inline.forEach((opt) => {
        optionsMap[opt.label] = normalizeLine(`${optionsMap[opt.label] || ''} ${opt.text}`);
      });
      lastOptionLabel = inline[inline.length - 1].label;
      continue;
    }

    const optionMatch = line.match(OPTION_LINE);
    if (optionMatch) {
      const label = String(optionMatch[1] || '').toUpperCase();
      const text = normalizeLine(optionMatch[2] || '');
      optionsMap[label] = normalizeLine(`${optionsMap[label] || ''} ${text}`);
      lastOptionLabel = label;
      continue;
    }

    if (lastOptionLabel && Object.keys(optionsMap).length > 0) {
      optionsMap[lastOptionLabel] = normalizeLine(`${optionsMap[lastOptionLabel] || ''} ${line}`);
      continue;
    }

    statementParts.push(line);
  }

  const options = ['A', 'B', 'C', 'D', 'E']
    .filter((label) => optionsMap[label])
    .map((label) => ({ label, text: optionsMap[label] }));

  if (!statementParts.length) flags.push('NO_STATEMENT');
  if (options.length < 3) flags.push('MISSING_OPTIONS');
  if (options.length === 3) flags.push('ONLY_3_OPTIONS');

  const statement = statementParts.join(' ').replace(/\s+/g, ' ').trim();
  const competenciaGuess = guessCompetencia(block.areaGuess, statement);
  const nivelGuess = guessNivel(statement);

  return {
    number: block.number,
    text: statement,
    page: block.page,
    areaGuess: block.areaGuess || 'Sin clasificar',
    competenciaGuess,
    nivelGuess,
    answerGuess,
    options,
    confidence: 0.4,
    flags,
    source: {
      pageStart: block.page,
      pageEnd: block.page,
      blockLabel: block.blockLabel || block.areaGuess || 'Sin bloque'
    }
  };
};

const parseAnswerKeyMap = async (answersPdfPath) => {
  if (!answersPdfPath) return new Map();
  const pages = await extractPagesFromPdf(answersPdfPath);
  const fullText = pages.map((p) => p.text).join('\n');
  const map = new Map();

  for (const match of fullText.matchAll(/(?:^|\n)\s*(\d{1,3})\s*[.)-]\s*([ABCDE])\b/gi)) {
    map.set(Number(match[1]), String(match[2] || '').toUpperCase());
  }

  for (const match of fullText.matchAll(/Pregunta\s*(\d{1,3})[\s\S]{0,40}?(?:Respuesta|Clave)\s*[:\-]?\s*([ABCDE])/gi)) {
    map.set(Number(match[1]), String(match[2] || '').toUpperCase());
  }

  return map;
};

const applyNumberingRules = (questions) => {
  const byNumber = new Map();
  let incremental = 1;

  questions.forEach((q) => {
    if (!Number.isFinite(q.number)) {
      q.number = incremental;
      q.flags.push('NO_NUMBER');
      incremental += 1;
      return;
    }
    incremental = Math.max(incremental, q.number + 1);
    byNumber.set(q.number, (byNumber.get(q.number) || 0) + 1);
  });

  const sorted = [...questions].sort((a, b) => a.number - b.number);
  for (let i = 0; i < sorted.length; i += 1) {
    const q = sorted[i];
    const prev = sorted[i - 1];

    if ((byNumber.get(q.number) || 0) > 1 && !q.flags.includes('DUPLICATE_NUMBER')) q.flags.push('DUPLICATE_NUMBER');
    if (prev && q.number - prev.number > 1 && !q.flags.includes('NUMBER_GAP')) q.flags.push('NUMBER_GAP');

    const hasConsistentNumber = !q.flags.includes('DUPLICATE_NUMBER') && !q.flags.includes('NUMBER_GAP');
    if (q.text.length >= 20 && q.options.length >= 3 && hasConsistentNumber) {
      q.confidence = 1.0;
    } else if (q.options.length === 3 || q.text.length < 20) {
      q.confidence = 0.7;
    } else {
      q.confidence = 0.4;
    }

    if (q.confidence < 0.7 && !q.flags.includes('LOW_CONFIDENCE')) q.flags.push('LOW_CONFIDENCE');
  }

  return sorted;
};

const dedupeQuestions = (questions) => {
  const seen = new Set();
  const deduped = [];
  questions.forEach((q) => {
    const key = hashQuestion(q.number, q.text);
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(q);
  });
  return deduped;
};

const buildPreviewStats = (questions, blocks) => {
  const total = questions.length;
  const withAnswer = questions.filter((q) => Boolean(q.answerGuess)).length;
  const withOptions = questions.filter((q) => q.options.length >= 4).length;
  const flaggedCount = questions.filter((q) => q.flags.length > 0).length;
  const avgConfidence = total
    ? Number((questions.reduce((acc, q) => acc + Number(q.confidence || 0), 0) / total).toFixed(2))
    : 0;

  return {
    total,
    withAnswer,
    with4Options: withOptions,
    flaggedCount,
    avgConfidence,
    blockCount: blocks.length
  };
};

const parsePreviewFromPages = async ({
  pagesInput,
  answersPdfPath = '',
  hints = {},
  ocrUsed = false,
  progress = { currentPage: 0, totalPages: 0, percent: 0 },
  preDetectedQuestions = null,
  debugMeta = null,
  reason = ''
}) => {
  const blocks = buildBlocksFromPages(pagesInput);
  const blockByPage = new Map();
  blocks.forEach((block) => {
    block.pages.forEach((page) => blockByPage.set(page, block));
  });

  const rawQuestions = Array.isArray(preDetectedQuestions) ? [...preDetectedQuestions] : [];
  if (!Array.isArray(preDetectedQuestions)) {
    pagesInput.forEach((page) => {
      const block = blockByPage.get(page.page);
      const parsedBlocks = splitQuestionBlocksFromPage(page.text, page.page, block?.areaGuess || 'Sin clasificar', block?.label || 'Sin bloque');
      parsedBlocks.forEach((questionBlock) => {
        rawQuestions.push(parseQuestionBlock(questionBlock));
      });
    });
  }

  const answerKeyMap = await parseAnswerKeyMap(answersPdfPath);
  rawQuestions.forEach((question) => {
    if (!question.answerGuess && answerKeyMap.has(question.number)) {
      question.answerGuess = answerKeyMap.get(question.number);
      if (!question.flags.includes('HAS_ANSWER_KEY')) question.flags.push('HAS_ANSWER_KEY');
    }
  });

  const withRules = applyNumberingRules(rawQuestions);
  const questions = dedupeQuestions(withRules).sort((a, b) => a.number - b.number);
  const stats = buildPreviewStats(questions, blocks);
  const warnings = [];
  if (!questions.length) warnings.push('No se detectaron preguntas en el PDF');
  if (questions.some((q) => q.flags.includes('NUMBER_GAP'))) warnings.push('Se detectaron saltos en numeraciÃ³n');
  if (questions.some((q) => q.flags.includes('MISSING_OPTIONS'))) warnings.push('Hay preguntas con opciones incompletas');

  return {
    sessionName: hints.sessionName || '',
    grade: hints.grade || '',
    year: hints.year || '',
    ocrUsed,
    blocks,
    questions,
    detectedQuestions: questions,
    blocksDetected: blocks,
    pages: pagesInput.map((page) => ({ pageNumber: page.page, text: page.text, needsOcr: Boolean(page.needsOcr) })),
    progress,
    totals: {
      pages: pagesInput.length,
      questions: questions.length
    },
    stats,
    warnings,
    reason: questions.length ? '' : (reason || 'no_question_anchors_found'),
    debug: debugMeta || undefined
  };
};

const parseMultiAreaPDF = async (questionsPdfPath, answersPdfPath = '', hints = {}) => {
  const forceOcr = String(hints.forceOcr || '').toLowerCase() === 'true' || hints.forceOcr === true;
  const fileBuffer = await fs.readFile(questionsPdfPath);
  const fileHash = crypto.createHash('sha1').update(fileBuffer).digest('hex');

  const runHeuristics = async (pagesInput, ocrUsed = false, progress = { currentPage: 0, totalPages: 0, percent: 0 }) => {
    const blocks = buildBlocksFromPages(pagesInput);
    const blockByPage = new Map();
    blocks.forEach((block) => {
      block.pages.forEach((page) => blockByPage.set(page, block));
    });

    const rawQuestions = [];
    pagesInput.forEach((page) => {
      const block = blockByPage.get(page.page);
      const parsedBlocks = splitQuestionBlocksFromPage(page.text, page.page, block?.areaGuess || 'Sin clasificar', block?.label || 'Sin bloque');
      parsedBlocks.forEach((questionBlock) => {
        rawQuestions.push(parseQuestionBlock(questionBlock));
      });
    });

    const answerKeyMap = await parseAnswerKeyMap(answersPdfPath);
    rawQuestions.forEach((question) => {
      if (!question.answerGuess && answerKeyMap.has(question.number)) {
        question.answerGuess = answerKeyMap.get(question.number);
        if (!question.flags.includes('HAS_ANSWER_KEY')) question.flags.push('HAS_ANSWER_KEY');
      }
    });

    const withRules = applyNumberingRules(rawQuestions);
    const questions = dedupeQuestions(withRules).sort((a, b) => a.number - b.number);
    const stats = buildPreviewStats(questions, blocks);
    const warnings = [];
    if (!questions.length) warnings.push('No se detectaron preguntas en el PDF');
    if (questions.some((q) => q.flags.includes('NUMBER_GAP'))) warnings.push('Se detectaron saltos en numeración');
    if (questions.some((q) => q.flags.includes('MISSING_OPTIONS'))) warnings.push('Hay preguntas con opciones incompletas');

    return {
      sessionName: hints.sessionName || '',
      grade: hints.grade || '',
      year: hints.year || '',
      ocrUsed,
      blocks,
      questions,
      detectedQuestions: questions,
      blocksDetected: blocks,
      pages: pagesInput.map((page) => ({ pageNumber: page.page, text: page.text })),
      progress,
      totals: {
        pages: pagesInput.length,
        questions: questions.length
      },
      stats,
      warnings
    };
  };

  const parsedPages = await extractPagesFromPdf(questionsPdfPath);
  const nonSpaceChars = parsedPages.reduce((acc, page) => acc + String(page.text || '').replace(/\s/g, '').length, 0);
  let preview = await runHeuristics(parsedPages, false, {
    currentPage: parsedPages.length,
    totalPages: parsedPages.length,
    percent: parsedPages.length ? 100 : 0
  });

  const shouldUseOcr = forceOcr || nonSpaceChars < 40 || Number(preview.questions.length) === 0;
  if (shouldUseOcr) {
    let ocrResult = ocrCache.get(fileHash);
    if (!ocrResult) {
      const progressState = { currentPage: 0, totalPages: 0, percent: 0 };
      ocrResult = await ocrPdfPages({
        filePath: questionsPdfPath,
        lang: String(process.env.PDF_OCR_LANG || 'spa+eng'),
        dpi: Number(process.env.PDF_OCR_DPI || 180),
        maxPages: Number(hints.maxOcrPages || process.env.PDF_OCR_MAX_PAGES || 8),
        pageTimeoutMs: Number(hints.pageTimeoutMs || process.env.PDF_OCR_PAGE_TIMEOUT_MS || 45000),
        onProgress: (progress) => {
          if (typeof hints.onProgress === 'function') {
            hints.onProgress(progress);
          }
          progressState.currentPage = progress.currentPage;
          progressState.totalPages = progress.totalPages;
          progressState.percent = progress.percent;
        }
      });
      ocrCache.set(fileHash, ocrResult);
    }

    const ocrPages = (ocrResult.pages || []).map((item) => ({
      page: Number(item.pageNumber),
      text: normalizeText(item.text || ''),
      normalized: normalizeForMatch(item.text || '')
    }));
    preview = await runHeuristics(ocrPages, true, ocrResult.progress || {
      currentPage: ocrPages.length,
      totalPages: ocrPages.length,
      percent: ocrPages.length ? 100 : 0
    });
  }

  return preview;
};

const ensureBatchAccess = ({ batch, user, schoolId }) => {
  if (!batch) throw new ApiError(404, 'NotFound', ['Batch no encontrado']);
  if (batch.schoolId !== schoolId) throw new ApiError(403, 'Forbidden', ['Batch fuera de alcance institucional']);
  if (user.role !== 'admin' && batch.createdById !== user.id) {
    throw new ApiError(403, 'Forbidden', ['No tienes permisos sobre este batch']);
  }
};

const createPreviewBatch = async ({ user, files, payload }) => {
  const schoolId = user.schoolId;
  const questionsFile = files?.questionsPdf?.[0];
  const answersFile = files?.answersPdf?.[0] || null;

  if (!questionsFile) {
    throw new ApiError(400, 'ValidationError', ['questionsPdf es requerido']);
  }

  const created = await prisma.pdfImportBatch.create({
    data: {
      schoolId,
      createdById: user.id,
      sessionName: String(payload.sessionName || '').trim(),
      grade: String(payload.grade || '').trim(),
      year: String(payload.year || '').trim(),
      status: 'preview',
      questionsPdfPath: '',
      answersPdfPath: ''
    }
  });

  const baseDir = path.join(process.cwd(), 'uploads', 'tmp', 'pdf-import', String(created.id));
  await fs.mkdir(baseDir, { recursive: true });

  const questionsPath = path.join(baseDir, safeName(questionsFile?.originalname, 'questions.pdf'));
  await fs.writeFile(questionsPath, questionsFile.buffer);
  console.log('[PDF IMPORT] Archivo recibido:', questionsPath);
  console.log('[PDF IMPORT] Tamaño buffer recibido:', questionsFile.buffer.length, 'bytes');
  const { statSync } = require('fs');
  console.log('[PDF IMPORT] Tamaño en disco:', statSync(questionsPath).size, 'bytes');

  let answersPath = '';
  if (answersFile) {
    answersPath = path.join(baseDir, safeName(answersFile?.originalname, 'answers.pdf'));
    await fs.writeFile(answersPath, answersFile.buffer);
    console.log('[PDF IMPORT] Respuestas en disco:', statSync(answersPath).size, 'bytes');
  }

  await prisma.pdfImportBatch.update({
    where: { id: created.id },
    data: { questionsPdfPath: questionsPath, answersPdfPath: answersPath }
  });

  const useVision = payload.useVision === true || payload.useVision === 'true';

  try {
    const { enqueueOcrJob, enqueueGeminiJob } = require('../jobs/ocrQueue');
    const enqueueFn = useVision ? enqueueGeminiJob : enqueueOcrJob;
    const jobId = enqueueFn({
      batchId: created.id,
      userId: user.id,
      schoolId,
      pdfPath: questionsPath,
      answersPdfPath: answersPath,
      config: payload || {}
    });

    console.log(`[PDF IMPORT] Job encolado con engine=${useVision ? 'gemini-vision' : 'tesseract'} jobId=${jobId}`);

    await logAudit({
      schoolId,
      userId: user.id,
      action: `${getAuditPrefix(user)}.pdfImport.ocrQueued`,
      entityType: 'PdfImportBatch',
      entityId: created.id,
      metadata: { jobId, engine: useVision ? 'gemini-vision' : 'tesseract' }
    });

    return {
      jobId,
      batchId: created.id,
      status: 'queued',
      progress: {
        currentPage: 0,
        totalPages: 0,
        percent: 0
      }
    };
  } catch (error) {
    await prisma.pdfImportBatch.update({
      where: { id: created.id },
      data: { status: 'failed', errorMessage: error.message || 'No se pudo parsear el PDF' }
    });
    throw error;
  }
};

const getPreviewJobStatus = async ({ user, jobId }) => {
  const { getOcrJobStatus } = require('../jobs/ocrQueue');
  return getOcrJobStatus({
    jobId,
    requester: {
      id: user.id,
      role: user.role,
      schoolId: user.schoolId
    }
  });
};

const cancelPreviewJob = async ({ user, jobId }) => {
  const { cancelOcrJob } = require('../jobs/ocrQueue');
  return cancelOcrJob({
    jobId,
    requester: {
      id: user.id,
      role: user.role,
      schoolId: user.schoolId
    }
  });
};

const getPreviewBatch = async ({ user, batchId }) => {
  const schoolId = user.schoolId;
  const batch = await prisma.pdfImportBatch.findUnique({ where: { id: batchId } });
  ensureBatchAccess({ batch, user, schoolId });

  return {
    batchId: batch.id,
    status: batch.status,
    ocrUsed: Boolean(batch.ocrUsed),
    sessionName: batch.sessionName,
    grade: batch.grade,
    year: batch.year,
    blocks: batch.detectedBlocks || [],
    blocksDetected: batch.detectedBlocks || [],
    questions: batch.detectedQuestions || [],
    detectedQuestions: batch.detectedQuestions || [],
    pages: batch.pages || [],
    progress: batch.stats?.progress || {
      currentPage: (batch.pages || []).length,
      totalPages: (batch.pages || []).length,
      percent: (batch.pages || []).length ? 100 : 0
    },
    meta: {
      stats: batch.stats || {},
      warnings: batch.warnings || []
    }
  };
};

const getOverride = (overrides, number) => {
  const perQuestion = overrides?.perQuestion || {};
  return perQuestion[String(number)] || perQuestion[number] || {};
};

const ensureOptionArray = (options) => {
  const normalized = (options || [])
    .map((item) => ({
      label: String(item.label || '').trim().toUpperCase(),
      text: String(item.text || '').trim()
    }))
    .filter((item) => item.label && item.text);

  const existing = new Set(normalized.map((item) => item.label));
  const labels = ['A', 'B', 'C', 'D', 'E'];
  labels.forEach((label) => {
    if (normalized.length < 4 && !existing.has(label)) {
      normalized.push({ label, text: `Opcion ${label} (completar)` });
      existing.add(label);
    }
  });

  return normalized.slice(0, 5);
};

const VALID_NIVELES = ['recordar', 'comprender', 'aplicar', 'analizar', 'evaluar', 'crear'];

const confirmPreviewBatch = async ({ user, payload }) => {
  const schoolId = user.schoolId;
  const batchId = String(payload.batchId || '').trim();
  if (!batchId) throw new ApiError(400, 'ValidationError', ['batchId es requerido']);

  const batch = await prisma.pdfImportBatch.findUnique({ where: { id: batchId } });
  ensureBatchAccess({ batch, user, schoolId });

  if (batch.status !== 'preview') {
    throw new ApiError(409, 'InvalidState', ['El batch no está en estado preview']);
  }
  if (!String(batch.questionsPdfPath || '').trim()) {
    throw new ApiError(400, 'ValidationError', ['questionsPdfPath es requerido para confirmar importación']);
  }

  const toCreate = [];
  const skipped = [];

  (Array.isArray(batch.detectedQuestions) ? batch.detectedQuestions : []).forEach((item) => {
    const override = getOverride(payload.overrides, item.number);
    const area = String(override.area || item.areaGuess || 'Sin clasificar').trim() || 'Sin clasificar';
    const competencia = String(override.competencia || item.competenciaGuess || 'Sin clasificar').trim() || 'Sin clasificar';
    const nivelRaw = String(override.nivelCognitivo || item.nivelGuess || 'comprender').trim().toLowerCase();
    const nivelCognitivo = VALID_NIVELES.includes(nivelRaw) ? nivelRaw : 'comprender';
    const options = ensureOptionArray(item.options || []);

    if (!String(item.text || '').trim()) {
      skipped.push({ number: item.number, reason: 'NO_STATEMENT' });
      return;
    }

    const answerRaw = String(override.answerKey || item.answerGuess || options[0]?.label || 'A').trim().toUpperCase();
    const correctAnswer = options.some((opt) => opt.label === answerRaw) ? answerRaw : options[0]?.label || 'A';

    toCreate.push({
      schoolId,
      statementText: String(item.text || '').trim(),
      statementImages: [],
      latex: '',
      options,
      correctAnswer,
      area,
      competencia,
      nivelCognitivo,
      dificultadCualitativa: 'media',
      triParamA: 1,
      triParamB: 0,
      triParamC: 0.2,
      visibility: 'private',
      calibrationStatus: 'experimental',
      estado: 'borrador',
      sourceType: 'pdf',
      sourcePdfId: batch.id,
      sourceSessionName: batch.sessionName || '',
      sourcePageStart: item.source?.pageStart || item.page || null,
      sourcePageEnd: item.source?.pageEnd || item.page || null,
      sourceBlockLabel: item.source?.blockLabel || area,
      importBatchId: batch.id,
      createdById: user.id,
      updatedById: user.id,
      currentVersion: 1
    });
  });

  if (!toCreate.length) {
    await prisma.pdfImportBatch.update({
      where: { id: batchId },
      data: { status: 'failed', errorMessage: 'No hay preguntas válidas para importar' }
    });
    throw new ApiError(400, 'ValidationError', ['No hay preguntas válidas para importar']);
  }

  // Sequential creates replace bulkWrite — tolerate individual failures
  const createdIds = [];
  for (const data of toCreate) {
    try {
      const q = await prisma.question.create({ data });
      createdIds.push(q.id);
    } catch (_error) {
      // skip individual failures; final count reflects reality
    }
  }

  await prisma.pdfImportBatch.update({ where: { id: batchId }, data: { status: 'imported' } });

  await logAudit({
    schoolId,
    userId: user.id,
    action: `${getAuditPrefix(user)}.pdfImport.confirm`,
    entityType: 'PdfImportBatch',
    entityId: batchId,
    metadata: {
      createdCount: createdIds.length,
      skippedCount: skipped.length
    }
  });

  return {
    batchId,
    status: 'imported',
    createdCount: createdIds.length,
    skippedCount: skipped.length,
    skipped,
    questionIds: createdIds
  };
};

module.exports = {
  extractPagesFromPdf,
  parsePreviewFromPages,
  parseMultiAreaPDF,
  createPreviewBatch,
  getPreviewJobStatus,
  cancelPreviewJob,
  getPreviewBatch,
  confirmPreviewBatch
};
