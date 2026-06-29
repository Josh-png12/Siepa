# Backend — SIEPA

API REST construida con Node.js + Express + Prisma (PostgreSQL).

---

## Estructura de carpetas

```
backend/
├── src/
│   ├── app.js            # Entrada principal: middlewares, rutas, graceful shutdown
│   ├── config/
│   │   ├── prisma.js     # Cliente Prisma (singleton)
│   │   ├── logger.js     # Winston: JSON en prod, legible en dev
│   │   ├── envValidator.js # Falla rápido si faltan vars de entorno críticas
│   │   ├── db.js         # Conexión MongoDB (legacy — pendiente de eliminar)
│   │   └── omrCoordinates.json # Coordenadas de burbujas OMR
│   ├── controllers/      # Capa HTTP: validan entrada, llaman servicios, responden
│   ├── services/         # Lógica de negocio pura (sin req/res)
│   ├── routes/           # Registro de rutas + middleware específico por ruta
│   ├── middleware/       # Auth, rate limiting, uploads, sanitización
│   ├── validators/       # Schemas de validación de body/query
│   ├── models/           # Modelos Mongoose (legacy — se reemplaza con Prisma)
│   ├── utils/
│   │   ├── ApiError.js   # Error personalizado con statusCode
│   │   └── asyncHandler.js # Wrapper para try/catch en middlewares async
│   └── scripts/          # Seeds y utilidades de testing
├── prisma/
│   ├── schema.prisma     # Schema principal
│   └── migrations/       # Historial de migraciones SQL
└── uploads/              # Archivos subidos (creado automáticamente al iniciar)
```

---

## Endpoints por módulo

### Autenticación — `/api/auth`

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/auth/register` | Registrar usuario |
| POST | `/auth/login` | Iniciar sesión, devuelve JWT |

### Admin — `/api/admin`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST | `/admin/users` | Listar / crear usuarios |
| PATCH/DELETE | `/admin/users/:id` | Editar / eliminar usuario |
| POST | `/admin/users/:id/reset-password` | Resetear contraseña |
| POST | `/admin/users/import` | Importar usuarios por Excel |
| GET/POST | `/admin/courses` | Listar / crear cursos |
| PATCH/DELETE | `/admin/courses/:id` | Editar / eliminar curso |
| POST | `/admin/courses/:id/assign-teacher` | Asignar docente |
| POST | `/admin/courses/:id/assign-students` | Asignar estudiantes |
| GET | `/admin/questions` | Banco de preguntas (moderación) |
| PATCH | `/admin/questions/:id/approve` | Aprobar pregunta |
| GET/PATCH | `/admin/config` | Configuración institucional |
| GET | `/admin/analytics/institution` | Métricas institucionales |
| GET | `/admin/audit` | Logs de auditoría |
| GET/POST | `/admin/physical-templates` | Plantillas OMR |

### Docente — `/api/teacher`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/teacher/insights/dashboard` | Resumen docente |
| GET | `/teacher/course/:id/insights` | Analítica por curso |
| GET | `/teacher/course/:id/report` | Reporte PDF por curso |
| GET/POST | `/teacher/ocr` | Simulacros físicos OCR |
| POST | `/teacher/ocr/:id/upload` | Subir escaneos |
| POST | `/teacher/ocr/:id/publish` | Publicar resultados OCR |
| GET/POST | `/teacher/pdf-import` | Importar preguntas desde PDF |
| GET/POST | `/teacher/physical-simulacros` | Simulacros físicos |

### Preguntas — `/api/questions`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/questions` | Listar con filtros (área, competencia, dificultad) |
| POST | `/questions` | Crear pregunta (multipart con imágenes) |
| PUT | `/questions/:id` | Editar pregunta |
| DELETE | `/questions/:id` | Eliminar pregunta |
| POST | `/questions/:id/publish` | Publicar pregunta |
| GET | `/questions/:id/versions` | Historial de versiones |

### Simulacros virtuales — `/api/simulacros`

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/simulacros/manual` | Crear simulacro manual |
| POST | `/simulacros/auto` | Crear simulacro automático (TRI selector) |
| GET | `/simulacros` | Listar (docente) |
| PUT | `/simulacros/:id/publish` | Publicar simulacro |
| GET | `/simulacros/available` | Simulacros disponibles (estudiante) |
| POST | `/simulacros/:id/start` | Iniciar intento |
| POST | `/simulacros/:id/submit` | Enviar respuestas |
| GET | `/simulacros/:id/results` | Ver resultados |

### Estudiante — `/api/student`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/student/overview` | Dashboard del estudiante |
| GET | `/student/simulacros` | Simulacros disponibles |
| GET | `/student/results` | Historial de resultados |
| GET | `/student/progress` | Progreso y theta actual |

