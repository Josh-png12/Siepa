// backend/src/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const protect = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Tokens issued before schoolId was added to the payload need a DB lookup.
    if (!decoded.schoolId) {
      const dbUser = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { schoolId: true }
      });
      if (dbUser) decoded.schoolId = dbUser.schoolId;
    }

    req.user = decoded; // { id, name, role, schoolId, features }
    next();
  } catch (_err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const roleCheck = (...rolesInput) => {
  const roles = Array.isArray(rolesInput[0]) ? rolesInput[0] : rolesInput;

  return (req, res, next) => {
    if (!req.user?.role || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    next();
  };
};

module.exports = { protect, roleCheck };
