const parsePagination = (query = {}) => {
  const page = Math.max(parseInt(query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || '20', 10), 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};

const validateUploadPayload = (payload = {}) => {
  const errors = [];
  if (payload.pagePayloadsByFileName) {
    try {
      const parsed = typeof payload.pagePayloadsByFileName === 'string'
        ? JSON.parse(payload.pagePayloadsByFileName)
        : payload.pagePayloadsByFileName;
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        errors.push('pagePayloadsByFileName must be an object');
      }
    } catch (_error) {
      errors.push('pagePayloadsByFileName must be valid JSON');
    }
  }
  return { errors };
};

module.exports = {
  parsePagination,
  validateUploadPayload
};
