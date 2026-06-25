const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');
const pdfImportService = require('../services/pdfImportService');
const pdfImportBatchService = require('../services/pdfImportBatchService');

const getScopedUser = (req) => ({
  ...req.user,
  institutionId: req.institutionId || req.user?.institutionId || 'default'
});

const createPdfImport = asyncHandler(async (req, res) => {
  const useVision = req.body?.useVision === true || req.body?.useVision === 'true';
  const data = await pdfImportService.createPdfImportJob({
    user: getScopedUser(req),
    file: req.file,
    useVision
  });

  return successResponse(res, {
    statusCode: 202,
    data,
    message: 'PDF import job created'
  });
});

const listPdfImports = asyncHandler(async (req, res) => {
  const data = await pdfImportService.listPdfImportJobs({
    user: getScopedUser(req),
    query: req.query
  });

  return successResponse(res, {
    data,
    message: 'PDF import jobs loaded'
  });
});

const getPdfImport = asyncHandler(async (req, res) => {
  const data = await pdfImportService.getPdfImportJobDetail({
    user: getScopedUser(req),
    id: req.params.id
  });

  return successResponse(res, {
    data,
    message: 'PDF import job loaded'
  });
});

const updatePdfImportPreview = asyncHandler(async (req, res) => {
  const data = await pdfImportService.updatePdfImportPreview({
    user: getScopedUser(req),
    id: req.params.id,
    payload: req.body
  });

  return successResponse(res, {
    data,
    message: 'Preview updated'
  });
});

const confirmPdfImport = asyncHandler(async (req, res) => {
  const data = await pdfImportService.confirmPdfImportJob({
    user: getScopedUser(req),
    id: req.params.id,
    payload: req.body
  });

  return successResponse(res, {
    statusCode: 201,
    data,
    message: 'Questions imported successfully'
  });
});

const getPdfImportConfig = asyncHandler(async (req, res) => {
  const data = await pdfImportService.getPdfImportConfig({
    user: getScopedUser(req)
  });

  return successResponse(res, {
    data,
    message: 'PDF import config loaded'
  });
});

const previewPdfImportBatch = asyncHandler(async (req, res) => {
  const useVision = req.body?.useVision === true || req.body?.useVision === 'true';
  console.log('[BACKEND] useVision recibido:', req.body?.useVision, '→', useVision);
  const data = await pdfImportBatchService.createPreviewBatch({
    user: getScopedUser(req),
    files: req.files || {},
    payload: { ...(req.body || {}), useVision }
  });

  return res.status(202).json({
    jobId: String(data?.jobId || ''),
    status: 'queued'
  });
});

const confirmPdfImportBatch = asyncHandler(async (req, res) => {
  const data = await pdfImportBatchService.confirmPreviewBatch({
    user: getScopedUser(req),
    payload: req.body || {}
  });

  return successResponse(res, {
    statusCode: 201,
    data,
    message: 'PDF import confirmed'
  });
});

const getPdfImportBatch = asyncHandler(async (req, res) => {
  const data = await pdfImportBatchService.getPreviewBatch({
    user: getScopedUser(req),
    batchId: req.params.batchId
  });

  return successResponse(res, {
    data,
    message: 'PDF batch loaded'
  });
});

const getPdfImportPreviewStatus = asyncHandler(async (req, res) => {
  const data = await pdfImportBatchService.getPreviewJobStatus({
    user: getScopedUser(req),
    jobId: req.params.jobId
  });

  return res.status(200).json({
    status: String(data?.status || 'error'),
    progress: {
      currentPage: Number(data?.progress?.currentPage || 0),
      totalPages: Number(data?.progress?.totalPages || 0),
      percent: Number(data?.progress?.percent || 0)
    },
    result: data?.status === 'done' ? (data?.result || null) : undefined,
    error: (data?.status === 'error' || data?.status === 'canceled') ? (data?.error || null) : undefined
  });
});

const cancelPdfImportPreviewJob = asyncHandler(async (req, res) => {
  const data = await pdfImportBatchService.cancelPreviewJob({
    user: getScopedUser(req),
    jobId: req.params.jobId
  });

  return res.status(200).json({
    status: String(data?.status || 'canceled'),
    progress: {
      currentPage: Number(data?.progress?.currentPage || 0),
      totalPages: Number(data?.progress?.totalPages || 0),
      percent: Number(data?.progress?.percent || 0)
    },
    error: data?.error || null
  });
});

module.exports = {
  createPdfImport,
  listPdfImports,
  getPdfImport,
  updatePdfImportPreview,
  confirmPdfImport,
  getPdfImportConfig,
  previewPdfImportBatch,
  confirmPdfImportBatch,
  getPdfImportBatch,
  getPdfImportPreviewStatus,
  cancelPdfImportPreviewJob
};
