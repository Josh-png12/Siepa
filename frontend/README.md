# Frontend — SIEPA

Aplicación React construida con Vite + Tailwind CSS. UI organizada por rol de usuario.

---

## Estructura de carpetas

```
frontend/src/
├── main.jsx              # Punto de entrada React
├── App.jsx               # Router principal + rutas protegidas
├── services/
│   └── api.js            # Cliente axios con interceptores de auth
├── store/
│   └── useAuthStore.js   # Estado de autenticación (Zustand)
├── pages/
│   ├── Login.jsx         # Página de login
│   ├── admin/            # Panel administrador
│   ├── teacher/          # Panel docente
│   └── student/          # Portal estudiante
└── components/
    ├── ui/               # Componentes genéricos (Button, Modal, Toast...)
    ├── admin/            # Sidebar admin
    ├── teacher/          # Charts, modales de docente
    ├── student/          # Sidebar estudiante
    ├── physical/         # Componentes OCR/hoja física
    └── ProtectedRoute.jsx
```

---

## Routing por rol

`App.jsx` redirige al usuario según su `role` después del login:

```
/login
  ↓ (según rol)
/admin/*        → AdminLayout (require role: admin)
/teacher/*      → TeacherLayout (require role: docente)
/student/*      → StudentLayout (require role: estudiante)
```

### Rutas admin (`/admin/*`)

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/admin` | `AdminOverview` | Dashboard general |
| `/admin/users` | `AdminUsers` | Gestión de usuarios |
| `/admin/courses` | `AdminCourses` | Gestión de cursos |
| `/admin/simulacros` | `AdminSimulacros` | Gobernanza de simulacros |
| `/admin/questions` | `AdminQuestionBank` | Moderación de preguntas |
| `/admin/analytics` | `AdminAnalytics` | Métricas institucionales |
| `/admin/audit-logs` | `AdminAuditLogs` | Logs de auditoría |
| `/admin/templates` | `AdminTemplates` | Plantillas OMR |
| `/admin/pdf-import` | `AdminPdfImport` | Importar preguntas PDF |
| `/admin/config` | `AdminConfig` | Configuración del sistema |

### Rutas docente (`/teacher/*`)

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/teacher` | `TeacherDashboard` | Dashboard docente |
| `/teacher/courses` | `TeacherCourses` | Mis cursos |
| `/teacher/courses/:id` | `CourseDetailLayout` | Detalle de curso |
| `/teacher/questions` | `ListQuestions` | Banco de preguntas |
| `/teacher/simulacros` | `SimulacrosList` | Mis simulacros virtuales |
| `/teacher/simulacros/create` | `SimulacroCreate` | Crear simulacro |
| `/teacher/physical-simulacros` | `PhysicalSimulacrosLayout` | Simulacros físicos |
| `/teacher/ocr` | `TeacherOCRManager` | Gestión OCR |
| `/teacher/pdf-import` | `TeacherPdfImport` | Importar PDF |
| `/teacher/analytics` | `TeacherAnalitica` | Analítica docente |

### Rutas estudiante (`/student/*`)

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/student` | `StudentHome` | Dashboard estudiante |
| `/student/simulacros` | `StudentSimulacros` | Simulacros disponibles |
| `/student/results` | `StudentResults` | Mis resultados |
| `/student/progress` | `StudentProgress` | Mi progreso TRI |
| `/student/profile` | `StudentProfile` | Mi perfil |
| `/student/study-plan` | `StudentStudyPlan` | Plan de estudio |

---

## Store de autenticación (Zustand)

`useAuthStore.js` maneja el estado de sesión y lo persiste en `localStorage` o `sessionStorage` según el checkbox "Recordarme".

```javascript
// Estado
{ user, token, remember }

// Acciones
login(userData, authToken, { remember: true|false })
logout()
isTokenValid()   // Verifica expiración del JWT sin llamar al servidor
```

**Clave de storage**: `siepa-auth-storage`

**Flujo de hidratación**: Al cargar la app, `readAuthFromStorage()` intenta recuperar la sesión de `localStorage` primero, luego `sessionStorage`. El interceptor de axios también lee directamente del storage si el store aún no se ha hidratado.

**Auto-logout**: El interceptor de respuesta de axios escucha respuestas `401` y llama `logout()` + redirige a `/login`.

---

## Cliente HTTP (`api.js`)

Instancia axios configurada con:
- `baseURL`: `VITE_API_URL || http://localhost:5000/api`
- `timeout`: 30 segundos
- **Interceptor request**: Adjunta `Authorization: Bearer <token>` en cada petición
- **Interceptor response**: Captura errores 401 (auto-logout) y adjunta `error.userMessage` en español para mostrar al usuario

Las funciones exportadas siguen la convención:
- Funciones sin prefijo: uso general (`login`, `createQuestion`)
- Prefijo `admin`: solo para admin (`adminListUsers`)
- Prefijo `teacher`: solo para docente (`teacherPreviewPdfImport`)
- Prefijo `student`: solo para estudiante (`studentGetOverview`)

---

## Convenciones de componentes

| Convención | Descripción |
|-----------|-------------|
| Archivos `.jsx` | Componentes React |
| Archivos `.js` en `/pages` | Páginas con lógica de negocio compleja (legacy) |
| `*Layout.jsx` | Envuelve páginas con sidebar + header del rol |
| `*Sidebar.jsx` | Navegación lateral del rol |
| `use*.js` en `/store` | Zustand stores |
| Componentes en `/ui/` | Sin lógica de negocio, solo presentación |

### Componentes UI reutilizables

| Componente | Uso |
|-----------|-----|
| `Spinner` | Loading inline |
| `LoadingSkeleton` | Placeholder mientras carga |
| `EmptyState` | Cuando no hay datos |
| `ErrorState` | Cuando hay un error |
| `StatusBadge` | Badge de estado con color |
| `StatsCard` | Tarjeta de métrica |
| `Toast` | Notificación temporal |
| `ConfirmModal` | Modal de confirmación con acción destructiva |
| `LatexPreview` | Renderiza LaTeX en preguntas matemáticas |
| `FormField` | Input con label, error y helper text |

---

## Build para producción

```bash
cd frontend

# Build estático (output en dist/)
npm run build

# Previsualizar el build localmente
npx vite preview
```

El build genera archivos estáticos en `frontend/dist/` que se sirven con Nginx.

**Configuración de Vite** (`vite.config.js`):
- En desarrollo: proxy `/api` → `http://localhost:5000` (evita CORS)
- En producción: el build asume que la API está en el mismo dominio bajo `/api`

---

## Variables de entorno del frontend

Las variables deben empezar con `VITE_` para que Vite las exponga al bundle.

| Variable | Descripción | Default |
|----------|-------------|---------|
| `VITE_API_URL` | URL base de la API | `http://localhost:5000/api` |
| `VITE_PDF_IMPORT_POLL_MS` | Intervalo de polling para status de PDF import | `2500` |

Crear `frontend/.env` para desarrollo local (no commitear):
```env
VITE_API_URL=http://localhost:5000/api
VITE_PDF_IMPORT_POLL_MS=2500
```

Para producción, crear `frontend/.env.production`:
```env
VITE_API_URL=http://187.33.148.149/api
```
