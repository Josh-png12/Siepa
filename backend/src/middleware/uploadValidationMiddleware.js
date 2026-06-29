// Validates file uploads: size, MIME type, and file count

const path = require('path');
const ApiError = require('../utils/ApiError');

const DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const DEFAULT_MAX_FILES = 20;

// Whitelist of allowed MIME types and their extensions
const ALLOWED_TYPES = new Set([
  // PDF
  'application/pdf',
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
  // Documents
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Text
  'text/plain',
  'text/csv',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif',
  '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
  '.txt', '.csv',
]);

/**
 * Creates a middleware that validates uploaded files.
 *
 * @param {Object} [options]
 * @param {number} [options.maxFileSize] - Maximum file size in bytes (default 50 MB)
 * @param {number} [options.maxFiles] - Maximum number of files (default 20)
 * @returns {Function} Express middleware
 */
function validateUploads(options = {}) {
  const maxFileSize = options.maxFileSize || DEFAULT_MAX_FILE_SIZE;
  const maxFiles = options.maxFiles || DEFAULT_MAX_FILES;

  return (req, res, next) => {
    // If this is not a file upload route, skip
    if (!req.file && !req.files) {
      return next();
    }

    const files = req.files ? (Array.isArray(req.files) ? req.files : [req.files]) : [req.file].filter(Boolean);

    // Check file count
    if (files.length > maxFiles) {
      return next(new ApiError(400, `Too many files. Maximum allowed: ${maxFiles}`));
    }

    // Validate each file
    for (const file of files) {
      // Check size
      if (file.size > maxFileSize) {
        const sizeMB = (maxFileSize / (1024 * 1024)).toFixed(0);
        return next(new ApiError(413, `File "${file.originalname}" exceeds maximum size of ${sizeMB} MB`));
      }

      // Check file size is positive (not empty)
      if (file.size === 0) {
        return next(new ApiError(400, `File "${file.originalname}" is empty`));
      }

      // Validate MIME type
      if (file.mimetype && !ALLOWED_TYPES.has(file.mimetype)) {
        // Also check by extension as fallback
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          return next(new ApiError(415, `File type not allowed: "${file.mimetype || ext}". Accepted types: PDF, images, Office documents, CSV, TXT`));
        }
      }

      // Sanitize filename - prevent path traversal
      const sanitizedName = path.basename(file.originalname || 'unnamed');
      if (sanitizedName !== file.originalname) {
        file.originalname = sanitizedName;
      }

      // Check filename length
      if (sanitizedName.length > 255) {
        return next(new ApiError(400, `Filename too long: "${sanitizedName.substring(0, 50)}..."`));
      }
    }

    next();
  };
}

module.exports = { validateUploads, ALLOWED_TYPES, ALLOWED_EXTENSIONS };
