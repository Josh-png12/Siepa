import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { useEffect } from 'react';

import Login from './pages/Login.jsx';

import StudentLayout from './pages/student/StudentLayout.jsx';
import StudentHome from './pages/student/StudentHome.jsx';
import StudentSimulacros from './pages/student/StudentSimulacros.jsx';
import StudentResults from './pages/student/StudentResults.jsx';
import StudentProgress from './pages/student/StudentProgress.jsx';
import StudentStudyPlan from './pages/student/StudentStudyPlan.jsx';
import StudentProfile from './pages/student/StudentProfile.jsx';

import TeacherDashboard from './pages/teacher/TeacherDashboard.jsx';
import TeacherCourses from './pages/teacher/TeacherCourses.jsx';
import CourseDetailLayout from './pages/teacher/CourseDetailLayout.jsx';
import CourseDashboard from './pages/teacher/CourseDashboard.jsx';
import CourseStudents from './pages/teacher/CourseStudents.jsx';
import CourseMaterials from './pages/teacher/CourseMaterials.jsx';
import TeacherLayout from './pages/teacher/TeacherLayout.jsx';
import SimulacrosList from './pages/teacher/SimulacrosList.jsx';
import SimulacroCreate from './pages/teacher/SimulacroCreate.jsx';
import SimulacroAutoCreate from './pages/teacher/SimulacroAutoCreate.jsx';
import SimulacroDetail from './pages/teacher/SimulacroDetail.jsx';
import SimulacroTake from './pages/teacher/SimulacroTake.jsx';
import SimulacroResults from './pages/teacher/SimulacroResults.jsx';
import PhysicalSimulacrosLayout from './pages/teacher/PhysicalSimulacros/PhysicalSimulacrosLayout.jsx';
import PhysicalSimulacrosList from './pages/teacher/PhysicalSimulacros/PhysicalSimulacrosList.jsx';
import PhysicalSimulacroCreate from './pages/teacher/PhysicalSimulacros/PhysicalSimulacroCreate.jsx';
import PhysicalSimulacroDetail from './pages/teacher/PhysicalSimulacros/PhysicalSimulacroDetail.jsx';
import TeacherOCRDashboard from './pages/teacher/TeacherOCRDashboard.jsx';
import TeacherOCRManager from './pages/teacher/TeacherOCRManager.jsx';
import QuestionsList from './pages/teacher/QuestionsList.jsx';
import CreateQuestion from './pages/teacher/CreateQuestion.jsx';
import EditQuestion from './pages/teacher/EditQuestion.jsx';
import TeacherPdfImportDetail from './pages/teacher/TeacherPdfImportDetail.jsx';
import PdfImport from './pages/teacher/PdfImport.jsx';

import AdminLayout from './pages/admin/AdminLayout.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminUsers from './pages/admin/AdminUsers.jsx';
import AdminCourses from './pages/admin/AdminCourses.jsx';
import AdminQuestionBank from './pages/admin/AdminQuestionBank.jsx';
import AdminSimulacros from './pages/admin/AdminSimulacros.jsx';
import AdminTemplates from './pages/admin/AdminTemplates.jsx';
import AdminAnalytics from './pages/admin/AdminAnalytics.jsx';
import AdminConfig from './pages/admin/AdminConfig.jsx';
import AdminAuditLogs from './pages/admin/AdminAuditLogs.jsx';
import AdminPdfImport from './pages/admin/AdminPdfImport.jsx';
import AdminPdfImportDetail from './pages/admin/AdminPdfImportDetail.jsx';

