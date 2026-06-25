// frontend/src/services/api.js
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
});

const sanitizePaginationParam = (key, value) => {
  if (key === 'page') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.floor(parsed);
  }
  if (key === 'limit') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return 20;
    return Math.min(100, Math.floor(parsed));
  }
  return value;
};

const cleanParams = (params = {}) =>
  Object.entries(params).reduce((acc, [key, value]) => {
    if (value === undefined || value === null) return acc;
    if (typeof value === 'string' && value.trim() === '') return acc;
    acc[key] = sanitizePaginationParam(key, value);
    return acc;
  }, {});

api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    const normalizedUrl = String(config.url || '');

    if (normalizedUrl.startsWith('/admin') && !token) {
      return Promise.reject(new Error('NO_AUTH_TOKEN'));
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      try {
        useAuthStore.getState().logout();
      } catch (_e) {
        // noop
      }
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.replace('/login');
      }
    }
    return Promise.reject(error);
  }
);

// ==================== AUTH ====================
export const login = (data) => api.post('/auth/login', data);
export const register = (data) => api.post('/auth/register', data);

// ==================== BOOKLETS ====================
export const getBooklets = () => api.get('/booklets').then((res) => res.data);
export const getBooklet = (id) => api.get(`/booklets/${id}`).then((res) => res.data);
export const createBooklet = (data) => api.post('/booklets', data);

// ==================== EVALUATIONS ====================
export const startEvaluation = (bookletId) =>
  api.post(`/evaluations/start/${bookletId}`).then((res) => res.data);

export const submitEvaluation = (responseId, answers) =>
  api.post(`/evaluations/submit/${responseId}`, { answers });

export const getEvaluationResult = (evaluationId) =>
  api.get(`/evaluations/${evaluationId}/result`).then((res) => res.data);

// ==================== REPORTS ====================
export const getReport = (id) => api.get(`/reports/${id}`).then((res) => res.data);

// ==================== QUESTION BANK ====================
export const listQuestions = (params = {}) =>
  api.get('/questions', { params }).then((res) => res.data);

export const getQuestion = (id) => api.get(`/questions/${id}`).then((res) => res.data);

