const normalizeQuery = (req, _res, next) => {
  if (!req.query || typeof req.query !== 'object') return next();

  const normalized = {};

  Object.entries(req.query).forEach(([key, rawValue]) => {
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return;

      if (key === 'page' || key === 'limit') {
        const parsed = Number(trimmed);
        if (Number.isFinite(parsed)) {
          normalized[key] = parsed;
        } else {
          normalized[key] = trimmed;
        }
        return;
      }

      normalized[key] = trimmed;
      return;
    }

    normalized[key] = value;
  });

  req.query = normalized;
  next();
};

module.exports = {
  normalizeQuery
};
