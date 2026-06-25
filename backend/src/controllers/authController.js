const { loginUser, registerUser } = require('../services/authService');

const register = async (req, res) => {
  try {
    const { name, email, password, role, schoolSlug, institutionId } = req.body || {};

    const result = await registerUser({
      name,
      email,
      password,
      role,
      schoolSlug: schoolSlug || institutionId || 'default'
    });

    return res.status(201).json({
      success: true,
      data: {
        user: {
          ...result.user,
          institutionId: result.user.schoolId
        },
        token: result.token
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[auth.register] error:', error.message);
    }

    if (error.message === 'SCHOOL_NOT_FOUND') {
      return res.status(400).json({ success: false, message: 'ValidationError', errors: ['Institución no encontrada'] });
    }
    if (error.message === 'USER_EXISTS') {
      return res.status(400).json({ success: false, message: 'ValidationError', errors: ['Usuario ya existe'] });
    }

    return res.status(500).json({ success: false, message: 'InternalError', errors: ['Error en registro'] });
  }
};

const login = async (req, res) => {
  try {
    const { email, password, schoolSlug, institutionId } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'ValidationError',
        errors: [!email ? 'email es requerido' : 'password es requerido']
      });
    }

    const result = await loginUser({
      email,
      password,
      schoolSlug: schoolSlug || institutionId || 'default'
    });

    return res.json({
      success: true,
      data: {
        user: {
          ...result.user,
          institutionId: result.user.schoolId
        },
        token: result.token
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[auth.login] error:', error.message);
    }

    if (error.message === 'INVALID_CREDENTIALS') {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }

    return res.status(500).json({ success: false, message: 'InternalError' });
  }
};

module.exports = { register, login };
