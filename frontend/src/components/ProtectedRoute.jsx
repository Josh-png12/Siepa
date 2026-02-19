import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

const roleToDashboard = {
  admin: '/dashboard/admin',
  docente: '/dashboard/teacher',
  estudiante: '/dashboard/student'
};

function ProtectedRoute({ children, allowedRoles }) {
  const { user, token, isTokenValid, logout } = useAuthStore();

  if (!user || !token) {
    return <Navigate to="/login" replace />;
  }

  if (!isTokenValid()) {
    logout();
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={roleToDashboard[user.role] || '/login'} replace />;
  }

  return children;
}

export default ProtectedRoute;
