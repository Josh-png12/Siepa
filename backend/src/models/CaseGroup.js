const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    caption: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

const caseGroupSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    contextText: { type: String, trim: true, default: '' },
    contextLatex: { type: String, trim: true, default: '' },
    contextImages: { type: [imageSchema], default: [] },
    metadata: {
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('CaseGroup', caseGroupSchema);
