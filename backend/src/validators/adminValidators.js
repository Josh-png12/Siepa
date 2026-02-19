const { isObjectId } = require('./commonValidators');

const parsePagination = (query = {}) => {
  const rawPage = Number(query.page);
  const rawLimit = Number(query.limit);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const limitBase = Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.floor(rawLimit) : 20;
  const limit = Math.min(100, Math.max(1, limitBase));
  return { page, limit, skip: (page - 1) * limit };
};

const ensureObjectId = (value, fieldName) => {
  if (!isObjectId(value)) {
    const error = new Error(`${fieldName} invalido`);
    error.status = 400;
    throw error;
  }
};

const validateUserCreate = (payload = {}) => {
  const errors = [];
  if (!payload.name) errors.push('name es requerido');
  if (!payload.email) errors.push('email es requerido');
  if (!payload.password || String(payload.password).length < 6) errors.push('password minimo 6 caracteres');
  if (!payload.role || !['admin', 'docente', 'estudiante'].includes(payload.role)) {
    errors.push('role invalido');
  }
  return errors;
};

const validateCourseCreate = (payload = {}) => {
  const errors = [];
  if (!payload.name) errors.push('name es requerido');
  if (!payload.grade) errors.push('grade es requerido');
  if (!payload.year) errors.push('year es requerido');
  return errors;
};

module.exports = {
  parsePagination,
  ensureObjectId,
  validateUserCreate,
  validateCourseCreate
};
