const path = require('path');
const { Worker } = require('worker_threads');
const prisma = require('../config/prisma');
const { logAudit } = require('../services/auditLogService');
const ApiError = require('../utils/ApiError');

const queue = [];
const jobStore = new Map();
let activeJob = null;

const workerPath = path.join(__dirname, '..', 'workers', 'ocrWorker.js');

const buildJobId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const toProgress = (progress = {}) => ({
  currentPage: Number(progress.currentPage || 0),
  totalPages: Number(progress.totalPages || 0),
  percent: Number(progress.percent || 0)
});

const getJobPublic = (job) => ({
  jobId: job.jobId,
  batchId: job.batchId,
  status: job.status,
  progress: toProgress(job.progress),
  result: job.status === 'done' ? job.result : undefined,
  error: (job.status === 'error' || job.status === 'canceled') ? job.error : undefined
});

const canAccessJob = (job, requester) => {
  const sameSchool = String(job.schoolId) === String(requester.schoolId || '');
  const isOwner = String(job.userId) === String(requester.id || '');
  const isAdmin = requester.role === 'admin';
  return sameSchool && (isOwner || isAdmin);
};

const setJobStatus = (job, status, patch = {}) => {
  job.status = status;
  if (patch.progress) job.progress = toProgress(patch.progress);
  if (Object.prototype.hasOwnProperty.call(patch, 'result')) job.result = patch.result;
  if (Object.prototype.hasOwnProperty.call(patch, 'error')) job.error = patch.error;
  job.updatedAt = new Date();
  jobStore.set(job.jobId, job);
};

const persistBatchResult = async (job) => {
  if (!job.batchId) return;

  if (job.status === 'done') {
    const result = job.result || {};
    await prisma.pdfImportBatch.update({
      where: { id: job.batchId },
      data: {
        status: 'preview',
        ocrUsed: Boolean(result.ocrUsed),
        detectedBlocks: result.blocksDetected || result.previewBlocks || result.blocks || [],
        detectedQuestions: result.detectedQuestions || result.questions || [],
        pages: result.pages || [],
        stats: {
          ...(result.stats || {}),
          progress: toProgress(result.progress || {})
        },
        warnings: result.warnings || [],
        errorMessage: ''
      }
    });

    await logAudit({
      schoolId: job.schoolId,
      userId: job.userId,
      action: 'teacher.pdfImport.ocrDone',
      entityType: 'PdfImportBatch',
      entityId: job.batchId,
      metadata: {
        jobId: job.jobId,
        totalQuestions: Number((result.detectedQuestions || result.questions || []).length || 0)
      }
    });
    return;
  }

  if (job.status === 'error' || job.status === 'canceled') {
    const message = String(job.error || (job.status === 'canceled' ? 'OCR job cancelado' : 'OCR worker failed'));
    await prisma.pdfImportBatch.update({
      where: { id: job.batchId },
      data: { status: 'failed', errorMessage: message }
    });

    await logAudit({
      schoolId: job.schoolId,
      userId: job.userId,
      action: job.status === 'canceled' ? 'teacher.pdfImport.ocrCanceled' : 'teacher.pdfImport.ocrFailed',
      entityType: 'PdfImportBatch',
      entityId: job.batchId,
      metadata: { jobId: job.jobId, error: message }
    });
  }
};

const finalizeJob = async (job, status, patch = {}) => {
  setJobStatus(job, status, patch);
  try {
    await persistBatchResult(job);
  } catch (_error) {
    // Avoid crashing queue on persistence failures.
  }
};

