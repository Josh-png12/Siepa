# SIEPA - Simulador ICFES con OCR

Plataforma de simulación de pruebas ICFES Saber Pro con calificación automatizada vía OCR.

## Stack

- **Backend**: Node.js + Express + Prisma (PostgreSQL)
- **Frontend**: React + Vite + Tailwind CSS
- **OCR**: Python OpenCV (microservicio) + Tesseract.js (fallback)
- **AI Vision**: DeepSeek-VL vía Replicate (extracción de preguntas y calificación de hojas)

## Requisitos

- Node.js >= 20
- Python 3.9+ (para el microservicio OCR)
- PostgreSQL

## Configuración Local

1. Clona el repositorio e instala dependencias:

```bash
# Backend
cd backend
npm install

# Frontend
cd frontend
npm install

# OCR microservice
cd ocr-service
pip install -r requirements.txt
```

2. Configura las variables de entorno en `backend/.env` (copia desde `.env.example`):

```env
DATABASE_URL=postgresql://...
JWT_SECRET=tu_secreto_jwt
REPLICATE_API_TOKEN=r8_...    # Token de Replicate para DeepSeek-VL
DEEPSEEK_API_KEY=sk-...       # DeepSeek AI para explicaciones pedagógicas
CORS_ORIGIN=http://localhost:5173
```

3. Ejecuta las migraciones de Prisma:

```bash
cd backend
npx prisma migrate dev
```

4. Inicia los servicios:

```bash
# Terminal 1: OCR microservice
cd ocr-service
uvicorn main:app --port 8001

# Terminal 2: Backend
cd backend
npm run dev

# Terminal 3: Frontend
cd frontend
npm run dev
```

---

## 🚀 Despliegue en Producción

### Arquitectura de Producción

```
┌──────────────────────┐     ┌──────────────────────┐
│   Vercel (Frontend)  │────▶│   Render (Backend)   │────▶ Neon (PostgreSQL)
│   siepa.vercel.app   │     │   siepa-api.onrender │
│   React + Vite       │     │   Node.js + Express  │
└──────────────────────┘     └──────────────────────┘
```

### 1. Base de Datos - Neon