export const createQuestion = (formData) =>
  api
    .post('/questions', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    .then((res) => res.data);

export const updateQuestion = (id, formData) =>
  api
    .put(`/questions/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    .then((res) => res.data);

export const deleteQuestion = (id) => api.delete(`/questions/${id}`).then((res) => res.data);

export const publishQuestion = (id) =>
  api.post(`/questions/${id}/publish`).then((res) => res.data);

export const getQuestionVersions = (id) =>
  api.get(`/questions/${id}/versions`).then((res) => res.data);

export const restoreQuestionVersion = (id, versionId) =>
  api.post(`/questions/${id}/versions/${versionId}/restore`).then((res) => res.data);

export const importQuestionsBatch = (formData) =>
  api
    .post('/questions/batch/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    .then((res) => res.data);

export const importQuestionsExcel = (formData) =>
  api
    .post('/questions/import/excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    .then((res) => res.data);

export const updateQuestionStats = (responses) =>
  api.post('/questions/stats/update', { responses }).then((res) => res.data);

// ==================== SIMULACROS ====================
export const createManualSimulacro = (data) =>
  api.post('/simulacros/manual', data).then((res) => res.data);

export const createAutoSimulacro = (data) =>
  api.post('/simulacros/auto', data).then((res) => res.data);

export const listTeacherSimulacros = (params = {}) =>
  api.get('/simulacros', { params }).then((res) => res.data);

export const getTeacherSimulacro = (id) =>
  api.get(`/simulacros/${id}`).then((res) => res.data);

export const updateTeacherSimulacro = (id, data) =>
  api.put(`/simulacros/${id}`, data).then((res) => res.data);

export const publishTeacherSimulacro = (id) =>
  api.put(`/simulacros/${id}/publish`).then((res) => res.data);

export const deleteTeacherSimulacro = (id) =>
  api.delete(`/simulacros/${id}`).then((res) => res.data);

export const listAvailableSimulacros = (params = {}) =>
  api.get('/simulacros/available', { params }).then((res) => res.data);

export const startSimulacroAttempt = (id) =>
  api.post(`/simulacros/${id}/start`).then((res) => res.data);

export const submitSimulacroAttempt = (id, data) =>
  api.post(`/simulacros/${id}/submit`, data).then((res) => res.data);

export const getSimulacroStudentResults = (id) =>
  api.get(`/simulacros/${id}/results`).then((res) => res.data);

// ==================== COURSE MANAGEMENT ====================
export const getCourseDashboard = (courseId) =>
  api.get(`/courses/${courseId}/dashboard`).then((res) => res.data);

export const getTeacherDashboardInsights = () =>
  api.get('/teacher/insights/dashboard').then((res) => res.data);

export const getTeacherCourseInsights = (courseId) =>
  api.get(`/teacher/course/${courseId}/insights`).then((res) => res.data);

export const downloadTeacherCourseReport = (courseId) =>
  api.get(`/teacher/course/${courseId}/report`, { responseType: 'blob' }).then((res) => res.data);

export const getCourseStudents = (courseId) =>
  api.get(`/courses/${courseId}/students`).then((res) => res.data);

export const getCourseStudentDetail = (courseId, studentId) =>
  api.get(`/courses/${courseId}/students/${studentId}`).then((res) => res.data);

export const getCourseMaterials = (courseId, params = {}) =>
  api.get(`/courses/${courseId}/materials`, { params }).then((res) => res.data);

export const createCourseMaterial = (courseId, formData) =>
  api
    .post(`/courses/${courseId}/materials`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    .then((res) => res.data);

export const updateCourseMaterial = (courseId, materialId, formData) =>
  api
    .put(`/courses/${courseId}/materials/${materialId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    .then((res) => res.data);

export const deleteCourseMaterial = (courseId, materialId) =>
  api.delete(`/courses/${courseId}/materials/${materialId}`).then((res) => res.data);

export const openCourseMaterial = (courseId, materialId) =>
  api.get(`/courses/${courseId}/materials/${materialId}/open`).then((res) => res.data);

export const logMaterialAccess = (courseId, materialId, payload) =>
  api.post(`/courses/${courseId}/materials/${materialId}/access`, payload).then((res) => res.data);

// ==================== STUDENT PORTAL ====================
export const studentGetOverview = () =>
  api.get('/student/overview').then((res) => res.data);

export const studentGetSimulacros = (params = {}) =>
  api.get('/student/simulacros', { params: cleanParams(params) }).then((res) => res.data);

export const studentGetResults = (params = {}) =>
  api.get('/student/results', { params: cleanParams(params) }).then((res) => res.data);

export const studentGetProgress = () =>
  api.get('/student/progress').then((res) => res.data);

// ==================== ADMIN ====================
export const listTeachersForAdmin = () =>
  api.get('/admin/teachers').then((res) => res.data);

export const updateTeacherFeature = (teacherId, physicalSimulacros) =>
  api.put(`/admin/teachers/${teacherId}/features`, { physicalSimulacros }).then((res) => res.data);

export const uploadPhysicalTemplate = (formData) =>
  api
    .post('/admin/physical-template', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    .then((res) => res.data);

export const getActivePhysicalTemplate = () =>
  api.get('/admin/physical-template/active').then((res) => res.data);

export const adminListUsers = (params = {}) =>
  api.get('/admin/users', { params: cleanParams(params) }).then((res) => res.data);

export const adminCreateUser = (payload) =>
  api.post('/admin/users', payload).then((res) => res.data);

export const adminPatchUser = (id, payload) =>
  api.patch(`/admin/users/${id}`, payload).then((res) => res.data);

export const adminDeleteUser = (id) =>
  api.delete(`/admin/users/${id}`).then((res) => res.data);

export const adminResetUserPassword = (id, newPassword) =>
  api.post(`/admin/users/${id}/reset-password`, { newPassword }).then((res) => res.data);

export const adminImportUsers = (formData) =>
  api.post('/admin/users/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then((res) => res.data);

export const adminListCourses = (params = {}) =>
  api.get('/admin/courses', { params: cleanParams(params) }).then((res) => res.data);

export const adminCreateCourse = (payload) =>
  api.post('/admin/courses', payload).then((res) => res.data);

export const adminPatchCourse = (id, payload) =>
  api.patch(`/admin/courses/${id}`, payload).then((res) => res.data);

export const adminDeleteCourse = (id) =>
  api.delete(`/admin/courses/${id}`).then((res) => res.data);

export const adminAssignTeacher = (id, teacherId) =>
  api.post(`/admin/courses/${id}/assign-teacher`, { teacherId }).then((res) => res.data);

export const adminAssignStudents = (id, studentIds) =>
  api.post(`/admin/courses/${id}/assign-students`, { studentIds }).then((res) => res.data);

export const adminListQuestions = (params = {}) =>
  api.get('/admin/questions', { params: cleanParams(params) }).then((res) => res.data);

export const adminQuestionStatsByArea = () =>
  api.get('/admin/questions/stats/area').then((res) => res.data);

export const adminApproveQuestion = (id) =>
  api.patch(`/admin/questions/${id}/approve`).then((res) => res.data);

export const adminRejectQuestion = (id) =>
  api.patch(`/admin/questions/${id}/reject`).then((res) => res.data);

export const adminPatchQuestionTriParams = (id, payload) =>
  api.patch(`/admin/questions/${id}/tri-params`, payload).then((res) => res.data);

export const adminListPhysicalSimulacros = (params = {}) =>
  api.get('/admin/physical-simulacros', { params: cleanParams(params) }).then((res) => res.data);

export const adminListGovernanceSimulacros = (params = {}) =>
  api.get('/admin/simulacros', { params: cleanParams(params) }).then((res) => res.data);

export const adminForceArchiveSimulacro = (id, type = 'virtual') =>
  api.patch(`/admin/simulacros/${id}/force-archive`, { type }).then((res) => res.data);

export const adminCreatePhysicalSimulacro = (payload) =>
  api.post('/admin/physical-simulacros', payload).then((res) => res.data);

export const adminForcePublishPhysical = (id) =>
  api.patch(`/admin/physical-simulacros/${id}/force-publish`).then((res) => res.data);

export const adminForceArchivePhysical = (id) =>
  api.patch(`/admin/physical-simulacros/${id}/force-archive`).then((res) => res.data);

export const adminReopenReviewPhysical = (id) =>
  api.patch(`/admin/physical-simulacros/${id}/reopen-review`).then((res) => res.data);

export const adminListPhysicalTemplates = () =>
  api.get('/admin/physical-templates').then((res) => res.data);

export const adminCreatePhysicalTemplate = (formData) =>
  api.post('/admin/physical-templates', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then((res) => res.data);

export const adminPatchPhysicalTemplate = (id, payload) =>
  api.patch(`/admin/physical-templates/${id}`, payload).then((res) => res.data);

export const adminDeletePhysicalTemplate = (id) =>
  api.delete(`/admin/physical-templates/${id}`).then((res) => res.data);

export const adminGetConfig = () =>
  api.get('/admin/config').then((res) => res.data);

export const adminPatchConfig = (payload) =>
  api.patch('/admin/config', payload).then((res) => res.data);

export const adminGetAuditLogs = (params = {}) =>
  api.get('/admin/audit', { params: cleanParams(params) }).then((res) => res.data);

export const adminGetGovernanceOCR = (params = {}) =>
  api.get('/admin/governance/ocr', { params: cleanParams(params) }).then((res) => res.data);

export const adminGetInstitutionAnalytics = (params = {}) =>
  api.get('/admin/analytics/institution', { params: cleanParams(params) }).then((res) => res.data);

export const adminDownloadInstitutionReport = (params = {}) =>
  api.get('/admin/reports/institution', { params: cleanParams(params), responseType: 'blob' }).then((res) => res.data);

// ==================== PHYSICAL SIMULACROS ====================
export const createPhysicalSimulacro = (data) =>
  api.post('/teacher/physical-simulacros', data).then((res) => res.data);

export const listPhysicalSimulacros = (params = {}) =>
  api.get('/teacher/physical-simulacros', { params }).then((res) => res.data);

export const getPhysicalSimulacro = (id) =>
  api.get(`/teacher/physical-simulacros/${id}`).then((res) => res.data);

export const generatePhysicalSimulacroPdfs = (id) =>
  api.post(`/teacher/physical-simulacros/${id}/generate-pdfs`).then((res) => res.data);

export const processPhysicalScan = (id, formData) =>
  api
    .post(`/teacher/physical-simulacros/${id}/process-scan`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    .then((res) => res.data);

export const getPhysicalReviewStats = (id) =>
  api.get(`/teacher/physical-simulacros/${id}/review-stats`).then((res) => res.data);

export const publishPhysicalResults = (id) =>
  api.post(`/teacher/physical-simulacros/${id}/publish-results`).then((res) => res.data);

// ==================== OCR UI (illustrative endpoints) ====================
export const getTeacherOCRSimulacros = () =>
  api.get('/teacher/ocr').then((res) => res.data);

export const getTeacherOCRSimulacroDetail = (simulacroId) =>
  api.get(`/teacher/ocr/${simulacroId}`).then((res) => res.data);

export const uploadTeacherOCRScans = (simulacroId, formData, onUploadProgress) =>
  api
    .post(`/teacher/ocr/${simulacroId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress
    })
    .then((res) => res.data);

export const reviewTeacherOCRSheet = (simulacroId, payload) =>
  api.post(`/teacher/ocr/${simulacroId}/review`, payload).then((res) => res.data);

export const publishTeacherOCRResults = (simulacroId, payload) =>
  api.post(`/teacher/ocr/${simulacroId}/publish`, payload).then((res) => res.data);

// ==================== PDF IMPORT ====================
export const teacherPreviewPdfImport = (formData, { onUploadProgress } = {}) =>
  api
    .post('/teacher/pdf-import/preview', formData, { onUploadProgress })
    .then((res) => res.data);

export const teacherPreviewPdfImportStatus = (jobId) =>
  api.get(`/teacher/pdf-import/preview/status/${jobId}`).then((res) => res.data);

export const teacherCancelPreviewPdfImportJob = (jobId) =>
  api.post(`/teacher/pdf-import/preview/cancel/${jobId}`).then((res) => res.data);

export const teacherGetPdfImportConfig = () =>
  api.get('/teacher/pdf-import/config').then((res) => res.data);

export const teacherCommitPdfImport = (payload) =>
  api.post('/teacher/pdf-import/confirm', payload).then((res) => res.data);

export const pdfImportCreate = (formData) =>
  api.post('/teacher/pdf-import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then((res) => res.data);

export const pdfImportList = (params = {}) =>
  api.get('/teacher/pdf-import', { params: cleanParams(params) }).then((res) => res.data);

export const pdfImportGet = (id) =>
  api.get(`/teacher/pdf-import/${id}`).then((res) => res.data);

export const pdfImportUpdatePreview = (id, payload) =>
  api.patch(`/teacher/pdf-import/${id}/preview`, payload).then((res) => res.data);

export const pdfImportConfirm = (id, payload) =>
  api.post(`/teacher/pdf-import/${id}/confirm`, payload).then((res) => res.data);

export const adminPdfImportCreate = (formData) =>
  api.post('/admin/pdf-import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then((res) => res.data);

export const adminPdfImportList = (params = {}) =>
  api.get('/admin/pdf-import', { params: cleanParams(params) }).then((res) => res.data);

export const adminPdfImportGet = (id) =>
  api.get(`/admin/pdf-import/${id}`).then((res) => res.data);

export const adminPdfImportUpdatePreview = (id, payload) =>
  api.patch(`/admin/pdf-import/${id}/preview`, payload).then((res) => res.data);

export const adminPdfImportConfirm = (id, payload) =>
  api.post(`/admin/pdf-import/${id}/confirm`, payload).then((res) => res.data);

// ==================== AI ====================
export const aiExplainAnswer = ({ resultId, answerId }) =>
  api.post('/ai/explain-answer', { resultId, answerId }).then((res) => res.data);

export const generateAIQuestions = ({ area, competencia, dificultad, tema, cantidad }) =>
  api.post('/ai/generate-questions', { area, competencia, dificultad, tema, cantidad }).then((res) => res.data);

export const createAICaseGroup = ({ titulo, contenido }) =>
  api.post('/ai/create-case-group', { titulo, contenido }).then((res) => res.data);

// Compatibilidad legacy
export const addQuestion = createQuestion;

export default api;