const processNext = async () => {
  if (activeJob) return;

  let next = queue.shift();
  while (next && next.status === 'canceled') {
    next = queue.shift();
  }
  if (!next) return;

  activeJob = next;
  setJobStatus(next, 'processing', { progress: next.progress || { currentPage: 0, totalPages: 0, percent: 0 } });

  try {
    const worker = new Worker(workerPath, {
      workerData: {
        jobId: next.jobId,
        pdfPath: next.pdfPath,
        answersPdfPath: next.answersPdfPath || '',
        config: next.config || {}
      }
    });

    next.worker = worker;

    const timeoutMs = Number(process.env.PDF_OCR_JOB_TIMEOUT_MS || 20 * 60 * 1000);
    const timeout = setTimeout(() => {
      worker.postMessage({ type: 'cancel' });
      worker.terminate().catch(() => {});
    }, timeoutMs);

    worker.on('message', async (message) => {
      if (!message || typeof message !== 'object') return;

      if (message.type === 'progress') {
        setJobStatus(next, next.status === 'canceled' ? 'canceled' : 'processing', {
          progress: {
            currentPage: Number(message.currentPage || 0),
            totalPages: Number(message.totalPages || 0),
            percent: Number(message.percent || 0)
          }
        });
        return;
      }

      if (message.type === 'done') {
        clearTimeout(timeout);
        const resultPayload = { ...(message.result || {}), batchId: next.batchId };
        await finalizeJob(next, next.status === 'canceled' ? 'canceled' : 'done', {
          result: resultPayload,
          progress: resultPayload.progress || next.progress
        });
        activeJob = null;
        processNext();
        return;
      }

      if (message.type === 'canceled') {
        clearTimeout(timeout);
        await finalizeJob(next, 'canceled', { error: String(message.error || 'OCR job cancelado') });
        activeJob = null;
        processNext();
        return;
      }

      if (message.type === 'error') {
        clearTimeout(timeout);
        await finalizeJob(next, next.status === 'canceled' ? 'canceled' : 'error', {
          error: String(message.error || 'OCR worker failed')
        });
        activeJob = null;
        processNext();
      }
    });

    worker.on('error', async (error) => {
      clearTimeout(timeout);
      await finalizeJob(next, next.status === 'canceled' ? 'canceled' : 'error', {
        error: error?.message || 'OCR worker thread error'
      });
      activeJob = null;
      processNext();
    });

    worker.on('exit', async (code) => {
      clearTimeout(timeout);
      const current = jobStore.get(next.jobId);
      if (current && (current.status === 'done' || current.status === 'error' || current.status === 'canceled')) {
        activeJob = null;
        processNext();
        return;
      }

      if (next.status === 'canceled') {
        await finalizeJob(next, 'canceled', { error: 'OCR job cancelado' });
      } else if (code !== 0) {
        await finalizeJob(next, 'error', { error: `OCR worker exited with code ${code}` });
      } else {
        await finalizeJob(next, 'error', { error: 'OCR worker exited without result' });
      }

      activeJob = null;
      processNext();
    });
  } catch (error) {
    await finalizeJob(next, next.status === 'canceled' ? 'canceled' : 'error', {
      error: error?.message || 'Queue processing failed'
    });
    activeJob = null;
    processNext();
  }
};

const enqueueOcrJob = ({ userId, schoolId, batchId, pdfPath, answersPdfPath = '', config = {} }) => {
  const jobId = buildJobId();
  const job = {
    jobId,
    userId: String(userId),
    schoolId: String(schoolId || ''),
    batchId: String(batchId || ''),
    pdfPath,
    answersPdfPath,
    config,
    status: 'queued',
    progress: { currentPage: 0, totalPages: 0, percent: 0 },
    result: null,
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    worker: null
  };

  jobStore.set(jobId, job);
  queue.push(job);
  processNext();
  return jobId;
};

const getJobOrThrow = (jobId) => {
  const job = jobStore.get(String(jobId));
  if (!job) throw new ApiError(404, 'NotFound', ['OCR job no encontrado']);
  return job;
};

const getOcrJobStatus = ({ jobId, requester }) => {
  const job = getJobOrThrow(jobId);
  if (!canAccessJob(job, requester)) {
    throw new ApiError(403, 'Forbidden', ['No autorizado para consultar este OCR job']);
  }
  return getJobPublic(job);
};