### IA — `/api/ai`

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/ai/explain-answer` | Explicación pedagógica de respuesta incorrecta |
| POST | `/ai/generate-questions` | Generar preguntas con IA |
| POST | `/ai/create-case-group` | Crear contexto/caso con IA |

### OCR — `/api/ocr`

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/ocr/process` | Procesar hoja de respuestas física |

---

## Autenticación JWT

- **Generación**: `loginUser()` en `authService.js` firma un token con `JWT_SECRET` (expiración 30 días)
- **Payload**: `{ id, name, role, schoolId, features: { physicalSimulacros, ocrEnabled } }`
- **Verificación**: Middleware `protect` en `authMiddleware.js` verifica y adjunta `req.user`
- **Multi-tenancy**: `schoolId` viene en el token, evitando un `JOIN` adicional en cada query
- **Compatibilidad**: Tokens viejos (sin `schoolId`) hacen un lookup puntual a la DB

```
Cliente → Authorization: Bearer <token>
           ↓
         authMiddleware.protect()
           ↓ JWT.verify()
         req.user = { id, name, role, schoolId, features }
           ↓
         roleCheck('admin' | 'docente' | 'estudiante')
           ↓
         Controlador
```

---

## Pipeline OCR (hoja física)

El flujo completo de calificación de una hoja de respuestas física:

```
Docente sube imagen (JPG/PNG)
         ↓
  ocrController → omrService
         ↓
  [Python OCR microservicio en :8001]
         ↓ POST /process-sheet
  1. Convertir a escala de grises (OpenCV)
  2. Corrección de perspectiva (warpPerspective)
  3. Leer QR para identificar estudiante
  4. Calcular densidad de burbujas por pregunta
         ↓
  Resultado: { bubbleMatrix, qrToken, confidence }
         ↓
  Si confidence < 80% → DeepSeek-VL (Replicate) como fallback
         ↓
  Guardar en PhysicalAnswerSheet
         ↓
  Docente revisa → confirma/corrige
         ↓
  Calcular score + theta (triService)
         ↓
  Publicar resultados
```

---

## Integración DeepSeek y Gemini

### DeepSeek AI API (`aiExplanationService.js`)
- **Uso**: Explicaciones pedagógicas de respuestas incorrectas en simulacros virtuales
- **Variable**: `DEEPSEEK_API_KEY`
- **Modelo**: `deepseek-chat`
- **Cacheo**: Los resultados se guardan en `SimulacroAnswer.aiExplanation`

### DeepSeek-VL via Replicate (`replicateService.js`)
- **Uso**: Extracción de preguntas desde páginas de PDF escaneado
- **Variable**: `REPLICATE_API_TOKEN`
- **Cuándo**: Solo como fallback cuando `pdf-parse` extrae texto vacío o insuficiente
- **Flujo**: Renderizar página PDF → imagen base64 → enviar a Replicate → parsear JSON de vuelta

---

## Migraciones de Prisma

```bash
# Desarrollo: crear nueva migración
cd backend
npx prisma migrate dev --name nombre_descriptivo

# Producción: aplicar migraciones pendientes
npx prisma migrate deploy

# Ver estado de migraciones
npx prisma migrate status

# Regenerar cliente (después de cambiar schema)
npx prisma generate

# Explorar datos en interfaz web
npx prisma studio
```

---

## Variables de entorno del backend

| Variable | Descripción | Valor ejemplo |
|----------|-------------|---------------|
| `NODE_ENV` | Entorno de ejecución | `production` |
| `PORT` | Puerto HTTP | `5000` |
| `DATABASE_URL` | Conexión PostgreSQL | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Secreto JWT (mín. 32 chars) | _(generar con crypto)_ |
| `CORS_ORIGIN` | Orígenes CORS permitidos | `http://localhost:5173` |
| `DEEPSEEK_API_KEY` | DeepSeek AI (explicaciones) | `sk-...` |
| `REPLICATE_API_TOKEN` | Replicate (PDF OCR) | `r8_...` |
| `OCR_SERVICE_URL` | URL del microservicio OCR | `http://localhost:8001` |
| `BCRYPT_SALT_ROUNDS` | Rounds de bcrypt (8–15) | `10` |

---

## Scripts útiles

```bash
# Desarrollo
npm run dev                    # Nodemon con hot reload

# Base de datos
npm run db:migrate             # Migración en desarrollo
npm run db:migrate:prod        # Migración en producción
npm run db:studio              # Prisma Studio

# Testing manual
node scripts/seed.js           # Datos de prueba
npm run pdf-import:assert      # Probar pipeline PDF
```

---

## Rate limiting

| Ruta | Límite |
|------|--------|
| `/api/auth/*` | 20 req/min |
| `/api/ai/*`, `/api/ocr/*` | 10 req/min |
| Resto de `/api/*` | 200 req/min (prod) / 1000 (dev) |
