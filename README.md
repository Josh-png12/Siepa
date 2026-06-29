# SIEPA — Sistema de Evaluación y Preparación para el ICFES

Plataforma institucional para preparación de exámenes ICFES Saber Pro. Permite a docentes crear simulacros virtuales y físicos, calificar hojas de respuestas automáticamente con OCR, y hacer seguimiento del progreso de los estudiantes con el Modelo de Respuesta al Ítem (TRI/IRT).

---

## Arquitectura general

```
┌─────────────────────────────────────────────────────────────┐
│                     Servidor VPS (Nginx)                     │
│                                                             │
│  Puerto 80/443                     Puerto 5000              │
│  ┌─────────────────┐              ┌──────────────────────┐  │
│  │   Frontend       │    /api/*   │   Backend (PM2)      │  │
│  │   React + Vite   │ ─────────► │   Node.js + Express  │  │
│  │   /var/www/html  │            │   + Prisma ORM        │  │
│  └─────────────────┘            └──────────┬───────────┘  │
│                                             │              │
│  Puerto 8001                    Puerto 5432 │              │
│  ┌─────────────────┐            ┌──────────▼───────────┐  │
│  │   OCR Service   │◄───────────│   PostgreSQL          │  │
│  │   Python/FastAPI │            │   Base de datos       │  │
│  └─────────────────┘            └──────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

APIs externas:
  - DeepSeek AI API  → Explicaciones pedagógicas
  - Replicate API    → DeepSeek-VL (extracción de preguntas desde PDF)
```

---

## Stack tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Backend runtime | Node.js | >= 20.x |
| Framework API | Express | 4.18 |
| ORM | Prisma | 5.22 |
| Base de datos | PostgreSQL | 14+ |
| Frontend | React + Vite | 18 / 4 |
| Estilos | Tailwind CSS | 3.2 |
| Estado global | Zustand | 4.3 |
| HTTP client | Axios | 1.3 |
| OCR microservicio | Python + FastAPI | 3.9+ |
| OCR engine | OpenCV + pyzbar | — |
| OCR fallback | Tesseract.js | 6.0 |
| Autenticación | JWT | 30 días |

---

## Instalación local

### Requisitos previos

- Node.js >= 20
- Python 3.9+
- PostgreSQL 14+

### 1. Clonar e instalar dependencias

```bash
git clone <repo-url>
cd siepa-ap

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install

# OCR microservicio
cd ../ocr-service && pip install -r requirements.txt
```

### 2. Configurar variables de entorno

```bash
cp backend/.env.example backend/.env
# Editar backend/.env con tus valores (ver sección Variables de entorno)
```

### 3. Preparar la base de datos

```bash
# Crear la base de datos
psql -U postgres -c "CREATE DATABASE siepa;"

# Ejecutar migraciones
cd backend
npx prisma migrate dev

# (Opcional) Sembrar datos de prueba
node scripts/seed.js
```

### 4. Correr el proyecto

Abrir 3 terminales:

```bash
# Terminal 1: OCR microservicio
cd ocr-service
uvicorn main:app --port 8001 --reload

# Terminal 2: Backend
cd backend
npm run dev

# Terminal 3: Frontend
cd frontend
npm run dev
```

El frontend queda disponible en `http://localhost:5173`.

---

## Variables de entorno

### Backend (`backend/.env`)

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `NODE_ENV` | `development` o `production` | Sí |
| `PORT` | Puerto del servidor (default: 5000) | No |
| `DATABASE_URL` | URL de conexión PostgreSQL | Sí |
| `JWT_SECRET` | Secreto para firmar tokens JWT | Sí |
| `CORS_ORIGIN` | Orígenes permitidos (separados por coma) | Sí |
| `DEEPSEEK_API_KEY` | API key de DeepSeek para explicaciones | No |
| `REPLICATE_API_TOKEN` | Token de Replicate para DeepSeek-VL | No |
| `OCR_SERVICE_URL` | URL del microservicio OCR | No |

**Generar JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Frontend (`frontend/.env`)

| Variable | Descripción |
|----------|-------------|
| `VITE_API_URL` | URL base de la API (default: `http://localhost:5000/api`) |
| `VITE_PDF_IMPORT_POLL_MS` | Intervalo de polling para importación PDF (ms) |

---

## Deploy a producción

Ver [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) para instrucciones completas.

Resumen rápido con el script incluido:

```bash
# En el servidor
./deploy.sh
```

---

## Estructura de carpetas

```
siepa-ap/
├── backend/              # API Node.js + Express
│   ├── src/
│   │   ├── app.js        # Punto de entrada
│   │   ├── config/       # Prisma, logger, validador de env
│   │   ├── controllers/  # Lógica HTTP (14 controladores)
│   │   ├── middleware/   # Auth, rate limiting, uploads
│   │   ├── routes/       # Definición de rutas (16 archivos)
│   │   ├── services/     # Lógica de negocio (35+ servicios)
│   │   ├── validators/   # Validación de inputs
│   │   └── utils/        # Helpers: ApiError, asyncHandler
│   ├── prisma/
│   │   ├── schema.prisma # Schema completo (35+ modelos)
│   │   └── migrations/   # Migraciones SQL
│   └── uploads/          # Archivos subidos (runtime)
├── frontend/             # React + Vite
│   ├── src/
│   │   ├── pages/        # Páginas organizadas por rol
│   │   ├── components/   # Componentes reutilizables
│   │   ├── store/        # Estado global (Zustand)
│   │   └── services/     # Cliente HTTP (axios)
│   └── public/           # Archivos estáticos
├── ocr-service/          # Microservicio Python OCR
│   ├── main.py           # FastAPI app
│   └── requirements.txt
├── docs/                 # Documentación técnica
├── deploy.sh             # Script de despliegue
└── README.md
```

---

## Roles de usuario y permisos

| Rol | Descripción | Acceso |
|-----|-------------|--------|
| `admin` | Administrador institucional | Panel admin: usuarios, cursos, plantillas OMR, analítica, configuración |
| `docente` | Profesor | Banco de preguntas, simulacros virtuales/físicos, OCR, reportes por curso |
| `estudiante` | Alumno | Realizar simulacros, ver resultados, progreso personal |
| `padre` | Acudiente | Portal de seguimiento (en desarrollo) |

### Feature flags (por usuario y por institución)

- `featurePhysicalSimulacros` — Habilita simulacros físicos + OCR para un docente
- `featureOcrEnabled` — Habilita OCR individual
- `featurePhysicalGlobal` / `featureOcrGlobal` — Toggles a nivel institucional (SystemConfig)

---

## Links útiles

| Recurso | URL |
|---------|-----|
| Servidor producción | `http://187.33.148.149` |
| API producción | `http://187.33.148.149/api` |
| API health | `http://187.33.148.149/api/health` |
| Prisma Studio (local) | `npx prisma studio` en `backend/` |

---

## Documentación adicional

- [Arquitectura detallada](./docs/ARCHITECTURE.md)
- [Guía de deployment](./docs/DEPLOYMENT.md)
- [Backend README](./backend/README.md)
- [Frontend README](./frontend/README.md)
- [OCR Service README](./ocr-service/README.md)
- [Schema de base de datos](./backend/prisma/SCHEMA.md)
