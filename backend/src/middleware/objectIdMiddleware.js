const mongoose = require('mongoose');

const validateObjectIdParam = (paramName) => (req, res, next) => {
  const value = req.params?.[paramName];
  if (!mongoose.Types.ObjectId.isValid(String(value))) {
    return res.status(400).json({
      success: false,
      data: null,
      message: 'ValidationError',
      errors: [`${paramName} invalido`]
    });
  }
  return next();
};

module.exports = {
  validateObjectIdParam
};
