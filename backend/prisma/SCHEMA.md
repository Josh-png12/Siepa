# Schema de Base de Datos — SIEPA

PostgreSQL + Prisma ORM. Arquitectura multi-tenant: cada institución es un `School` y todas las entidades apuntan a ella.

---

## Modelo de tenancy

```
School (institución)
  └── User (usuarios de la institución)
  └── Course (cursos)
  └── Question (banco de preguntas)
  └── Simulacro / PhysicalSimulacro
  └── SystemConfig (configuración)
  └── AuditLog / InstitutionMetrics
```

El campo `slug` en `School` mapea al antiguo `institutionId` de MongoDB (e.g. `'default'`). El `schoolId` viaja en el JWT para evitar lookups adicionales en cada request.

---

## Modelos

### `School` — Raíz del tenant

Cada institución educativa. Todas las demás entidades tienen `schoolId` como FK.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | cuid | PK |
| `name` | String | Nombre de la institución |
| `slug` | String (único) | Identificador corto (e.g. `"default"`) |

---

### `User` — Usuarios

Un usuario siempre pertenece a exactamente una `School`.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | cuid | PK |
| `schoolId` | FK | Institución |
| `email` | String | Único dentro de la misma escuela (no globalmente) |
| `role` | Enum | `estudiante`, `docente`, `admin`, `padre` |
| `status` | Enum | `active`, `inactive`, `suspended` |
| `currentTheta` | Float | Habilidad TRI actual del estudiante |
| `featurePhysicalSimulacros` | Boolean | Feature flag por usuario |
| `featureOcrEnabled` | Boolean | Feature flag por usuario |

**Índices clave:** `[schoolId, role, status]`, `[email, schoolId]` (unique)

> Un mismo email puede existir en escuelas distintas, pero no dos veces en la misma escuela.

---

### `Student` — Perfil extendido del estudiante

Extiende `User` con datos escolares del alumno.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `userId` | FK (único) | Referencia a User |
| `grade` | String | Grado actual |
| `guardianName/Phone/Email` | String? | Datos del acudiente |

---

### `Course` — Cursos

Agrupa estudiantes bajo un docente y año.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `teacherId` | FK | Docente responsable |
| `grade` | String | Grado |
| `year` | String | Año académico |
| `averageTheta` | Float | Theta promedio del grupo |

**Relaciones:**
- `CourseEnrollment` — M:N explícito entre `Course` y `Student`
- `TeacherAssignment` — permite co-docentes en un curso

---

### `Question` — Banco de preguntas

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `options` | Json | Array `[{label, text, image?}]` |
| `correctAnswer` | String | 'A'–'H' |
| `area` | String | Área de conocimiento (Matemáticas, Lectura crítica, etc.) |
| `competencia` | String | Competencia específica |
| `nivelCognitivo` | Enum | Taxonomía de Bloom: recordar → crear |
| `dificultadCualitativa` | Enum | `baja`, `media`, `alta` |
| `triParamA/B/C` | Float? | Parámetros del modelo 3PL cuando la pregunta está calibrada |
| `calibrationStatus` | Enum | `experimental` (sin calibrar) / `calibrated` |
| `estadísticas denorm.` | Float? | `statsCorrectRate`, `statsDiscriminationIndex` — actualizados por `questionStatsService` |

**Relaciones:**
- `CaseGroup` — agrupa preguntas que comparten un texto o imagen de contexto (e.g. un párrafo de lectura)
- `QuestionVersion` — historial de cambios
- `PdfImportBatch` — si la pregunta vino de importación PDF

---

### `CaseGroup` — Contextos compartidos

Texto o imagen de referencia que comparten varias preguntas (e.g. un artículo, un gráfico). Las preguntas apuntan al `CaseGroup`, no al revés.

---

### `QuestionVersion` — Historial de preguntas

Snapshot inmutable de la pregunta en cada cambio. Permite restaurar versiones anteriores.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `snapshot` | Json | Copia completa de la pregunta en ese momento |
| `changeType` | Enum | `create`, `update`, `publish`, `restore`, `import` |

---

### `Simulacro` — Simulacros virtuales

Examen virtual creado por un docente.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `estado` | Enum | `borrador` → `publicado` → `cerrado` |
| `strictMode` | Boolean | Si `true`, no permite navegar entre módulos |
| `globalTimeLimit` | Int? | Tiempo total en segundos |

**Estructura interna:**
```
Simulacro
  └── SimulacroModule (sección con nombre y tiempo)
        └── SimulacroQuestion (pregunta asignada al módulo)
              └── SimulacroAnswer (respuesta del estudiante)
```

`SimulacroQuestion.embeddedQuestion` es un snapshot de la pregunta al momento de asignarla. Si la pregunta original se edita después, los resultados ya registrados siguen siendo correctos.

---

### `SimulacroResult` — Resultados por estudiante

