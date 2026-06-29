const crypto = require('crypto');

const EXPIRY_SECONDS = 48 * 3600;

const getSecret = () => {
  const s = process.env.QR_SECRET;
  if (!s || s.length < 32) {
    throw new Error('QR_SECRET env var must be at least 32 characters');
  }
  return s;
};

/**
 * Generates a compact HMAC-SHA256 signed QR token (~187 chars with 25-char CUID IDs).
 * Payload: base64url(JSON[studentId, simulacroId, tenantId, issuedAt, expiresAt])
 * Format:  {payload_b64url}.{hmac_sha256_b64url}
 */
const generateQRToken = ({ studentId, simulacroId, tenantId }) => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + EXPIRY_SECONDS;

  const payload = Buffer.from(
    JSON.stringify([studentId, simulacroId, tenantId, issuedAt, expiresAt])
  ).toString('base64url');

  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');

  return `${payload}.${sig}`;
};

/**
 * Verifies an HMAC-SHA256 signed QR token.
 * Throws descriptive internal error codes; callers MUST return only 'QR inválido' to clients.
 * @returns {{ studentId, simulacroId, tenantId, issuedAt: Date, expiresAt: Date }}
 */
const verifyQRToken = (token) => {
  if (!token || typeof token !== 'string') throw new Error('INVALID_TOKEN_FORMAT');

  const dotIdx = token.lastIndexOf('.');
  if (dotIdx === -1) throw new Error('INVALID_TOKEN_FORMAT');

  const payload = token.slice(0, dotIdx);
  const receivedSigB64 = token.slice(dotIdx + 1);

  const expectedSig = crypto.createHmac('sha256', getSecret()).update(payload).digest();

  let receivedSig;
  try {
    receivedSig = Buffer.from(receivedSigB64, 'base64url');
  } catch {
    throw new Error('INVALID_TOKEN_FORMAT');
  }

  // Constant-time comparison to prevent timing attacks
  if (receivedSig.length !== expectedSig.length || !crypto.timingSafeEqual(expectedSig, receivedSig)) {
    throw new Error('INVALID_SIGNATURE');
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('INVALID_TOKEN_FORMAT');
  }

  if (!Array.isArray(parsed) || parsed.length < 5) throw new Error('INVALID_TOKEN_PAYLOAD');

  const [studentId, simulacroId, tenantId, issuedAt, expiresAt] = parsed;

  if (!studentId || !simulacroId || !tenantId || !issuedAt || !expiresAt) {
    throw new Error('INVALID_TOKEN_PAYLOAD');
  }

  if (Math.floor(Date.now() / 1000) > expiresAt) throw new Error('TOKEN_EXPIRED');

  return {
    studentId: String(studentId),
    simulacroId: String(simulacroId),
    tenantId: String(tenantId),
    issuedAt: new Date(issuedAt * 1000),
    expiresAt: new Date(expiresAt * 1000),
  };
};

module.exports = { generateQRToken, verifyQRToken };