1. Crea una cuenta en [neon.tech](https://neon.tech)
2. Crea un nuevo proyecto y base de datos
3. Copia la URL de conexión (formato: `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/db?sslmode=require`)
4. Esta URL se usará como `DATABASE_URL` en Render

### 2. Backend - Render

#### Configuración del Servicio

1. Crea una cuenta en [render.com](https://render.com)
2. Crea un nuevo **Web Service**
3. Conecta tu repositorio de GitHub
4. Configura el servicio:

| Campo | Valor |
|-------|-------|
| **Name** | `siepa-api` |
| **Runtime** | Node |
| **Build Command** | `cd backend && npm install && npx prisma generate` |
| **Start Command** | `cd backend && npm run start:prod` |
| **Root Directory** | _(dejar vacío)_ |

#### Variables de Entorno en Render

Configura las siguientes variables en **Environment → Environment Variables**:

| Variable | Valor | Obligatorio |
|----------|-------|:-----------:|
| `NODE_ENV` | `production` | ✅ |
| `PORT` | `5000` | ✅ |
| `DATABASE_URL` | `postgresql://user:pass@ep-xxx...` (Neon) | ✅ |
| `JWT_SECRET` | _(genera un secreto seguro)_ | ✅ |
| `CORS_ORIGIN` | `https://siepa.vercel.app` | ✅ |
| `REPLICATE_API_TOKEN` | `r8_...` | Recomendado |
| `DEEPSEEK_API_KEY` | `sk-...` | Opcional |

> **Generar JWT_SECRET**: Ejecuta `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` en tu terminal.

#### Migraciones de Base de Datos

Después del primer deploy, ejecuta las migraciones manualmente (solo la primera vez):

```bash
# Desde tu máquina local, apuntando a la DB de Neon:
cd backend
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

O usa el comando disponible en Render:
```bash
cd backend && npm run prisma:deploy
```

### 3. Frontend - Vercel

#### Configuración del Proyecto

1. Crea una cuenta en [vercel.com](https://vercel.com)
2. Importa tu repositorio de GitHub
3. Configura el proyecto:

| Campo | Valor |
|-------|-------|
| **Framework** | Vite |
| **Build Command** | `cd frontend && npm run build` |
| **Output Directory** | `frontend/dist` |
| **Root Directory** | `frontend` |

#### Variables de Entorno en Vercel

En **Settings → Environment Variables**:

| Variable | Valor |
|----------|-------|
| `VITE_API_URL` | `https://siepa-api.onrender.com/api` |

### 4. Verificación

Después del despliegue, verifica que todo funcione:

```bash
# Verificar backend
curl https://siepa-api.onrender.com/
# Respuesta esperada: {"status":"ok","service":"SIEPA Backend"...}

curl https://siepa-api.onrender.com/health
# Respuesta esperada: {"status":"healthy"...}

# Verificar frontend
# Abre https://siepa.vercel.app en el navegador
# Prueba el login, creación de simulacros, etc.
```

### URLs de Producción

| Servicio | URL |
|----------|-----|
| **Frontend** | `https://siepa.vercel.app` |
| **Backend API** | `https://siepa-api.onrender.com` |
| **API Health** | `https://siepa-api.onrender.com/health` |

---

## PDF Import OCR Fallback

Backend now uses this sequence for `/api/teacher/pdf-import/preview`:

1. `pdf-parse` (text extraction)
2. Automatic OCR fallback when text is empty/very low or detected questions are `0`

OCR stack:

- `pdfjs-dist` (render pages)
- `canvas` (Node canvas in-memory images)
- `tesseract.js` (`spa+eng`)

### Install backend deps

```bash
cd backend
npm i tesseract.js pdfjs-dist canvas replicate
```

### Windows notes for `canvas`

If `canvas` fails to build on Windows, install:

- Visual Studio Build Tools (Desktop development with C++)
- Python 3.x

Then run:

```bash
npm config set msvs_version 2022
npm rebuild canvas
```

## DeepSeek-VL Integration (Replicate)

El proyecto usa **DeepSeek-VL** a través de Replicate para dos funciones principales:

### 1. Extracción de preguntas desde PDFs (`replicateService.js`)

Reemplaza la integración anterior con Gemini. Toma cada página del PDF renderizada como imagen y extrae:
- Enunciado de la pregunta
- Opciones A, B, C, D
- Descripción de imágenes/diagramas
- Respuesta correcta (si está visible)

```javascript
const { extractQuestionsFromImage } = require('./services/replicateService');
const questions = await extractQuestionsFromImage(imageBase64);
// [{ pregunta: '...', opciones: {A, B, C, D}, imagen_descripcion: '...', respuesta_correcta: 'B' }]
```

### 2. Fallback de calificación de hojas de respuesta (`bubbleDetectionService.js`)

Cuando OpenCV o el análisis de píxeles (canvas) no tienen suficiente confianza (< 80%), se envía la hoja completa a DeepSeek-VL para leer las burbujas marcadas.

```javascript
const { validateBubblesFromImage } = require('./services/replicateService');
const { answers, confidence } = await validateBubblesFromImage(hojaBase64, 60);
// answers = ['A', 'B', 'X', 'D', ...] (60 elementos)
// confidence = 85 (%)
```

### Configuración de Replicate

1. Crea una cuenta en [replicate.com](https://replicate.com)
2. Ve a [Account → API Tokens](https://replicate.com/account/api-tokens)
3. Copia tu token y agrégalo a `backend/.env`:

```env
REPLICATE_API_TOKEN=r8_tu_token_aqui
```

Puedes cambiar el modelo usado con la variable opcional:

```env
REPLICATE_DEEPSEEK_VL_MODEL=deepseek-ai/deepseek-vl-7b-base
```

### Optimización de costos

- **Cacheo de respuestas**: Para pruebas repetidas con el mismo PDF, considera cachear los resultados por hash del contenido de la página.
- **Menor resolución**: Las imágenes se renderizan a 200 DPI por defecto — suficiente para DeepSeek-VL.
- **Solo como fallback**: DeepSeek-VL solo se usa cuando OpenCV no tiene suficiente confianza, no en todas las hojas.
- **Delay entre páginas**: Hay un delay de 2s entre páginas en la extracción de PDFs para no saturar la API.
- **Reintentos con backoff**: 3 intentos con backoff exponencial (2s, 4s, 8s) si la API falla.

### Manual assert (real PDF)

```bash
cd backend
npm run pdf-import:assert -- "C:\ruta\questions.pdf" "C:\ruta\answers.pdf"
```

Forzar OCR:

```bash
cd backend
npm run pdf-import:assert -- "C:\ruta\questions.pdf" --force-ocr
```

## Prueba rápida de Replicate

Para verificar que la API de Replicate funciona correctamente:

```javascript
// test-replicate.js
const Replicate = require('replicate');
const fs = require('fs');

(async () => {
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  const imageBase64 = fs.readFileSync('pagina.png', { encoding: 'base64' });

  const output = await replicate.run("deepseek-ai/deepseek-vl-7b-base", {
    input: {
      image: `data:image/png;base64,${imageBase64}`,
      prompt: "Describe esta imagen en detalle.",
      max_tokens: 500,
      temperature: 0.1
    }
  });
  console.log(output);
})();
```

Ejecutar:
```bash
cd backend
node test-replicate.js
```

---

## Notas de Producción

### Archivos Subidos (Uploads)

En **Render**, el sistema de archivos es efímero. Los archivos subidos se pierden al reiniciar el servicio.
El backend crea automáticamente los directorios necesarios al iniciar (`uploads/`, `uploads/extracted/`, etc.).

Para producción real con archivos persistentes, considera usar:
- **Cloudinary** para imágenes
- **AWS S3** o **Cloudflare R2** para PDFs y documentos
- **Supabase Storage** como alternativa simple

### Logs

El backend usa **Winston** para logs estructurados:
- En desarrollo: formato legible con colores
- En producción: JSON estructurado para integración con sistemas de monitoreo

### Monitoreo

Render proporciona logs en tiempo real en su dashboard. Para monitoreo avanzado, considera:
- Render Log Streams
- Integración con Datadog / New Relic (disponible en planes de pago de Render)

### Rate Limiting

Configurado por defecto:
- **Rutas de auth**: 20 peticiones/minuto
- **Rutas de IA/OCR**: 10 peticiones/minuto  
- **Resto de API**: 200 peticiones/minuto (prod) / 1000 (dev)

### Seguridad

- **Helmet** configurado con CSP (Content Security Policy)
- **CORS** restringido a los orígenes configurados en `CORS_ORIGIN`
- **Rate limiting** en todas las rutas sensibles
- **Validación de archivos** subidos por tipo MIME y tamaño (máx. 50 MB)
- **Variables de entorno** validadas al iniciar
