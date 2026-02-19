const mongoose = require('mongoose');

const pdfImportAssetSchema = new mongoose.Schema(
  {
    institutionId: { type: String, default: 'default', index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'PdfImportJob', required: true, index: true },
    filePath: { type: String, required: true },
    type: { type: String, required: true, trim: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('PdfImportAsset', pdfImportAssetSchema);
