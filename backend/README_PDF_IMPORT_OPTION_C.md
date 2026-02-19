## PDF Import Opción C (Text-first + OCR fallback por página)

### Pipeline
1. `extractTextByPage(pdfPath)` (`backend/src/services/pdfPageTextService.js`)
- Usa `pdfjs-dist` página a página.
- Retorna `{ page, text, density }` (y `textItems` para diagnóstico).

2. Heurística `needsOcr`
- `density < PDF_OCR_DENSITY_THRESHOLD` (default `200`) o texto casi vacío.
- Si hay texto suficiente, no se hace OCR.

3. OCR por página (`backend/src/services/pdfOcrService.js`)
- `renderPageToImage(...)` genera PNG por página.
- `ocrImage(...)` ejecuta OCR con timeout por página.
- `ocrPdfPageWithRetry(...)` reintenta 1 vez si falla.

4. Parser flexible (`backend/src/services/flexibleQuestionParser.js`)
- Pregunta: `^\s*(\d{1,3})[\.\)]\s+`
- Opción: `^\s*([A-D])[\.\)]\s+`
- Filtra headers/footers repetidos entre páginas.
- Devuelve segmentos por página con `number/stem/options/pageStart/source/confidence/flags`.

5. Worker/cola (`backend/src/workers/ocrWorker.js`)
- Ejecuta todo por página, emite progreso.
- Cancela entre páginas al recibir `cancel`.
- Log por página: fuente `text|ocr`, densidad, preguntas detectadas.

### Debug
Se guarda en:
- `uploads/tmp/<jobId>/debug/page_<n>.txt`
- `uploads/tmp/<jobId>/debug/page_<n>.json`

Incluye métricas: anchors, método, source, densidad, preguntas detectadas y errores OCR.

### Resultado del job
`result` contiene:
- `detectedQuestions`
- `blocksDetected`
- `stats.pagesText`, `stats.pagesOcr`, `stats.pagesFailedOcr`
- `diagnosisIfZero` cuando no se detecta ninguna pregunta:
  - `no_text_layer`
  - `ocr_failed`
  - `pattern_not_found`