const cancelOcrJob = async ({ jobId, requester }) => {
  const job = getJobOrThrow(jobId);
  if (!canAccessJob(job, requester)) {
    throw new ApiError(403, 'Forbidden', ['No autorizado para cancelar este OCR job']);
  }

  if (job.status === 'done' || job.status === 'error' || job.status === 'canceled') {
    return getJobPublic(job);
  }

  const previousStatus = job.status;
  setJobStatus(job, 'canceled', { error: 'OCR job cancelado por usuario' });

  if (job.worker) {
    job.worker.postMessage({ type: 'cancel' });
  }

  if (previousStatus === 'queued') {
    await finalizeJob(job, 'canceled', { error: 'OCR job cancelado por usuario' });
  }

  return getJobPublic(job);
};

const enqueueGeminiJob = ({ userId, schoolId, batchId, pdfPath, answersPdfPath = '', config = {} }) => {
  const jobId = buildJobId();
  const job = {
    jobId,
    userId: String(userId),
    schoolId: String(schoolId || ''),
    batchId: String(batchId || ''),
    pdfPath,
    answersPdfPath,
    config,
    status: 'queued',
    progress: { currentPage: 0, totalPages: 0, percent: 0 },
    result: null,
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    worker: null
  };

  jobStore.set(jobId, job);
  setJobStatus(job, 'processing');

  (async () => {
    try {
      const { extractQuestionsFromPdf } = require('../services/pdfQuestionExtractor');

      const { preguntas: geminiQuestions, paginasProcesadas } = await extractQuestionsFromPdf({
        filePath: pdfPath,
        onProgress: (progress) => {
          if (job.status !== 'canceled') {
            setJobStatus(job, 'processing', { progress });
          }
        }
      });

      if (job.status === 'canceled') {
        await finalizeJob(job, 'canceled', { error: 'OCR job cancelado' });
        return;
      }

      // Normalize to the same shape ocrWorker produces so the frontend and confirmPreviewBatch work unchanged
      const detectedQuestions = geminiQuestions.map((q, idx) => {
        const opts = q.opciones || {};
        const options = ['A', 'B', 'C', 'D']
          .filter((k) => opts[k])
          .map((k) => ({ label: k, text: String(opts[k]).trim() }));

        let text = String(q.enunciado || '').trim();
        if (q.texto_base) text = `${String(q.texto_base).trim()}\n\n${text}`;
        if (q.tiene_imagen && q.descripcion_imagen) text = `${text}\n[Imagen: ${String(q.descripcion_imagen).trim()}]`;

        return {
          number: Number(q.numero) || idx + 1,
          text,
          page: 0,
          areaGuess: 'Sin clasificar',
          competenciaGuess: 'Sin clasificar',
          nivelGuess: 'comprender',
          answerGuess: null,
          options,
          confidence: 0.9,
          flags: ['GEMINI_EXTRACTED'],
          source: { _source: 'gemini-vision' }
        };
      });

      const pages = paginasProcesadas || 0;
      const result = {
        batchId,
        ocrUsed: true,
        detectedQuestions,
        questions: detectedQuestions,
        blocksDetected: [],
        blocks: [],
        pages: [],
        stats: { engine: 'gemini-vision', pagesOcr: pages, pagesText: 0, pagesFailedOcr: 0 },
        warnings: detectedQuestions.length === 0
          ? ['Gemini no detectó preguntas. Verifica que el PDF tenga contenido legible.']
          : ['Las preguntas extraídas con Gemini Vision no incluyen respuesta correcta. Complétala en revisión.'],
        progress: { currentPage: pages, totalPages: pages, percent: 100 }
      };

      await finalizeJob(job, 'done', { result, progress: result.progress });
    } catch (error) {
      await finalizeJob(job, job.status === 'canceled' ? 'canceled' : 'error', {
        error: error?.message || 'Gemini extraction failed'
      });
    }
  })();

  return jobId;
};

module.exports = { enqueueOcrJob, enqueueGeminiJob, getOcrJobStatus, cancelOcrJob };
