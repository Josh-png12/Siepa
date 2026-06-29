const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },

    grade: {
      type: String,
      enum: ['9', '10', '11'],
      default: '11'
    },

    courses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course'
      }
    ],

    identificacion: {
      tipo: {
        type: String,
        enum: ['TI', 'CC', 'CE'],
        default: 'TI'
      },
      numero: String
    },

    telefono: String,
    acudiente: {
      nombre: String,
      telefono: String,
      email: String
    },

    activo: {
      type: Boolean,
      default: true
    },

    fechaInscripcion: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

studentSchema.index({ user: 1 });
studentSchema.index({ courses: 1 });
studentSchema.index({ grade: 1 });

studentSchema.virtual('progress', {
  ref: 'StudentProgress',
  localField: '_id',
  foreignField: 'student',
  justOne: true
});

module.exports = mongoose.model('Student', studentSchema);