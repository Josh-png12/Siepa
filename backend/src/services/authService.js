const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const getSaltRounds = () => {
  const parsed = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
  if (!Number.isInteger(parsed) || parsed < 8 || parsed > 15) return 10;
  return parsed;
};

// schoolId is now included in the JWT payload so every service
// can scope queries to the correct tenant without an extra DB lookup
const generateTokenPayload = (user) => ({
  id: user.id,
  name: user.name,
  role: user.role,
  schoolId: user.schoolId,
  features: {
    physicalSimulacros: user.featurePhysicalSimulacros,
    ocrEnabled: user.featureOcrEnabled
  }
});

const signToken = (user) =>
  jwt.sign(generateTokenPayload(user), process.env.JWT_SECRET, { expiresIn: '30d' });

// ── REGISTER ─────────────────────────────────────────────────────────────────
// schoolSlug identifies the tenant (maps to School.slug).
// @@unique([email, schoolId]) allows the same email in different schools.
const registerUser = async ({ name, email, password, role, schoolSlug = 'default' }) => {
  const safeEmail = String(email || '').trim().toLowerCase();
  const safePassword = String(password || '').trim();
  const safeName = String(name || '').trim();
  const safeRole = String(role || '').trim();
  const safeSlug = String(schoolSlug || 'default').trim() || 'default';

  const school = await prisma.school.findUnique({ where: { slug: safeSlug } });
  if (!school) throw new Error('SCHOOL_NOT_FOUND');

  const existing = await prisma.user.findFirst({
    where: { email: safeEmail, schoolId: school.id }
  });
  if (existing) throw new Error('USER_EXISTS');

  const hashedPassword = await bcrypt.hash(safePassword, getSaltRounds());

  const user = await prisma.user.create({
    data: {
      schoolId: school.id,
      name: safeName,
      email: safeEmail,
      password: hashedPassword,
      role: safeRole
    }
  });

  return {
    user: generateTokenPayload(user),
    token: signToken(user)
  };
};

// ── LOGIN ─────────────────────────────────────────────────────────────────────
// Requires schoolSlug so we can scope the email lookup to the correct tenant.
// Frontend must send schoolSlug in the login request body.
const loginUser = async ({ email, password, schoolSlug }) => {
  const safeEmail = String(email || '').trim().toLowerCase();
  const safePassword = String(password || '');
  const safeSlug = String(schoolSlug || 'default').trim() || 'default';

  const school = await prisma.school.findUnique({ where: { slug: safeSlug } });
  if (!school) throw new Error('INVALID_CREDENTIALS');

  const user = await prisma.user.findFirst({
    where: { email: safeEmail, schoolId: school.id }
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log('[auth.service.login] user_found:', Boolean(user));
  }

  if (!user) throw new Error('INVALID_CREDENTIALS');

  const isMatch = await bcrypt.compare(safePassword, String(user.password || ''));
  if (!isMatch) throw new Error('INVALID_CREDENTIALS');

  await prisma.user.update({
    where: { id: user.id },
    data: { lastActivity: new Date() }
  });

  return {
    user: generateTokenPayload(user),
    token: signToken(user)
  };
};

module.exports = { registerUser, loginUser };
