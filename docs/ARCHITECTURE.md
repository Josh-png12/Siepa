# Arquitectura — SIEPA

---

## Diagrama completo

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cliente (Browser)                         │
│                    React SPA — /var/www/html                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP :80
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Nginx                                    │
│   /          → servir dist/ (React SPA)                         │
│   /api/*     → proxy_pass → localhost:5000                      │
│   /uploads/* → proxy_pass → localhost:5000/uploads              │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP :5000
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Backend (Node.js + Express — PM2)                │
│                                                                  │
│  Middleware stack (por orden de aplicación):                     │
│    CORS → Helmet → JSON parser → Rate limiter → Request logger  │
│    → Routes → errorHandler                                       │
│                                                                  │
│  Rutas principales:                                              │
│    /api/auth         /api/questions      /api/simulacros         │
│    /api/admin        /api/teacher        /api/student            │
│    /api/courses      /api/ai             /api/ocr                │
│    /api/booklets     /api/evaluations    /api/reports            │
└──────┬───────────────────────┬───────────────────────────────────┘
       │                       │
       │ SQL (Prisma)           │ HTTP :8001
       ▼                       ▼
┌─────────────┐       ┌─────────────────────────┐
│ PostgreSQL  │       │  OCR Service (Python)   │
│             │       │  FastAPI + OpenCV        │
│  35+ tablas │       │  POST /process-sheet     │
└─────────────┘       └─────────────────────────┘

APIs externas:
  DeepSeek AI ──────────────► Explicaciones pedagógicas
  Replicate (DeepSeek-VL) ──► Extracción de preguntas desde PDF
```

---

## Flujo: Login

```
1. Usuario ingresa email + password en Login.jsx

2. api.js → POST /api/auth/login
   body: { email, password, schoolSlug: "default" }

3. authController.login()
   → authService.loginUser()
     → prisma.school.findUnique({ slug })  [scoped lookup]
     → prisma.user.findFirst({ email, schoolId })
     → bcrypt.compare(password, hash)
     → jwt.sign({ id, name, role, schoolId, features }, JWT_SECRET, { expiresIn: '30d' })

4. Respuesta: { user: {...}, token: "eyJ..." }

5. useAuthStore.login(user, token, { remember })
   → writeAuthToStorage() → localStorage o sessionStorage
   → Zustand state: { user, token, remember }

6. App.jsx detecta el rol y redirige:
   admin     → /admin
   docente   → /teacher
   estudiante → /student
```

---

## Flujo: Simulacro virtual (crear → publicar → responder → resultados)

### Crear y publicar (docente)

```
1. Docente en SimulacroCreate.jsx
   Elige preguntas manualmente o usa SimulacroAutoCreate (selector TRI)

2. POST /api/simulacros/manual  o  /api/simulacros/auto
   simulacroController → simulacroService.createSimulacro()
   → Crea: Simulacro + SimulacroModule[] + SimulacroQuestion[]
   → Cada SimulacroQuestion guarda embeddedQuestion (snapshot inmutable)
   → Estado inicial: "borrador"

3. Docente revisa → PUT /api/simulacros/:id/publish
   → simulacroService.publishSimulacro()
   → estado = "publicado"
   → fechaPublicacion = now()
```

### Responder (estudiante)

```
4. GET /api/simulacros/available
   → Lista simulacros publicados del estudiante (por schoolId)

5. POST /api/simulacros/:id/start
   → Crea SimulacroResult { status: "in_progress", startTime: now() }

6. Estudiante navega módulos, responde preguntas
   Las respuestas se guardan localmente en el frontend

7. POST /api/simulacros/:id/submit  { answers: [...] }
   → simulacroController → simulacroService.submitSimulacro()
   → Guarda SimulacroAnswer[] (selectedOption, isCorrect)
   → Calcula theta con triService.estimateTheta() (MLE Newton-Raphson)
   → Actualiza SimulacroResult { status: "submitted", overallTheta, endTime }
   → Actualiza StudentProgress y StudentCompetency[]
   → Actualiza ThetaHistory
```

### Ver resultados

```
8. GET /api/simulacros/:id/results
   → Devuelve SimulacroResult con answers y theta por módulo

9. Si el estudiante pide explicación de respuesta incorrecta:
   POST /api/ai/explain-answer { resultId, answerId }
   → aiController → aiExplanationService
   → DeepSeek API: genera explicación pedagógica
   → Guarda en SimulacroAnswer.aiExplanation (caché para no llamar 2 veces)
```

---

## Flujo: Pipeline OCR físico

```
DOCENTE (antes del examen)
  1. Admin crea PhysicalSimulacro (con cursos, fecha, totalQuestions)
     → estado: "draft"

  2. Docente sube clave de respuestas (PhysicalAnswerKey por número de pregunta)
     → estado: "answerKeyPending" → "readyForUpload"

DURANTE EL EXAMEN
  3. Estudiantes responden en hoja física impresa con QR único

DESPUÉS DEL EXAMEN
  4. Docente sube escaneos (imagen JPG/PNG por hoja)
     POST /api/teacher/ocr/:id/upload

  5. Backend → omrService.processSheet(imageBuffer)
     → HTTP POST http://localhost:8001/process-sheet

  6. OCR Service (Python):
     a. Grayscale
     b. Corrección de perspectiva (detectar bordes + warpPerspective)
     c. Leer QR → qrToken (identifica al estudiante)
     d. Para cada pregunta: compute_bubble_center() + sample_circle_density()
     → Retorna { bubbleMatrix, qrToken, confidence }

  7. Si confidence < 0.80:
     → Fallback: enviar imagen a Replicate (DeepSeek-VL)
     → DeepSeek-VL lee las burbujas visualmente

  8. Guardar PhysicalAnswerSheet { parsedAnswers, score, status: "needsReview" }

  9. Docente revisa en OCRReviewModal.jsx
     → Corrige errores manualmente → PhysicalAnswerSheet.manualCorrections
     → Confirma → status: "valid"

 10. POST /api/teacher/ocr/:id/publish
     → Calcula score final con PhysicalAnswerKey
     → Calcula theta (triService)
     → Publica resultados para los estudiantes
     → estado PhysicalSimulacro: "published"
```

---

## Flujo: Importación de preguntas desde PDF

```
1. Docente sube PDF con preguntas
   POST /api/teacher/pdf-import/preview (multipart)

2. pdfImportQueueService procesa en background:
   a. pdf-parse: extrae texto plano
   b. Si texto vacío o < umbral → OCR:
      - pdfjs-dist: renderiza páginas como imágenes
      - Tesseract.js: OCR en español + inglés
   c. pdfQuestionParserService: parsea preguntas del texto
      (detecta patrón: número, enunciado, opciones A-E)
   d. Si el parser no tiene confianza → DeepSeek-VL via Replicate

3. POST /api/teacher/pdf-import/preview/status/:jobId
   Frontend hace polling cada VITE_PDF_IMPORT_POLL_MS ms

4. Vista previa: docente revisa las preguntas detectadas
   Puede editar enunciados, opciones, respuesta correcta

5. POST /api/teacher/pdf-import/confirm { questions: [...] }
   → Crea Question[] en la base de datos
   → Vincula a PdfImportBatch para trazabilidad
```

---

## Modelo de Respuesta al Ítem (TRI — 3PL)

SIEPA usa el Modelo Logístico de 3 Parámetros (3PL) para estimar la habilidad (θ) de cada estudiante.

**Parámetros de la función:**
- `a` — discriminación del ítem (qué tan bien diferencia entre habilidades)
- `b` — dificultad del ítem (θ donde la probabilidad de acierto = 50%)
- `c` — pseudo-azar (probabilidad mínima de acertar al azar)

**Estimación de θ:** MLE con Newton-Raphson (50 iteraciones máx., bounds ±3).

**Cuándo se usa:**
- Al finalizar un simulacro virtual (`triService.estimateTheta`)
- Al confirmar resultados OCR de simulacro físico
- Para seleccionar preguntas automáticamente (selector TRI elige ítems con `b` cercano al θ actual del estudiante)

---

## Decisiones de arquitectura

### Multi-tenancy por `schoolId` en JWT

En lugar de hacer un JOIN a la tabla `School` en cada request, el `schoolId` se incluye en el JWT al hacer login. Esto agrega ~30 bytes al token pero elimina un DB roundtrip por request.

### Snapshots en `SimulacroQuestion.embeddedQuestion`

Si una pregunta del banco se edita después de que ya está asignada a un simulacro, los resultados históricos deben seguir siendo válidos. Por eso se guarda una copia inmutable de la pregunta al momento de asignarla. El campo `questionId` permanece como FK débil para auditoría, pero la calificación usa el snapshot.

### JSON transitorio en importación PDF

Los campos `previewQuestions`, `detectedBlocks`, etc. son Json en PostgreSQL porque su estructura cambia durante el desarrollo del pipeline de OCR. Una vez confirmada la importación y creados los `Question`, estos campos son basura. Normalizarlos en tablas fijas agregaría complejidad sin beneficio.

### Modelo Mongoose coexiste con Prisma

La migración de MongoDB a PostgreSQL se hizo preservando los modelos Mongoose en `backend/src/models/`. Algunos controladores aún los usan; los nuevos usan Prisma directamente. Los modelos Mongoose se eliminarán en cuanto sus rutas correspondientes estén migradas.

### OCR como microservicio Python separado

OpenCV no tiene un binding Node.js maduro. El microservicio Python permite usar la librería nativa con sus algoritmos de procesamiento de imagen sin compromisos. La comunicación HTTP local es suficientemente rápida y permite escalar el servicio independientemente si hay muchos escaneos.