Un `SimulacroResult` por par `(simulacro, estudiante)`.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `overallTheta` | Float? | Habilidad TRI estimada al terminar |
| `percentile` | Float | Posición relativa (0–100) |
| `status` | Enum | `in_progress` / `submitted` |
| `schoolId` | denorm | Evita joins en queries de analítica |

---

### `StudentProgress` — Progreso acumulado del estudiante

Un único registro por estudiante que resume toda su trayectoria.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `currentTheta` | Float | Habilidad actual global |
| `percentile` | Float | Posición en la institución |
| `rachaActual` | Int | Días consecutivos activos |

**Hijos:**
- `StudentCompetency` — theta por área (Matemáticas, Lectura crítica, etc.)
- `ThetaHistory` — evolución de theta en el tiempo
- `StudentAlert` — alertas pedagógicas

---

### `PhysicalSimulacro` — Simulacros en papel

Examen impreso y calificado por OCR.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `status` | Enum | `draft` → `answerKeyPending` → `readyForUpload` → `processing` → `reviewing` → `published` → `archived` |
| `totalQuestions` | Int | Número de preguntas (máx. 147) |
| `reviewDeadline` | DateTime | Fecha límite para revisar hojas |

**Hijos:**
- `PhysicalAnswerKey` — respuesta correcta por número de pregunta
- `PhysicalAnswerSheet` — hoja escaneada por estudiante (resultado OCR)

---

### `PhysicalSheet` — Hoja OCR para simulacros virtuales

Cuando un estudiante responde un `Simulacro` virtual en papel y el docente sube la hoja escaneada.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `rawResponses` | String[] | Respuestas detectadas por OCR |
| `confirmedResponses` | String[] | Respuestas validadas por el docente |
| `ocrConfidence` | Float? | Confianza promedio del OCR |
| `status` | Enum | `uploaded` → `processing` → `processed` → `needs_review` → `confirmed` |

---

### `Booklet` / `Response` / `Report` — Evaluaciones manuales

Flujo de evaluación más sencillo (sin TRI).

```
Booklet (cuestionario con preguntas)
  └── BookletQuestion (preguntas del cuestionario)
      Response (intento del estudiante)
        └── ResponseAnswer (respuesta por pregunta)
            Report (resultado con recomendaciones)
              └── ReportCompetency (desglose por competencia)
```

---

### `PdfImportJob` / `PdfImportBatch` — Importación de preguntas desde PDF

| Modelo | Descripción |
|--------|-------------|
| `PdfImportJob` | Nuevo pipeline: un PDF → questions mediante OCR por páginas |
| `PdfImportBatch` | Pipeline legacy: par (preguntas PDF + respuestas PDF) |
| `PdfImportAsset` | Archivos generados durante el proceso (imágenes de páginas) |

Los campos `previewQuestions`, `detectedBlocks`, etc. son JSON transitorio — existen solo hasta que el admin/docente confirma la importación y se crean los registros `Question` reales.

---

### `AuditLog` — Registro de auditoría

Toda acción importante (crear usuario, publicar simulacro, etc.) genera un `AuditLog`. Útil para trazabilidad y compliance.

---

### `InstitutionMetrics` — Métricas precalculadas

Snapshots diarios de analítica institucional. El JSON `metrics` tiene estructura variable (distribución theta, comparación entre cursos, etc.) y se actualiza por un job programado.

---

### `SystemConfig` — Configuración por institución

Una fila por `School`. Controla límites de upload, ventana de revisión OCR, y feature flags globales.

| Campo | Descripción |
|-------|-------------|
| `maxUploadMB` | Tamaño máximo de archivos subidos |
| `ocrReviewWindowDays` | Días que el docente tiene para revisar hojas OCR |
| `featurePhysicalGlobal` | Habilita simulacros físicos para toda la institución |
| `featureOcrGlobal` | Habilita OCR para toda la institución |

---

## Relaciones clave

```
School ──< User ──< Student ──< CourseEnrollment >── Course
                               StudentProgress
                               SimulacroResult
                               PhysicalAnswerSheet

School ──< Question ──< QuestionVersion
                    ──< SimulacroQuestion
                    ──< PhysicalAnswerKey

Simulacro ──< SimulacroModule ──< SimulacroQuestion ──< SimulacroAnswer
          ──< SimulacroResult ──< SimulacroAnswer

PhysicalSimulacro ──< PhysicalAnswerKey
                  ──< PhysicalAnswerSheet
```

---

## Índices importantes

| Tabla | Índice | Por qué existe |
|-------|--------|---------------|
| `User` | `[schoolId, role, status]` | Filtros comunes en panel admin |
| `Question` | `[schoolId, area, competencia, dificultadCualitativa]` | Selector TRI filtra por estas dimensiones |
| `SimulacroResult` | `[simulacroId, studentId, createdAt DESC]` | Historial de intentos ordenado |
| `StudentCompetency` | `[area, theta DESC]` | Rankings por competencia |
| `AuditLog` | `[schoolId, userId, timestamp DESC]` | Búsqueda rápida en el log |
| `InstitutionMetrics` | `[schoolId, date DESC]` | Últimos snapshots por institución |
