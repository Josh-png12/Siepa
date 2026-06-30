const { validateObjectId } = require('./commonValidators');

const VALID_STATUS = new Set([
  'draft',
  'answerKeyPending',
  'readyForUpload',
  'processing',
  'reviewing',
  'published',
  'archived'
]);

const VALID_OPTIONS  = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
const VALID_SESSIONS = new Set(['SESION_1', 'SESION_2', 'AMBAS']);

const normalizeAnswerKey = (answerKey = []) => {
  if (!Array.isArray(answerKey)) return null;

  return answerKey.map((row) => ({
    questionNumber: Number(row.questionNumber),
    correctOption: String(row.correctOption || '').toUpperCase()
  }));
};

const validateCreatePhysicalSimulacroPayload = (payload = {}) => {
  const errors = [];

  const title = String(payload.title || '').trim();
  if (!title) errors.push('title is required');

  const teacherError = validateObjectId(payload.teacher, 'teacher');
  if (teacherError) errors.push(teacherError);

  if (!Array.isArray(payload.courses) || payload.courses.length === 0) {
    errors.push('courses must be a non-empty array');
  } else {
    payload.courses.forEach((courseId) => {
      const courseError = validateObjectId(courseId, 'courseId');
      if (courseError) errors.push(courseError);
    });
  }

  const date = new Date(payload.date);
  if (Number.isNaN(date.getTime())) errors.push('date is invalid');

  const startTime = String(payload.startTime || '').trim();
  const endTime = String(payload.endTime || '').trim();
  if (!startTime) errors.push('startTime is required');
  if (!endTime) errors.push('endTime is required');

  const totalQuestions = Number(payload.totalQuestions);
  if (!Number.isInteger(totalQuestions) || totalQuestions < 1 || totalQuestions > 147) {
    errors.push('totalQuestions must be an integer between 1 and 147');
  }

  const reviewWindowDays = Number(payload.reviewWindowDays);
  if (!Number.isInteger(reviewWindowDays) || reviewWindowDays < 1 || reviewWindowDays > 60) {
    errors.push('reviewWindowDays must be an integer between 1 and 60');
  }

  const normalizedAnswerKey = normalizeAnswerKey(payload.answerKey || []);
  if (normalizedAnswerKey === null) {
    errors.push('answerKey must be an array when provided');
  } else if (normalizedAnswerKey.length > 0) {
    const seen = new Set();
    normalizedAnswerKey.forEach((row) => {
      if (!Number.isInteger(row.questionNumber) || row.questionNumber < 1 || row.questionNumber > totalQuestions) {
        errors.push(`answerKey.questionNumber ${row.questionNumber} out of range`);
      }
      if (!VALID_OPTIONS.has(row.correctOption)) {
        errors.push(`answerKey.correctOption ${row.correctOption} invalid`);
      }
      const key = `${row.questionNumber}`;
      if (seen.has(key)) errors.push(`Duplicated answerKey entry for question ${row.questionNumber}`);
      seen.add(key);
    });
  }

  const sessionRaw = String(payload.session || '').toUpperCase();
  const session = VALID_SESSIONS.has(sessionRaw) ? sessionRaw : 'SESION_1';

  if (errors.length) return { errors };

  return {
    value: {
      title,
      description: String(payload.description || '').trim(),
      teacher: String(payload.teacher),
      courses: payload.courses.map(String),
      date,
      startTime,
      endTime,
      totalQuestions,
      reviewWindowDays,
      session,
      answerKey: normalizedAnswerKey
    }
  };
};

const validateReviewPayload = (payload = {}) => {
  const errors = [];

  const sheetIdError = validateObjectId(payload.sheetId, 'sheetId');
  if (sheetIdError) errors.push(sheetIdError);

  if (!Array.isArray(payload.corrections) || payload.corrections.length === 0) {
    errors.push('corrections must be a non-empty array');
  } else {
    payload.corrections.forEach((row) => {
      const questionNumber = Number(row.questionNumber);
      const correctedOption = String(row.correctedOption || '').toUpperCase();
      if (!Number.isInteger(questionNumber) || questionNumber < 1) {
        errors.push('corrections.questionNumber invalid');
      }
      if (!VALID_OPTIONS.has(correctedOption)) {
        errors.push('corrections.correctedOption invalid');
      }
    });
  }

  if (errors.length) return { errors };

  return {
    value: {
      sheetId: String(payload.sheetId),
      corrections: payload.corrections.map((row) => ({
        questionNumber: Number(row.questionNumber),
        correctedOption: String(row.correctedOption).toUpperCase()
      }))
    }
  };
};

const validateStatus = (status) => VALID_STATUS.has(status);

module.exports = {
  validateCreatePhysicalSimulacroPayload,
  validateReviewPayload,
  validateStatus,
  VALID_OPTIONS
};
