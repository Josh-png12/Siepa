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

## 🚀 Despliegue en Producción (Servidor Propio)

### Arquitectura de Producción

```
┌──────────────────────────────────────────────────┐
│              Servidor Clouding.io                 │
│              IP: 187.33.148.149                   │
│                                                   │
│  ┌─────────────────┐  ┌───────────────────────┐  │
│  │     Nginx        │  │   PM2 (Node.js)       │  │
│  │  :80 / :443      │  │   siepa-backend       │  │
│  │                  │  │   :5000               │  │
│  │  /var/www/html/  │  │                       │  │
│  │  (Frontend)      │  │   PostgreSQL :5432    │  │
│  └────────┬─────────┘  └───────────┬───────────┘  │
│           │                        │               │
│           └──────── API ──────────┘               │
└──────────────────────────────────────────────────┘
```

### 1. Requisitos del Servidor

- Ubuntu 22.04+ con acceso root
- Node.js >= 20.x
- PostgreSQL 14+
- Nginx
- PM2 (`npm install -g pm2`)
- Git

### 2. Clonar e instalar

```bash
cd /root
git clone https://github.com/TU_USUARIO/siepa-ap.git
cd siepa-ap

# Backend
cd backend && npm install --production && npx prisma generate

# Frontend
cd ../frontend && npm install && npm run build
```

### 3. Configurar base de datos

```bash
sudo -u postgres psql -c "CREATE DATABASE siepa;"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'tu_password_segura';"

cd /root/siepa-ap/backend
npx prisma migrate deploy
```

### 4. Variables de entorno

Copia y edita `backend/.env`:

```env
NODE_ENV=production
PORT=5000
JWT_SECRET=tu_secreto_jwt_generado
CORS_ORIGIN=http://187.33.148.149
DATABASE_URL=postgresql://postgres:tu_password@localhost:5432/siepa
REPLICATE_API_TOKEN=r8_...    # Opcional
DEEPSEEK_API_KEY=sk-...       # Opcional
```

> **Generar JWT_SECRET**: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

### 5. Configurar Nginx

Crear `/etc/nginx/sites-available/siepa`:

```nginx
server {
    listen 80;
    server_name 187.33.148.149;

    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
    }

    location /uploads/ {
        proxy_pass http://localhost:5000/uploads/;
    }
}
```

Activar:
```bash
ln -s /etc/nginx/sites-available/siepa /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
```

### 6. Desplegar frontend

```bash
cp -r /root/siepa-ap/frontend/dist/* /var/www/html/
```

### 7. Iniciar backend con PM2

```bash
cd /root/siepa-ap/backend
pm2 start src/app.js --name siepa-backend
pm2 save
pm2 startup
```

### 8. Verificación

```bash
curl http://localhost:5000/       # Backend health
curl http://localhost/            # Frontend
```

### 9. Despliegue continuo (CI/CD)

Configura un webhook en GitHub que apunte a tu servidor. Al hacer `git push` a `master`, el script `deploy.sh` se encarga de:

1. `git pull`
2. Instalar dependencias
3. Construir frontend
4. Copiar a `/var/www/html/`
5. Reiniciar PM2 y Nginx

```bash
# En el servidor:
./deploy.sh
```

> Consulta [DEPLOY.md](./DEPLOY.md) para instrucciones detalladas de CI/CD, webhooks y mantenimiento.

### URLs de Producción

| Servicio | URL |
|----------|-----|
| **Frontend** | `http://187.33.148.149` |
| **Backend API** | `http://187.33.148.149/api` |
| **API Health** | `http://187.33.148.149/api/health` |

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

El backend crea automáticamente los directorios necesarios al iniciar (`uploads/`, `uploads/extracted/`, etc.).
En servidor propio los archivos son persistentes. Para escalar horizontalmente o usar almacenamiento externo, considera:
- **Cloudinary** para imágenes
- **AWS S3** o **Cloudflare R2** para PDFs y documentos
- **Supabase Storage** como alternativa simple

### Logs

El backend usa **Winston** para logs estructurados:
- En desarrollo: formato legible con colores
- En producción: JSON estructurado para integración con sistemas de monitoreo

Puedes ver los logs en tiempo real con:
```bash
pm2 logs siepa-backend
```

### Monitoreo

- **PM2**: `pm2 monit` para monitoreo en tiempo real
- **Nginx**: Logs en `/var/log/nginx/`
- Para monitoreo avanzado, integra con Datadog, New Relic o Grafana

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
