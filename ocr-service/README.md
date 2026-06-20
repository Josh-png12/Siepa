# SIEPA OCR Microservice

FastAPI + OpenCV service for robust OMR bubble detection. Handles tilted sheets, angled photos, and uneven lighting via perspective correction.

## Installation

```bash
cd ocr-service
pip install -r requirements.txt
```

On Windows, `pyzbar` requires the `zbar` DLL. Download the Windows binary from https://sourceforge.net/projects/zbar/ and add it to your PATH, or install via conda: `conda install -c conda-forge zbar`.

## Running

```bash
# Windows
start.bat

# Linux / macOS
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

The service runs on **port 8001** by default.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/health` | Liveness check |
| `POST` | `/process-sheet` | Process an OMR answer sheet image |

### POST /process-sheet

**Request:** `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `file` | File | PNG or JPG image of the answer sheet |
| `dpi`  | int (query) | Image DPI — default 200, configurable via `OMR_DPI` env var |

**Response:**

```json
{
  "bubbleMatrix": [
    { "questionNumber": 1, "optionsDensity": [0.85, 0.12, 0.10, 0.11, 0.09] },
    ...
  ],
  "qrToken": "abc123",
  "corrected": true,
  "confidence": 0.92
}
```

- `optionsDensity`: fraction of dark pixels in each bubble circle (0 = blank, 1 = fully filled)
- `corrected`: whether perspective correction was applied
- `confidence`: average of the highest density per question

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OMR_DPI` | `200` | Default DPI assumed for incoming images |
| `OMR_DARK_THRESHOLD` | `128` | Luminance cutoff — pixels below this are "dark" |

## Coordinate system

Reads `../backend/src/config/omrCoordinates.json` for bubble positions. No code changes needed when the sheet layout changes — just update the JSON.
