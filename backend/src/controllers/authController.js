const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const allowedRoles = ['admin', 'docente', 'estudiante'];

const getSaltRounds = () => {
  const parsed = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
  if (!Number.isInteger(parsed) || parsed < 8 || parsed > 15) return 10;
  return parsed;
};

const validationError = (res, message, errors = []) =>
  res.status(400).json({
    success: false,
    message,
    errors
  });

const unauthorizedError = (res, message = 'Credenciales inválidas') =>
  res.status(401).json({
    success: false,
    message
  });

const generateToken = (id, role, features = {}, institutionId = 'default') =>
  jwt.sign(
    { id, role, features, institutionId },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

const register = async (req, res) => {
  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const { name, email, password, role, institutionId } = payload;

    const safeName = typeof name === 'string' ? name.trim() : '';
    const safeEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const safePassword = typeof password === 'string' ? password.trim() : '';
    const safeRole = typeof role === 'string' ? role.trim() : '';
    const safeInstitutionId = typeof institutionId === 'string' && institutionId.trim()
      ? institutionId.trim()
      : 'default';

    const errors = [];
    if (!safeName) errors.push('name es requerido');
    if (!safeEmail) errors.push('email es requerido');
    if (!safePassword) errors.push('password es requerido');
    if (safePassword && safePassword.length < 6) errors.push('password debe tener al menos 6 caracteres');
    if (!allowedRoles.includes(safeRole)) errors.push(`role invalido, use: ${allowedRoles.join(', ')}`);
    if (errors.length) return validationError(res, 'ValidationError', errors);

    const userExists = await User.findOne({ email: safeEmail }).lean();
    if (userExists) return validationError(res, 'ValidationError', ['Usuario ya existe']);

    const hashedPassword = await bcrypt.hash(String(safePassword), getSaltRounds());

    const user = await User.create({
      name: safeName,
      email: safeEmail,
      password: hashedPassword,
      role: safeRole,
      institutionId: safeInstitutionId
    });

    return res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          role: user.role,
          features: user.features || {},
          institutionId: user.institutionId
        },
        token: generateToken(user._id, user.role, user.features || {}, user.institutionId)
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('register error:', error);
    }
    return res.status(500).json({
      success: false,
      message: 'InternalError',
      errors: ['Error en registro']
    });
  }
};

const login = async (req, res) => {
  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const password = typeof payload.password === 'string' ? payload.password : '';

    const errors = [];
    if (!email) errors.push('email es requerido');
    if (!password) errors.push('password es requerido');
    if (errors.length) return validationError(res, 'ValidationError', errors);

    const user = await User.findOne({ email }).select('+password');

    if (process.env.NODE_ENV !== 'production') {
      console.log('[auth.login] user_found:', Boolean(user));
      console.log('[auth.login] password_field_present:', Boolean(user?.password));
    }

    if (!user) return unauthorizedError(res, 'Credenciales inválidas');

    const isMatch = await bcrypt.compare(String(password), String(user.password || ''));
    if (!isMatch) return unauthorizedError(res, 'Credenciales inválidas');

    await User.updateOne({ _id: user._id }, { $set: { lastActivity: new Date() } });

    return res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          role: user.role,
          features: user.features || {},
          institutionId: user.institutionId
        },
        token: generateToken(user._id, user.role, user.features || {}, user.institutionId)
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('login error:', error);
    }
    return res.status(500).json({
      success: false,
      message: 'InternalError'
    });
  }
};

module.exports = { register, login };
