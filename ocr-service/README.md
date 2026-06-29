# OCR Service — SIEPA

Microservicio Python que procesa hojas de respuesta OMR (Optical Mark Recognition) usando OpenCV. Se comunica con el backend Node.js a través de HTTP.

---

## Qué hace

1. Recibe una imagen (JPG/PNG) de una hoja de respuesta física
2. Aplica corrección de perspectiva si la hoja está inclinada
3. Lee el código QR de identificación del estudiante
4. Analiza la densidad de píxeles oscuros en cada burbuja de respuesta
5. Devuelve la matriz de respuestas con niveles de confianza por burbuja

---

## Instalación

### Requisitos

- Python 3.9+
- `pip`

### Dependencias

```bash
cd ocr-service
pip install -r requirements.txt
```

**Paquetes principales:**
- `fastapi` — Framework HTTP
- `uvicorn` — Servidor ASGI
- `opencv-python` — Procesamiento de imágenes
- `numpy` — Operaciones matriciales
- `pyzbar` — Lectura de QR codes
- `python-multipart` — Soporte multipart/form-data

**Nota Windows:** `pyzbar` requiere la DLL de `zbar`. Descargar desde https://sourceforge.net/projects/zbar/ y agregar al PATH, o instalar con conda: `conda install -c conda-forge zbar`.

---

## Correr el servicio

```bash
cd ocr-service

# Windows
start.bat

# Linux / macOS (desarrollo con hot reload)
uvicorn main:app --host 0.0.0.0 --port 8001 --reload

# Producción
uvicorn main:app --host 0.0.0.0 --port 8001 --workers 2
```

El servicio queda disponible en `http://localhost:8001`.

---

## Endpoints

### `GET /health`

Health check. Responde con `{"status": "ok"}`.

### `POST /process-sheet`

Procesa una hoja de respuestas.

**Request:**
- Content-Type: `multipart/form-data`
- Campo `file`: imagen JPG o PNG de la hoja
- Query `dpi`: DPI de la imagen (default: 200)

**Response:**
```json
{
  "bubbleMatrix": [
    {
      "questionNumber": 1,
      "optionsDensity": [0.12, 0.78, 0.09, 0.05, 0.03]
    }
  ],
  "qrToken": "abc123xyz",
  "corrected": true,
  "confidence": 0.82
}
```

| Campo | Descripción |
|-------|-------------|
| `bubbleMatrix` | Una entrada por pregunta; `optionsDensity` = fracción de píxeles oscuros en cada opción (0–1) |
| `qrToken` | ID del estudiante leído desde el QR de la hoja |
| `corrected` | `true` si se aplicó corrección de perspectiva |
| `confidence` | Promedio de la densidad máxima por pregunta (indicador de calidad del escaneo) |

El backend interpreta la opción marcada como la de mayor densidad si supera un umbral de confianza del 80%.

---

## Configuración

| Variable | Default | Descripción |
|----------|---------|-------------|
| `OMR_DPI` | `200` | DPI asumido para imágenes entrantes |
| `OMR_DARK_THRESHOLD` | `128` | Umbral de luminosidad — píxeles por debajo de este valor se consideran "oscuros" |

---

## Sistema de coordenadas

El servicio lee la posición de cada burbuja desde:
```
backend/src/config/omrCoordinates.json
```

Este JSON define en milímetros: el origen de la grilla, el espaciado entre preguntas, el diámetro de burbuja, y la posición del QR. Para cambiar la plantilla física basta con actualizar este archivo, sin tocar el código Python.

---

## Integración con el backend Node.js

El backend llama al microservicio desde `omrService.js`:

```
Backend (Node.js)
  ↓ POST /api/teacher/ocr/:id/upload
ocrController → omrService
  ↓ multipart/form-data
OCR Service :8001/process-sheet
  ↓ JSON respuesta
omrService procesa bubbleMatrix
  ↓
Guarda PhysicalAnswerSheet en PostgreSQL
```

La URL del servicio se configura con `OCR_SERVICE_URL` en el backend (default: `http://localhost:8001`).

---

## Producción

El servicio no necesita estar expuesto públicamente — solo el backend lo consume.

```bash
# Con PM2
pm2 start "uvicorn main:app --host 0.0.0.0 --port 8001" --name siepa-ocr
pm2 save
```
