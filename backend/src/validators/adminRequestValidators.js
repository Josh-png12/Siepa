const ApiError = require('../utils/ApiError');

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Prisma uses CUIDs/UUIDs, not MongoDB ObjectIds — same regex as objectIdMiddleware.js
const CUID_RE = /^[a-zA-Z0-9_-]{10,64}$/;
const objectId = (value) => CUID_RE.test(String(value));

const validateValue = (fieldPath, value, rule, errors) => {
  if (value === undefined || value === null) {
    if (rule.required) errors.push(`${fieldPath} es requerido`);
    return;
  }

  switch (rule.type) {
    case 'string': {
      if (typeof value !== 'string') {
        errors.push(`${fieldPath} debe ser string`);
        return;
      }
      if (rule.nonEmpty && !String(value).trim()) {
        errors.push(`${fieldPath} no puede estar vacio`);
      }
      if (rule.minLength && String(value).length < rule.minLength) {
        errors.push(`${fieldPath} minimo ${rule.minLength} caracteres`);
      }
      if (rule.enum && !rule.enum.includes(value)) {
        errors.push(`${fieldPath} valor invalido`);
      }
      break;
    }
    case 'number': {
      const num = Number(value);
      if (!Number.isFinite(num)) {
        errors.push(`${fieldPath} debe ser numerico`);
        return;
      }
      if (rule.min !== undefined && num < rule.min) errors.push(`${fieldPath} debe ser >= ${rule.min}`);
      if (rule.max !== undefined && num > rule.max) errors.push(`${fieldPath} debe ser <= ${rule.max}`);
      break;
    }
    case 'boolean': {
      const isBoolLike = typeof value === 'boolean' || value === 'true' || value === 'false';
      if (!isBoolLike) {
        errors.push(`${fieldPath} debe ser boolean`);
      }
      break;
    }
    case 'objectId': {
      if (!objectId(value)) errors.push(`${fieldPath} debe ser ObjectId valido`);
      break;
    }
    case 'jsonString': {
      if (typeof value !== 'string') {
        errors.push(`${fieldPath} debe ser JSON string`);
        return;
      }
      try {
        JSON.parse(value);
      } catch (_error) {
        errors.push(`${fieldPath} JSON invalido`);
      }
      break;
    }
    case 'arrayOfObjectId': {
      if (!Array.isArray(value)) {
        errors.push(`${fieldPath} debe ser array`);
        return;
      }
      value.forEach((item, index) => {
        if (!objectId(item)) errors.push(`${fieldPath}[${index}] debe ser ObjectId valido`);
      });
      break;
    }
    case 'object': {
      if (!isObject(value)) {
        errors.push(`${fieldPath} debe ser objeto`);
        return;
      }
      const nestedShape = rule.shape || {};
      const nestedKeys = Object.keys(value);
      const allowedNested = Object.keys(nestedShape);
      if (rule.allowUnknown === false) {
        nestedKeys.forEach((nestedKey) => {
          if (!allowedNested.includes(nestedKey)) {
            errors.push(`${fieldPath}.${nestedKey} no permitido`);
          }
        });
      }
      allowedNested.forEach((nestedKey) => {
        validateValue(`${fieldPath}.${nestedKey}`, value[nestedKey], nestedShape[nestedKey], errors);
      });
      break;
    }
    default:
      break;
  }
};

const validateWithSchema = (source, schema, options = {}) => {
  const { allowUnknown = false } = options;
  const errors = [];
  const payload = source || {};
  const payloadKeys = Object.keys(payload);
  const allowedKeys = Object.keys(schema);

  if (!allowUnknown) {
    payloadKeys.forEach((key) => {
      if (!allowedKeys.includes(key)) {
        errors.push(`${key} no permitido`);
      }
    });
  }

  allowedKeys.forEach((key) => {
    validateValue(key, payload[key], schema[key], errors);
  });

  if (errors.length) {
    throw new ApiError(400, 'ValidationError', errors);
  }
};

const validateBody = (schema) => (req, _res, next) => {
  try {
    validateWithSchema(req.body, schema);
    next();
  } catch (error) {
    next(error);
  }
};

const validateQuery = (schema) => (req, _res, next) => {
  try {
    validateWithSchema(req.query, schema, { allowUnknown: true });
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  validateBody,
  validateQuery
};
