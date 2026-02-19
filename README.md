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
npm i tesseract.js pdfjs-dist canvas
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
