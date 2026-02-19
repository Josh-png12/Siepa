## Robust PDF Question Parser

Archivo principal: `backend/src/services/robustQuestionParser.js`

### Objetivo
Mejorar detección de preguntas/opciones en PDFs difíciles:
- OCR ruidoso
- dos columnas
- watermarks/headers repetidos
- marcadores inconsistentes (`1.`, `1)`, `Pregunta 1`, `(A)`, `A-`, etc.)

### Reglas principales
- **Normalización fuerte**
  - `\r\n` -> `\n`
  - colapso de espacios
  - correcciones OCR de numeración (ej. `l.` -> `1.`)
  - estandarización de opciones (`A)`, `(A)`, `A-` -> `A.`)
- **Limpieza de ruido**
  - elimina líneas vacías
  - elimina líneas repetidas (headers/watermarks)
- **Anchors tolerantes**
  - Pregunta: `^(pregunta\s*)?\(?\s*([0-9OIlS]{1,3})\s*[\)\.\-:]`
  - Opción: `^\(?\s*([ABCD])\s*[\)\.\-:]`
- **Fallback por métodos**
  1. `direct` (líneas normalizadas)
  2. `pdfjs_items_columns` / `text_gap_columns` (reordenamiento columnas)
  3. `sliding_window` (ventana entre anchors)

### Confidence
- Base: `0.4` si hay anchor de pregunta
- `+0.15` por opción A-D encontrada
- `+0.1` si están A-D completas
- `-0.2` si enunciado `< 20` chars
- `-0.1` si hubo muchas correcciones OCR
- clamp `0..1`

### Debug
En worker se usa `debug` por defecto (`config.debug !== false`).

Se guarda por página en:
- `uploads/tmp/debug/{jobId}/page_{n}.txt` texto normalizado usado para parse
- `uploads/tmp/debug/{jobId}/page_{n}.json` métricas:
  - `anchorsQuestions`
  - `anchorsOptions`
  - `methodUsed`
  - `questionsDetected`
  - `reason`

### Script rápido de prueba
`node backend/scripts/testRobustParser.js`

Con PDF real:
`node backend/scripts/testRobustParser.js C:\\ruta\\archivo.pdf`

El script falla (`exitCode=1`) si detecta `0` preguntas.

