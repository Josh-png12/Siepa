import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import {
  teacherCancelPreviewPdfImportJob,
  teacherCommitPdfImport,
  teacherGetPdfImportConfig,
  teacherPreviewPdfImport,
  teacherPreviewPdfImportStatus
} from '../../services/api';
import Toast from '../../components/ui/Toast.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton.jsx';
import ConfirmModal from '../../components/ui/ConfirmModal.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';

const DEFAULT_MAX_UPLOAD_SIZE_MB = Number(import.meta.env.VITE_MAX_UPLOAD_SIZE_MB || 25);

const AREAS = [
  { id: 'lectura_critica', label: 'Lectura Crítica' },
  { id: 'matematicas', label: 'Matemáticas' },
  { id: 'sociales', label: 'Sociales y Ciudadanas' },
  { id: 'ciencias', label: 'Ciencias Naturales' },
  { id: 'ingles', label: 'Inglés' },
  { id: 'sin_clasificar', label: 'Sin clasificar' }
];

const AREA_ID_TO_LABEL = AREAS.reduce((acc, area) => {
  acc[area.id] = area.label;
  return acc;
}, {});

const AREA_LABEL_TO_ID = {
  'lectura crítica': 'lectura_critica',
  'lectura critica': 'lectura_critica',
  matemáticas: 'matematicas',
  matematicas: 'matematicas',
  'sociales y ciudadanas': 'sociales',
  'ciencias naturales': 'ciencias',
  inglés: 'ingles',
  ingles: 'ingles',
  'sin clasificar': 'sin_clasificar'
};

const NIVEL_OPTIONS = ['recordar', 'comprender', 'aplicar', 'analizar', 'evaluar', 'crear'];

const COMPETENCIAS_BY_AREA = {
  lectura_critica: ['Interpretación y comprensión', 'Reflexión y evaluación', 'Sin clasificar'],
  matematicas: ['Razonamiento y Argumentación', 'Comunicación, Representación y Modelación', 'Formulación y Ejecución', 'Sin clasificar'],
  sociales: ['Pensamiento social', 'Interpretación y análisis de perspectivas', 'Sin clasificar'],
  ciencias: ['Uso comprensivo del conocimiento científico', 'Explicación de fenómenos', 'Sin clasificar'],
  ingles: ['Reading comprehension', 'Language use', 'Sin clasificar'],
  sin_clasificar: ['Sin clasificar']
};

const initialConfig = {
  sessionName: '',
  grade: '',
  year: ''
};

const parseErrorList = (error) => {
  const list = error?.response?.data?.errors;
  if (Array.isArray(list) && list.length) return list;
  return [error?.response?.data?.message || error?.message || 'Error inesperado'];
};

const isPdfFile = (file) => {
  if (!file) return false;
  const mimeValid = String(file.type || '').toLowerCase() === 'application/pdf';
  const extValid = /\.pdf$/i.test(String(file.name || ''));
  return mimeValid || extValid;
};

const normalizeAreaId = (value) => {
  const source = String(value || '').trim().toLowerCase();
  if (!source) return 'sin_clasificar';
  if (AREA_ID_TO_LABEL[source]) return source;
  return AREA_LABEL_TO_ID[source] || 'sin_clasificar';
};

const toQuestionRow = (question) => {
  const areaId = normalizeAreaId(question.areaGuess || question.area || 'sin_clasificar');

  return {
    number: Number(question.number || question.qNumber || 0),
    page: Number(question.page || 0),
    text: String(question.text || question.statement || '').trim(),
    areaId,
    competencia: question.competenciaGuess || COMPETENCIAS_BY_AREA[areaId]?.[0] || 'Sin clasificar',
    nivelCognitivo: (question.nivelGuess || 'comprender').toLowerCase(),
    answerKey: question.answerGuess || '',
    confidence: Number(question.confidence || 0),
    flags: Array.isArray(question.flags) ? question.flags : [],
    options: Array.isArray(question.options)
      ? question.options
      : Object.entries(question.options || {}).map(([label, text]) => ({ label, text })),
    selected: false
  };
};

