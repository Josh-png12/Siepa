const fs = require('fs');
const path = require('path');
const Question = require('../models/Question');
const QuestionVersion = require('../models/QuestionVersion');
const { normalizeQuestionPayload, validateQuestionPayload, buildError } = require('./questionService');

const getXlsx = () => {
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    return require('xlsx');
  } catch (error) {
    throw buildError('La dependencia xlsx no esta instalada en backend/package.json', 500);
  }
};

const DEFAULT_MAPPING = {
  statementText: 'statementText',
  latex: 'latex',
  area: 'area',
  competencia: 'competencia',
  nivelCognitivo: 'nivelCognitivo',
  dificultadCualitativa: 'dificultadCualitativa',
  triA: 'triA',
  triB: 'triB',
  triC: 'triC',
  visibility: 'visibility',
  calibrationStatus: 'calibrationStatus',
  correctAnswer: 'correctAnswer',
  optionA: 'optionA',
  optionB: 'optionB',
  optionC: 'optionC',
  optionD: 'optionD',
  optionE: 'optionE',
  optionF: 'optionF',
  optionG: 'optionG',
  optionH: 'optionH'
};

const normalizeRow = (row, mapping) => {
  const value = (key) => row[mapping[key]];
  const optionEntries = [
    ['A', value('optionA')],
    ['B', value('optionB')],
    ['C', value('optionC')],
    ['D', value('optionD')],
    ['E', value('optionE')],
    ['F', value('optionF')],
    ['G', value('optionG')],
    ['H', value('optionH')]
  ]
    .filter(([, text]) => text !== undefined && text !== null && String(text).trim() !== '')
    .map(([label, text]) => ({ label, text: String(text).trim() }));

  return {
    statement: { text: String(value('statementText') || '').trim(), images: [] },
    latex: String(value('latex') || '').trim(),
    options: optionEntries,
    correctAnswer: String(value('correctAnswer') || '').trim().toUpperCase(),
    area: String(value('area') || '').trim(),
    competencia: String(value('competencia') || '').trim(),
    nivelCognitivo: String(value('nivelCognitivo') || 'comprender').trim().toLowerCase(),
    dificultadCualitativa: String(value('dificultadCualitativa') || '').trim().toLowerCase(),
    triParams: {
      a: Number(value('triA') ?? 1),
      b: Number(value('triB') ?? 0),
      c: Number(value('triC') ?? 0.2)
    },
    visibility: String(value('visibility') || 'private').trim().toLowerCase(),
    calibrationStatus: String(value('calibrationStatus') || 'experimental').trim().toLowerCase()
  };
};

const parseImportFile = (filePath) => {
  const xlsx = getXlsx();
  const workbook = xlsx.readFile(filePath, { raw: false, cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw buildError('El archivo no contiene hojas', 400);

  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

  return {
    rows,
    columns: rows.length ? Object.keys(rows[0]) : []
  };
};

const importQuestionsFromSpreadsheet = async ({ filePath, userId, mapping = {}, preview = false }) => {
  if (!filePath || !fs.existsSync(filePath)) {
    throw buildError('Archivo de importacion no encontrado', 400);
  }

  const mergedMapping = { ...DEFAULT_MAPPING, ...mapping };
  const { rows, columns } = parseImportFile(filePath);

  if (!rows.length) {
    return {
      preview,
      insertedCount: 0,
      totalRows: 0,
      errors: [],
      columns,
      sample: []
    };
  }

  const normalizedRows = [];
  const errors = [];

  rows.forEach((row, index) => {
    try {
      const normalized = normalizeQuestionPayload(normalizeRow(row, mergedMapping));
      validateQuestionPayload(normalized);
      normalizedRows.push(normalized);
    } catch (error) {
      errors.push({ row: index + 2, message: error.message });
    }
  });

  if (preview) {
    return {
      preview: true,
      insertedCount: 0,
      totalRows: rows.length,
      validRows: normalizedRows.length,
      errors,
      columns,
      sample: normalizedRows.slice(0, 10)
    };
  }

  if (!normalizedRows.length) {
    throw buildError('No hay filas validas para importar', 400);
  }

  const toInsert = normalizedRows.map((row) => ({
    ...row,
    metadata: {
      createdBy: userId,
      updatedBy: userId
    },
    estado: 'borrador',
    currentVersion: 1
  }));

  const inserted = await Question.insertMany(toInsert, { ordered: false });

  const versionDocs = inserted.map((question) => ({
    question: question._id,
    versionNumber: question.currentVersion,
    snapshot: {
      statement: question.statement,
      latex: question.latex,
      options: question.options,
      correctAnswer: question.correctAnswer,
      area: question.area,
      competencia: question.competencia,
      nivelCognitivo: question.nivelCognitivo,
      dificultadCualitativa: question.dificultadCualitativa,
      triParams: question.triParams,
      visibility: question.visibility,
      calibrationStatus: question.calibrationStatus,
      stats: question.stats,
      estado: question.estado,
      caseGroup: question.caseGroup || null
    },
    changeType: 'import',
    changedBy: userId
  }));

  if (versionDocs.length) {
    await QuestionVersion.insertMany(versionDocs, { ordered: false });
  }

  return {
    preview: false,
    insertedCount: inserted.length,
    totalRows: rows.length,
    validRows: normalizedRows.length,
    errors,
    columns,
    sample: normalizedRows.slice(0, 5)
  };
};

const cleanupUploadedFile = async (filePath) => {
  if (!filePath) return;
  try {
    await fs.promises.unlink(path.resolve(filePath));
  } catch (error) {
    // noop
  }
};

module.exports = {
  DEFAULT_MAPPING,
  importQuestionsFromSpreadsheet,
  cleanupUploadedFile
};