import ProtectedRoute from './components/ProtectedRoute.jsx';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />

      <Route
        path="/dashboard/estudiante"
        element={
          <ProtectedRoute allowedRoles={['estudiante']}>
            <StudentLayout />
          </ProtectedRoute>
        }>
        <Route index element={<StudentHome />} />
        <Route path="simulacros" element={<StudentSimulacros />} />
        <Route path="resultados" element={<StudentResults />} />
        <Route path="resultados/:evaluationId" element={<StudentResults />} />
        <Route path="resultados/:id" element={<StudentResults />} />
        <Route path="progreso" element={<StudentProgress />} />
        <Route path="plan-estudio" element={<StudentStudyPlan />} />
        <Route path="perfil" element={<StudentProfile />} />
      </Route>
      <Route path="/dashboard/student" element={<Navigate to="/dashboard/estudiante" replace />} />

      <Route
        path="/simulacros"
        element={<Navigate to="/dashboard/estudiante/simulacros" replace />}
      />

      <Route
        path="/simulacros/:id/take"
        element={
          <ProtectedRoute allowedRoles={['estudiante']}>
            <SimulacroTake />
          </ProtectedRoute>
        }
      />

      <Route
        path="/simulacros/:id/results"
        element={
          <ProtectedRoute allowedRoles={['estudiante']}>
            <SimulacroResults />
          </ProtectedRoute>
        }
      />

      <Route
        path="/mi-progreso"
        element={<Navigate to="/dashboard/estudiante/progreso" replace />}
      />

      <Route
        path="/competencias"
        element={<Navigate to="/dashboard/estudiante/progreso" replace />}
      />

      <Route
        path="/resultados/:evaluationId"
        element={<LegacyStudentResultRedirect />}
      />

      <Route
        path="/dashboard/docente"
        element={
          <ProtectedRoute allowedRoles={['docente']}>
            <TeacherLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<TeacherDashboard />} />
        <Route path="cursos" element={<TeacherCourses />} />
        <Route path="cursos/:courseId" element={<CourseDetailLayout />}>
          <Route index element={<CourseDashboard />} />
          <Route path="students" element={<CourseStudents />} />
          <Route path="materials" element={<CourseMaterials />} />
        </Route>

        <Route path="simulacros">
          <Route index element={<SimulacrosList />} />
          <Route path="crear" element={<SimulacroCreate />} />
          <Route path="auto-crear" element={<SimulacroAutoCreate />} />
          <Route path=":id" element={<SimulacroDetail />} />
          <Route path=":id/resultados" element={<SimulacroResults />} />
          <Route path="fisico" element={<PhysicalSimulacrosLayout />}>
            <Route index element={<PhysicalSimulacrosList />} />
            <Route path="crear" element={<PhysicalSimulacroCreate />} />
            <Route path=":id" element={<PhysicalSimulacroDetail />} />
          </Route>
        </Route>

        <Route path="ocr" element={<TeacherOCRDashboard />} />
        <Route path="ocr/:simulacroId" element={<TeacherOCRManager />} />

        <Route path="preguntas" element={<QuestionsList />} />
        <Route path="preguntas/nueva" element={<CreateQuestion />} />
        <Route path="preguntas/:id/editar" element={<EditQuestion />} />
        <Route path="pdf-import" element={<PdfImport />} />
        <Route path="pdf-import/:id" element={<TeacherPdfImportDetail />} />
      </Route>
      <Route path="/dashboard/teacher" element={<Navigate to="/dashboard/docente" replace />} />

      <Route
        path="/dashboard/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="courses" element={<AdminCourses />} />
        <Route path="questions" element={<AdminQuestionBank />} />
        <Route path="simulacros" element={<AdminSimulacros />} />
        <Route path="templates" element={<AdminTemplates />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="audit" element={<AdminAuditLogs />} />
        <Route path="config" element={<AdminConfig />} />
        <Route path="pdf-import" element={<AdminPdfImport />} />
        <Route path="pdf-import/:id" element={<AdminPdfImportDetail />} />
      </Route>

      <Route path="/dashboard" element={<RoleRedirect />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function RoleRedirect() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role) {
      const dashboardByRole = {
        admin: '/dashboard/admin',
        docente: '/dashboard/teacher',
        estudiante: '/dashboard/student'
      };
      navigate(dashboardByRole[user.role] || '/login', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  }, [user, navigate]);

  return null;
}

function LegacyStudentResultRedirect() {
  const { evaluationId } = useParams();
  return <Navigate to={`/dashboard/estudiante/resultados/${evaluationId}`} replace />;
}

export default App;
