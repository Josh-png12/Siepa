const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const getSaltRounds = () => {
  const parsed = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
  if (!Number.isInteger(parsed) || parsed < 8 || parsed > 15) return 10;
  return parsed;
};

const generateTokenPayload = (user) => ({
  id: user._id,
  name: user.name,
  role: user.role,
  features: user.features || {},
  institutionId: user.institutionId || 'default'
});

const signToken = (user) =>
  jwt.sign(
    {
      id: user._id,
      role: user.role,
      features: user.features || {},
      institutionId: user.institutionId || 'default'
    },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

const registerUser = async ({ name, email, password, role, institutionId = 'default' }) => {
  const safeEmail = String(email || '').trim().toLowerCase();
  const safePassword = String(password || '').trim();
  const safeName = String(name || '').trim();
  const safeRole = String(role || '').trim();
  const safeInstitutionId = String(institutionId || 'default').trim() || 'default';

  const existing = await User.findOne({ email: safeEmail }).lean();
  if (existing) throw new Error('USER_EXISTS');

  const hashedPassword = await bcrypt.hash(String(safePassword), getSaltRounds());
  const user = await User.create({
    name: safeName,
    email: safeEmail,
    password: hashedPassword,
    role: safeRole,
    institutionId: safeInstitutionId
  });

  return {
    user: generateTokenPayload(user),
    token: signToken(user)
  };
};

const loginUser = async ({ email, password }) => {
  const safeEmail = String(email || '').trim().toLowerCase();
  const safePassword = String(password || '');

  const user = await User.findOne({ email: safeEmail }).select('+password');

  if (process.env.NODE_ENV !== 'production') {
    console.log('[auth.service.login] user_found:', Boolean(user));
    console.log('[auth.service.login] password_field_present:', Boolean(user?.password));
  }

  if (!user) throw new Error('INVALID_CREDENTIALS');

  const isMatch = await bcrypt.compare(safePassword, String(user.password || ''));
  if (!isMatch) throw new Error('INVALID_CREDENTIALS');

  await User.updateOne({ _id: user._id }, { $set: { lastActivity: new Date() } });

  return {
    user: generateTokenPayload(user),
    token: signToken(user)
  };
};

module.exports = {
  registerUser,
  loginUser
};
