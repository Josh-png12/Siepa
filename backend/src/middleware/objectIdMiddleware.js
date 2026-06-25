// Prisma uses CUIDs (e.g. clxxxxxx...) not MongoDB ObjectIds.
// Validate that a route param is a plausible CUID/UUID: non-empty, 10-64 chars, alphanumeric+hyphen.
const CUID_RE = /^[a-zA-Z0-9_-]{10,64}$/;

const validateObjectIdParam = (paramName) => (req, res, next) => {
  const value = String(req.params?.[paramName] || '').trim();
  if (!value || !CUID_RE.test(value)) {
    return res.status(400).json({
      success: false,
      data: null,
      message: 'ValidationError',
      errors: [`${paramName} invalido`]
    });
  }
  return next();
};

module.exports = { validateObjectIdParam };
