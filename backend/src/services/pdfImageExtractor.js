const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

const loadPdfJs = () => require('pdfjs-dist/legacy/build/pdf.js');

/**
 * Extrae todas las imágenes incrustadas de una página PDF usando un enfoque robusto.
 * Usa tanto XObjects como renderizado completo como fallback.
 *
 * @param {string} pdfPath - Ruta al archivo PDF
 * @param {number} pageNum - Número de página (1-indexed)
 * @param {string} outputDir - Directorio donde guardar las imágenes
 * @param {string} prefix - Prefijo para los nombres de archivo (ej: 'page_5')
 * @param {number} maxWidth - Ancho máximo para redimensionar (default: 800px)
 * @returns {Promise<string[]>} - Rutas relativas de las imágenes guardadas
 */
async function extractImagesFromPdfPage(pdfPath, pageNum, outputDir, prefix = 'image', maxWidth = 800) {
    const pdfjsLib = loadPdfJs();
    const buffer = await fs.readFile(pdfPath);
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const page = await doc.getPage(pageNum);

    // Método 1: Extraer XObjects (imágenes incrustadas)
    const imageUrls = [];
    let imageCounter = 0;
    await fs.mkdir(outputDir, { recursive: true });

    try {
        // Obtener el operador list y los objetos XObject
        const operatorList = await page.getOperatorList();
        const xobjs = await page.getXObjects?.() || {};

        // Iterar sobre los operadores para encontrar imágenes
        for (let i = 0; i < operatorList.fnArray.length; i++) {
            const fn = operatorList.fnArray[i];
            const args = operatorList.argsArray[i];

            // paintImageXObject, paintJpegXObject, etc.
            if (fn === 'paintImageXObject' || fn === 'paintJpegXObject' || fn === 85) {
                const xobjName = args[0];
                if (!xobjName) continue;

                let xobj = null;

                // Intentar obtener el XObject desde el mapa de objetos
                if (xobjs && xobjs[xobjName]) {
                    xobj = xobjs[xobjName];
                } else if (page.getXObject) {
                    // Fallback: método directo (versiones antiguas)
                    xobj = await page.getXObject(xobjName);
                }

                if (!xobj || !xobj.data || !xobj.width || !xobj.height) continue;

                // Crear un buffer de imagen a partir de los datos
                let imageBuffer = null;

                // Si xobj.data es un Uint8Array o ArrayBuffer
                if (xobj.data.buffer) {
                    imageBuffer = Buffer.from(xobj.data);
                }
                // Si es una cadena base64
                else if (typeof xobj.data === 'string') {
                    if (xobj.data.startsWith('data:image')) {
                        const base64Data = xobj.data.split(',')[1];
                        imageBuffer = Buffer.from(base64Data, 'base64');
                    } else {
                        imageBuffer = Buffer.from(xobj.data, 'base64');
                    }
                }
                // Si es un objeto con .buffer
                else if (xobj.data && typeof xobj.data === 'object' && xobj.data.buffer) {
                    imageBuffer = Buffer.from(xobj.data.buffer);
                }

                if (!imageBuffer || imageBuffer.length === 0) {
                    console.warn(`[PDF IMAGE] Imagen ${xobjName} sin datos válidos, saltando...`);
                    continue;
                }

                // Intentar convertir a PNG usando Sharp
                try {
                    // Verificar si el buffer es una imagen válida
                    const metadata = await sharp(imageBuffer).metadata().catch(() => null);
                    if (!metadata) {
                        console.warn(`[PDF IMAGE] Formato no soportado para ${xobjName}, usando conversión forzada...`);
                        // Si no es soportado, intentar guardar como PNG desde un canvas (opcional)
                        // O simplemente saltar para que el fallback de página completa lo capture
                        continue;
                    }

                    // Redimensionar si supera el ancho máximo
                    let image = sharp(imageBuffer);
                    if (metadata.width && metadata.width > maxWidth) {
                        const ratio = maxWidth / metadata.width;
                        const newHeight = Math.round(metadata.height * ratio);
                        image = image.resize(maxWidth, newHeight, {
                            fit: 'inside',
                            withoutEnlargement: true
                        });
                        console.log(`[PDF IMAGE] Redimensionada de ${metadata.width}x${metadata.height} a ${maxWidth}x${newHeight}`);
                    }

                    // Guardar como PNG
                    imageCounter++;
                    const outputFileName = `${prefix}_img_${String(imageCounter).padStart(3, '0')}.png`;
                    const outputPath = path.join(outputDir, outputFileName);
                    await image.png({ compressionLevel: 6 }).toFile(outputPath);

                    const relativePath = `/uploads/extracted/${outputFileName}`;
                    imageUrls.push(relativePath);
                    console.log(`[PDF IMAGE] Extraída: ${relativePath} (${metadata.width || '?'}x${metadata.height || '?'})`);
                } catch (err) {
                    console.warn(`[PDF IMAGE] Error procesando imagen ${xobjName}:`, err.message);
                }
            }
        }
    } catch (err) {
        console.warn(`[PDF IMAGE] Error extrayendo XObjects:`, err.message);
    }

    // Método 2: Fallback - renderizar la página completa y extraer la imagen completa
    // Esto es útil si no se encontraron XObjects o si los formatos no son soportados
    if (imageUrls.length === 0) {
        console.log(`[PDF IMAGE] No se encontraron imágenes incrustadas o no se pudieron procesar. Intentando renderizado completo de la página como fallback...`);
        try {
            // Usar canvas para renderizar la página completa a PNG
            const canvas = require('canvas');
            const viewport = page.getViewport({ scale: 1.5 });
            const c = canvas.createCanvas(viewport.width, viewport.height);
            const ctx = c.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;
            const pngBuffer = c.toBuffer('image/png');

            // Usar Sharp para redimensionar y guardar
            const outputFileName = `${prefix}_fullpage.png`;
            const outputPath = path.join(outputDir, outputFileName);
            await sharp(pngBuffer)
                .resize(maxWidth, null, { fit: 'inside', withoutEnlargement: true })
                .png({ compressionLevel: 6 })
                .toFile(outputPath);

            const relativePath = `/uploads/extracted/${outputFileName}`;
            imageUrls.push(relativePath);
            console.log(`[PDF IMAGE] Guardada página completa como fallback: ${relativePath}`);
        } catch (err) {
            console.warn(`[PDF IMAGE] Fallback de página completa falló:`, err.message);
        }
    }

    return imageUrls;
}

/**
 * Extrae imágenes de múltiples páginas de un PDF.
 *
 * @param {string} pdfPath - Ruta al archivo PDF
 * @param {Array<number>} pageNumbers - Array de números de página
 * @param {string} baseOutputDir - Directorio base donde guardar
 * @param {number} maxWidth - Ancho máximo para redimensionar
 * @returns {Promise<Object>} - Mapa de { pageNumber: [imageUrls] }
 */
async function extractImagesFromPdf(pdfPath, pageNumbers, baseOutputDir = null, maxWidth = 800) {
    if (!baseOutputDir) {
        baseOutputDir = path.join(process.cwd(), 'uploads', 'extracted');
    }
    await fs.mkdir(baseOutputDir, { recursive: true });

    const results = {};
    for (const pageNum of pageNumbers) {
        const prefix = `page_${pageNum}`;
        const urls = await extractImagesFromPdfPage(pdfPath, pageNum, baseOutputDir, prefix, maxWidth);
        results[pageNum] = urls;
    }
    return results;
}

module.exports = {
    extractImagesFromPdfPage,
    extractImagesFromPdf
};