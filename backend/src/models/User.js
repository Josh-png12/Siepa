// backend/src/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  institutionId: {
    type: String,
    default: 'default',
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['estudiante', 'docente', 'admin'],
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active',
    index: true
  },
  deletedAt: {
    type: Date,
    default: null,
    index: true
  },

  // Campos específicos del estudiante
  documentType: {
    type: String,
    enum: ['CC', 'TI', 'CE', 'PASAPORTE'],
  },
  documentNumber: String,
  institution: String,
  grade: String,

  // Progreso TRI (muy importante)
  currentTheta: {
    type: Number,
    default: 0
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  features: {
    physicalSimulacros: {
      type: Boolean,
      default: false
    },
    ocrEnabled: {
      type: Boolean,
      default: true
    }
  }
}, { timestamps: true });

userSchema.index({ institutionId: 1, role: 1, status: 1 });

// ==================== HASH DE CONTRASEÑA ====================
// Se ejecuta automáticamente antes de guardar
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  if (typeof this.password === 'string' && /^\$2[aby]\$\d{2}\$/.test(this.password)) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ==================== MÉTODO PARA COMPARAR CONTRASEÑA ====================
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
