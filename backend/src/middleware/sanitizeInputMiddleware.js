const sanitize = (value) => {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, nested]) => {
      const safeKey = key.replace(/\$/g, '').replace(/\./g, '');
      acc[safeKey] = sanitize(nested);
      return acc;
    }, {});
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return value;
};

const sanitizeInput = (req, _res, next) => {
  if (req.body && typeof req.body === 'object') req.body = sanitize(req.body);
  if (req.query && typeof req.query === 'object') req.query = sanitize(req.query);
  if (req.params && typeof req.params === 'object') req.params = sanitize(req.params);
  next();
};

module.exports = {
  sanitizeInput
};