function PdfImport() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [questionsPdf, setQuestionsPdf] = useState(null);
  const [answersPdf, setAnswersPdf] = useState(null);
  const [config, setConfig] = useState(initialConfig);
  const [maxUploadMB, setMaxUploadMB] = useState(DEFAULT_MAX_UPLOAD_SIZE_MB);
  const [preview, setPreview] = useState(null);
  const [rows, setRows] = useState([]);
  const [batchId, setBatchId] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [ocrJob, setOcrJob] = useState({ jobId: '', status: '', progress: { currentPage: 0, totalPages: 0, percent: 0 } });
  const [errorList, setErrorList] = useState([]);
  const [toast, setToast] = useState({ type: 'info', message: '' });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [ocrBadge, setOcrBadge] = useState(false);

  const [filterArea, setFilterArea] = useState('');
  const [filterFlag, setFilterFlag] = useState('');
  const [filterPage, setFilterPage] = useState('');
  const [bulkArea, setBulkArea] = useState('');
  const [bulkCompetencia, setBulkCompetencia] = useState('');
  const pollingRef = useRef(null);

  const hasFeatureAccess = useMemo(
    () => Boolean(user?.features?.physicalSimulacros || user?.features?.ocrEnabled),
    [user?.features]
  );

  const filteredRows = useMemo(() => rows.filter((row) => {
    if (filterArea && row.areaId !== filterArea) return false;
    if (filterFlag && !row.flags.includes(filterFlag)) return false;
    if (filterPage && Number(row.page) !== Number(filterPage)) return false;
    return true;
  }), [rows, filterArea, filterFlag, filterPage]);

  const allFlags = useMemo(() => {
    const set = new Set();
    rows.forEach((row) => row.flags.forEach((flag) => set.add(flag)));
    return Array.from(set).sort();
  }, [rows]);

  const selectedCount = useMemo(() => rows.filter((row) => row.selected).length, [rows]);
  const previewStats = preview?.meta?.stats || preview?.stats || {};
  const previewWarnings = preview?.meta?.warnings || preview?.warnings || [];
  const blocks = preview?.blocks || [];

  const updateConfig = (key, value) => setConfig((prev) => ({ ...prev, [key]: value }));
  const updateRow = (number, patch) => setRows((prev) => prev.map((row) => (row.number === number ? { ...row, ...patch } : row)));

  useEffect(() => {
    const loadLimit = async () => {
      try {
        const response = await teacherGetPdfImportConfig();
        const payload = response?.data || response;
        const nextMax = Number(payload?.maxUploadMB);
        if (Number.isFinite(nextMax) && nextMax > 0) {
          setMaxUploadMB(nextMax);
        }
      } catch (_error) {
        setMaxUploadMB(DEFAULT_MAX_UPLOAD_SIZE_MB);
      }
    };
    loadLimit();
  }, []);

  const validateFiles = () => {
    const errors = [];
    if (!questionsPdf) errors.push('Debe seleccionar el PDF de preguntas.');
    if (questionsPdf && !isPdfFile(questionsPdf)) errors.push('questionsPdf debe ser un archivo PDF.');
    if (answersPdf && !isPdfFile(answersPdf)) errors.push('answersPdf debe ser un archivo PDF.');
    if (questionsPdf && questionsPdf.size > maxUploadMB * 1024 * 1024) errors.push(`questionsPdf supera ${maxUploadMB}MB.`);
    if (answersPdf && answersPdf.size > maxUploadMB * 1024 * 1024) errors.push(`answersPdf supera ${maxUploadMB}MB.`);
    return errors;
  };

  const buildPreviewFormData = () => {
    const fd = new FormData();
    if (questionsPdf) fd.append('questionsPdf', questionsPdf);
    if (answersPdf) fd.append('answersPdf', answersPdf);
    fd.append('sessionName', String(config.sessionName || ''));
    fd.append('grade', String(config.grade || ''));
    fd.append('year', String(config.year || ''));
    return fd;
  };

  const buildOverridesPayload = () => {
    const perQuestion = {};
    rows.forEach((row) => {
      perQuestion[String(row.number)] = {
        area: AREA_ID_TO_LABEL[row.areaId] || 'Sin clasificar',
        competencia: row.competencia,
        nivelCognitivo: row.nivelCognitivo,
        answerKey: row.answerKey || null
      };
    });
    return { perQuestion };
  };

  const onPreview = async () => {
    const errors = validateFiles();
    if (errors.length) {
      setErrorList(errors);
      return;
    }

    try {
      setLoadingPreview(true);
      setErrorList([]);
      setImportDone(false);
      setUploadProgress(0);

      const response = await teacherPreviewPdfImport(buildPreviewFormData(), {
        onUploadProgress: (evt) => {
          if (!evt.total) return;
          setUploadProgress(Math.round((evt.loaded * 100) / evt.total));
        }
      });

      const data = response?.data || response;
      if (data?.jobId) {
        setOcrJob({
          jobId: String(data.jobId),
          status: 'queued',
          progress: { currentPage: 0, totalPages: 0, percent: 0 }
        });
        setBatchId('');
        setToast({ type: 'info', message: 'OCR en cola. Procesando previsualización...' });
      } else {
        setErrorList(['No se recibió jobId al crear previsualización.']);
        setToast({ type: 'error', message: 'No se pudo iniciar el procesamiento OCR.' });
      }
    } catch (error) {
      if (error?.response?.status === 403) {
        setErrorList(['No tienes permisos para importar PDF. Contacta al administrador.']);
      } else {
        setErrorList(parseErrorList(error));
      }
      setToast({ type: 'error', message: 'No se pudo generar la previsualización.' });
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    if (!ocrJob.jobId) return undefined;
    if (pollingRef.current) window.clearInterval(pollingRef.current);

    pollingRef.current = window.setInterval(async () => {
      try {
        const response = await teacherPreviewPdfImportStatus(ocrJob.jobId);
        const data = response?.data || response;
        const status = String(data?.status || '').toLowerCase();
        const progress = data?.progress || {};

        setOcrJob((prev) => ({
          ...prev,
          status,
          progress: {
            currentPage: Number(progress.currentPage || 0),
            totalPages: Number(progress.totalPages || 0),
            percent: Number(progress.percent || 0)
          }
        }));

        if (status === 'done') {
          const result = data?.result || {};
          const detectedQuestions = result.detectedQuestions || result.questions || [];
          setPreview(result);
          setRows(detectedQuestions.map(toQuestionRow));
          setBatchId(String(result.batchId || ''));
          setOcrBadge(Boolean(result.ocrUsed));
          setToast({ type: 'success', message: 'OCR completado.' });
          window.clearInterval(pollingRef.current);
          pollingRef.current = null;
          setOcrJob({ jobId: '', status: '', progress: { currentPage: 0, totalPages: 0, percent: 0 } });
          setLoadingPreview(false);
        }

        if (status === 'error' || status === 'canceled') {
          setErrorList([String(data?.error || 'OCR falló')]);
          setToast({
            type: status === 'canceled' ? 'info' : 'error',
            message: status === 'canceled' ? 'OCR cancelado.' : 'OCR falló durante la previsualización.'
          });
          window.clearInterval(pollingRef.current);
          pollingRef.current = null;
          setOcrJob({ jobId: '', status: '', progress: { currentPage: 0, totalPages: 0, percent: 0 } });
          setLoadingPreview(false);
        }
      } catch (error) {
        setErrorList(parseErrorList(error));
        setLoadingPreview(false);
        if (pollingRef.current) window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }, 1000);

    return () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [ocrJob.jobId]);

  const onImport = async () => {
    try {
      setLoadingImport(true);
      setErrorList([]);
      const response = await teacherCommitPdfImport({
        batchId,
        overrides: buildOverridesPayload()
      });
      const data = response?.data || response;
      setImportDone(true);
      setConfirmOpen(false);
      setToast({ type: 'success', message: `Importación completada (${data.createdCount || 0} preguntas).` });
    } catch (error) {
      if (error?.response?.status === 403) {
        setErrorList(['No tienes permisos para confirmar esta importación.']);
      } else {
        setErrorList(parseErrorList(error));
      }
      setToast({ type: 'error', message: 'No se pudo completar la importación.' });
    } finally {
      setLoadingImport(false);
    }
  };

  const onRetryWithOcr = async () => {
    const errors = validateFiles();
    if (errors.length) {
      setErrorList(errors);
      return;
    }

    try {
      setLoadingPreview(true);
      setErrorList([]);
      setUploadProgress(0);
      const fd = buildPreviewFormData();
      fd.append('forceOcr', 'true');

      const response = await teacherPreviewPdfImport(fd, {
        onUploadProgress: (evt) => {
          if (!evt.total) return;
          setUploadProgress(Math.round((evt.loaded * 100) / evt.total));
        }
      });

      const data = response?.data || response;
      if (data?.jobId) {
        setOcrJob({
          jobId: String(data.jobId),
          status: 'queued',
          progress: { currentPage: 0, totalPages: 0, percent: 0 }
        });
        setBatchId('');
        setToast({ type: 'info', message: 'OCR en cola. Esperando resultado...' });
      } else {
        setErrorList(['No se recibió jobId al iniciar OCR.']);
        setToast({ type: 'error', message: 'No se pudo iniciar el procesamiento OCR.' });
      }
    } catch (error) {
      setErrorList(parseErrorList(error));
      setToast({ type: 'error', message: 'No se pudo reintentar con OCR.' });
    } finally {
      setLoadingPreview(false);
    }
  };

  const toggleSelectAllFiltered = (checked) => {
    const visible = new Set(filteredRows.map((row) => row.number));
    setRows((prev) => prev.map((row) => (visible.has(row.number) ? { ...row, selected: checked } : row)));
  };

  const applyBulkArea = () => {
    if (!bulkArea) return;
    setRows((prev) => prev.map((row) => (
      row.selected
        ? {
            ...row,
            areaId: bulkArea,
            competencia: (COMPETENCIAS_BY_AREA[bulkArea] || ['Sin clasificar'])[0]
          }
        : row
    )));
  };

  const applyBulkCompetencia = () => {
    if (!bulkCompetencia) return;
    setRows((prev) => prev.map((row) => (row.selected ? { ...row, competencia: bulkCompetencia } : row)));
  };

  if (!hasFeatureAccess) {
    return (
      <EmptyState
        title="Módulo no habilitado"
        description="Tu usuario no tiene habilitada la importación PDF. Solicita activación al administrador."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Toast type={toast.type} message={toast.message} onClose={() => setToast({ type: 'info', message: '' })} />

      <header>
        <h1 className="text-3xl font-bold text-[#0A2E57]">Importar PDF</h1>
        <p className="text-sm text-slate-600">Detección multi-área por bloques, edición por pregunta y confirmación segura.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-[#0A2E57]">Subir PDF de preguntas</h2>
          <p className="mt-1 text-xs text-slate-500">Requerido. Máximo: {maxUploadMB}MB.</p>
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="mt-3 w-full rounded-lg border border-slate-300 p-2 text-sm"
            disabled={loadingPreview || loadingImport}
            onChange={(e) => setQuestionsPdf(e.target.files?.[0] || null)}
          />
          <p className="mt-2 text-sm text-slate-600">{questionsPdf?.name || 'Sin archivo'}</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-[#0A2E57]">Subir PDF de respuestas/explicaciones</h2>
          <p className="mt-1 text-xs text-slate-500">Opcional. Se usa para sugerir clave por pregunta.</p>
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="mt-3 w-full rounded-lg border border-slate-300 p-2 text-sm"
            disabled={loadingPreview || loadingImport}
            onChange={(e) => setAnswersPdf(e.target.files?.[0] || null)}
          />
          <p className="mt-2 text-sm text-slate-600">{answersPdf?.name || 'Sin archivo'}</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-[#0A2E57]">Configuración</h2>
          <div className="mt-3 grid gap-2">
            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Nombre de sesión" value={config.sessionName} onChange={(e) => updateConfig('sessionName', e.target.value)} />
            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Grado" value={config.grade} onChange={(e) => updateConfig('grade', e.target.value)} />
            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Año" value={config.year} onChange={(e) => updateConfig('year', e.target.value)} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={onPreview} disabled={loadingPreview || loadingImport} className="rounded-lg bg-[#0A2E57] px-4 py-2 text-sm text-white disabled:opacity-60">
              {loadingPreview ? 'Previsualizando...' : 'Previsualizar'}
            </button>
            <button type="button" onClick={() => setConfirmOpen(true)} disabled={!preview || loadingPreview || loadingImport} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-60">
              {loadingImport ? 'Importando...' : 'Importar'}
            </button>
            {importDone ? (
              <button type="button" onClick={() => navigate('/dashboard/docente/preguntas')} className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">
                Ver preguntas importadas
              </button>
            ) : null}
          </div>
          {uploadProgress > 0 ? <p className="mt-2 text-xs text-slate-500">Progreso upload: {uploadProgress}%</p> : null}
        </section>
      </div>

      {errorList.length > 0 ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">Errores</p>
          <ul className="mt-2 list-disc pl-5">
            {errorList.map((error) => <li key={error}>{error}</li>)}
          </ul>
        </div>
      ) : null}

      {loadingPreview ? <LoadingSkeleton className="h-36 w-full" /> : null}

      {preview ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-[#0A2E57]">Bloques detectados</h3>
              <span className="text-sm text-slate-500">Batch: {batchId || '-'}</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {blocks.length === 0 ? (
                <EmptyState title="Sin bloques detectados" description="No se pudieron identificar secciones por área." />
              ) : blocks.map((block, idx) => (
                <article key={`${block.areaGuess}-${idx}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="font-semibold text-slate-800">{block.areaGuess}</p>
                  <p className="text-xs text-slate-600">{block.label}</p>
                  <p className="mt-1 text-xs text-slate-600">Páginas: {(block.pages || []).join(', ') || '-'}</p>
                  <StatusBadge tone={Number(block.confidence || 0) >= 0.75 ? 'ok' : 'warning'} label={`Conf. ${Number(block.confidence || 0).toFixed(2)}`} />
                </article>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-600">
              <span>Total preguntas: <strong>{previewStats.total || previewStats.totalQuestions || 0}</strong></span>
              <span>Con respuesta: <strong>{previewStats.withAnswer || 0}</strong></span>
              <span>Con flags: <strong>{previewStats.flaggedCount || 0}</strong></span>
              {ocrBadge ? <StatusBadge tone="ok" label="OCR activado" /> : null}
              {preview?.progress ? (
                <span>OCR: {preview.progress.currentPage || 0}/{preview.progress.totalPages || 0} ({preview.progress.percent || 0}%)</span>
              ) : null}
              {ocrJob.jobId ? (
                <span>Procesando OCR: {ocrJob.progress.currentPage}/{ocrJob.progress.totalPages} ({ocrJob.progress.percent}%)</span>
              ) : null}
            </div>
            {previewWarnings.length > 0 ? (
              <div className="mt-3 space-y-1">
                {previewWarnings.map((warning) => (
                  <p key={warning} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{warning}</p>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-[#0A2E57]">Preguntas detectadas</h3>
              <p className="text-sm text-slate-500">Mostrando {filteredRows.length} de {rows.length}</p>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <select value={filterArea} onChange={(e) => setFilterArea(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">Filtrar por área</option>
                {AREAS.map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}
              </select>
              <select value={filterFlag} onChange={(e) => setFilterFlag(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">Filtrar por flag</option>
                {allFlags.map((flag) => <option key={flag} value={flag}>{flag}</option>)}
              </select>
              <input value={filterPage} onChange={(e) => setFilterPage(e.target.value)} placeholder="Filtrar por página" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button type="button" onClick={() => { setFilterArea(''); setFilterFlag(''); setFilterPage(''); }} className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
                Limpiar filtros
              </button>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <select value={bulkArea} onChange={(e) => setBulkArea(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">Área masiva</option>
                {AREAS.map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}
              </select>
              <button type="button" onClick={applyBulkArea} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">
                Aplicar área a selección
              </button>
              <select value={bulkCompetencia} onChange={(e) => setBulkCompetencia(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">Competencia masiva</option>
                {Array.from(new Set(Object.values(COMPETENCIAS_BY_AREA).flat())).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <button type="button" onClick={applyBulkCompetencia} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">
                Aplicar competencia a selección
              </button>
            </div>

            <div className="mt-3 flex items-center gap-3 text-sm text-slate-600">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={filteredRows.length > 0 && filteredRows.every((row) => row.selected)}
                  onChange={(e) => toggleSelectAllFiltered(e.target.checked)}
                />
                Seleccionar visibles
              </label>
              <span>Seleccionadas: {selectedCount}</span>
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="p-2">Sel</th>
                    <th className="p-2">#</th>
                    <th className="p-2">Página</th>
                    <th className="p-2">Área</th>
                    <th className="p-2">Competencia</th>
                    <th className="p-2">Nivel</th>
                    <th className="p-2">Respuesta</th>
                    <th className="p-2">Confianza</th>
                    <th className="p-2">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr><td className="p-4 text-slate-500" colSpan="9">No hay preguntas para los filtros seleccionados.</td></tr>
                  ) : filteredRows.map((row) => {
                    const competencias = COMPETENCIAS_BY_AREA[row.areaId] || ['Sin clasificar'];
                    return (
                      <tr key={`${row.number}-${row.page}`} className="border-t border-slate-200 align-top">
                        <td className="p-2">
                          <input type="checkbox" checked={row.selected} onChange={(e) => updateRow(row.number, { selected: e.target.checked })} />
                        </td>
                        <td className="p-2 font-semibold text-slate-700">{row.number}</td>
                        <td className="p-2">{row.page || '-'}</td>
                        <td className="p-2">
                          <select
                            value={row.areaId}
                            onChange={(e) => updateRow(row.number, {
                              areaId: e.target.value,
                              competencia: (COMPETENCIAS_BY_AREA[e.target.value] || ['Sin clasificar'])[0]
                            })}
                            className="rounded border border-slate-300 px-2 py-1"
                          >
                            {AREAS.map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}
                          </select>
                        </td>
                        <td className="p-2">
                          <select value={row.competencia} onChange={(e) => updateRow(row.number, { competencia: e.target.value })} className="rounded border border-slate-300 px-2 py-1">
                            {competencias.map((item) => <option key={item} value={item}>{item}</option>)}
                          </select>
                        </td>
                        <td className="p-2">
                          <select value={row.nivelCognitivo} onChange={(e) => updateRow(row.number, { nivelCognitivo: e.target.value })} className="rounded border border-slate-300 px-2 py-1">
                            {NIVEL_OPTIONS.map((nivel) => <option key={nivel} value={nivel}>{nivel}</option>)}
                          </select>
                        </td>
                        <td className="p-2">
                          <input value={row.answerKey} onChange={(e) => updateRow(row.number, { answerKey: e.target.value.toUpperCase().slice(0, 1) })} placeholder="A-E" className="w-16 rounded border border-slate-300 px-2 py-1" />
                        </td>
                        <td className="p-2">
                          <StatusBadge tone={row.confidence >= 0.8 ? 'ok' : row.confidence >= 0.6 ? 'warning' : 'danger'} label={Number(row.confidence || 0).toFixed(2)} />
                        </td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-1">
                            {row.flags.length === 0 ? <span className="text-slate-400">-</span> : row.flags.map((flag) => (
                              <span key={flag} className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{flag}</span>
                            ))}
                          </div>
                          <p className="mt-2 text-xs text-slate-500 line-clamp-3">{row.text}</p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {!preview && !loadingPreview ? (
        <EmptyState
          title="Listo para importar"
          description="Carga los PDFs y usa Previsualizar para detectar bloques, áreas y preguntas."
        />
      ) : null}

      {preview && rows.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <p className="text-sm">No se detectaron preguntas. Si es un PDF escaneado, reintenta con OCR.</p>
          <button type="button" onClick={onRetryWithOcr} disabled={loadingPreview} className="mt-2 rounded-lg bg-amber-600 px-3 py-2 text-sm text-white disabled:opacity-60">
            Reintentar con OCR (PDF escaneado)
          </button>
        </div>
      ) : null}

      {ocrJob.jobId ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-800">
            OCR en progreso: página {ocrJob.progress.currentPage} de {ocrJob.progress.totalPages} ({ocrJob.progress.percent}%)
          </p>
          <button
            type="button"
            className="mt-2 rounded-lg bg-blue-700 px-3 py-2 text-sm text-white"
            onClick={async () => {
              try {
                await teacherCancelPreviewPdfImportJob(ocrJob.jobId);
              } catch (_error) {
                // noop
              }
              if (pollingRef.current) {
                window.clearInterval(pollingRef.current);
                pollingRef.current = null;
              }
              setOcrJob({ jobId: '', status: '', progress: { currentPage: 0, totalPages: 0, percent: 0 } });
              setLoadingPreview(false);
              setToast({ type: 'info', message: 'Cancelación solicitada.' });
            }}
          >
            Cancelar OCR
          </button>
        </div>
      ) : null}

      <ConfirmModal
        isOpen={confirmOpen}
        title="Confirmar importación"
        description={`Esto creará ${rows.length} preguntas en el banco institucional. ¿Deseas continuar?`}
        confirmLabel="Importar"
        cancelLabel="Cancelar"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={onImport}
      />
    </div>
  );
}

export default PdfImport;
