const path = require('path');
const { Worker } = require('worker_threads');
const PdfImportBatch = require('../models/PdfImportBatch');
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
  const sameInstitution = String(job.institutionId) === String(requester.institutionId || '');
  const isOwner = String(job.userId) === String(requester.id || '');
  const isAdmin = requester.role === 'admin';
  return sameInstitution && (isOwner || isAdmin);
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
    await PdfImportBatch.findByIdAndUpdate(job.batchId, {
      $set: {
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
      institutionId: job.institutionId,
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
    await PdfImportBatch.findByIdAndUpdate(job.batchId, {
      $set: {
        status: 'failed',
        errorMessage: message
      }
    });

    await logAudit({
      institutionId: job.institutionId,
      userId: job.userId,
      action: job.status === 'canceled' ? 'teacher.pdfImport.ocrCanceled' : 'teacher.pdfImport.ocrFailed',
      entityType: 'PdfImportBatch',
      entityId: job.batchId,
      metadata: {
        jobId: job.jobId,
        error: message
      }
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
        const resultPayload = {
          ...(message.result || {}),
          batchId: next.batchId
        };
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
        await finalizeJob(next, 'canceled', {
          error: String(message.error || 'OCR job cancelado')
        });
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

const enqueueOcrJob = ({ userId, institutionId, batchId, pdfPath, answersPdfPath = '', config = {} }) => {
  const jobId = buildJobId();
  const job = {
    jobId,
    userId: String(userId),
    institutionId: String(institutionId),
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
  if (!job) {
    throw new ApiError(404, 'NotFound', ['OCR job no encontrado']);
  }
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

module.exports = {
  enqueueOcrJob,
  getOcrJobStatus,
  cancelOcrJob
};

