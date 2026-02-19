const mongoose = require('mongoose');

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value));

const validateObjectId = (value, field = 'id') => {
  return isObjectId(value) ? null : `${field} must be a valid ObjectId`;
};

module.exports = {
  isObjectId,
  validateObjectId
};
