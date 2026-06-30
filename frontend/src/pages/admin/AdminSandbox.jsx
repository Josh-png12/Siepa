import { useCallback, useEffect, useState } from 'react';
import {
  adminListUsers,
  adminSandboxGenerateSheet,
  adminSandboxGetResults,
  adminSandboxListSimulacros
} from '../../services/api';
import { adminTokens } from './adminTokens';

const STATUS_LABELS = {
  valid: { label: 'Válida', cls: 'bg-emerald-50 text-emerald-700' },
  needsReview: { label: 'Revisión', cls: 'bg-amber-50 text-amber-700' },
  invalid: { label: 'Inválida', cls: 'bg-red-50 text-red-700' },
  duplicate: { label: 'Duplicada', cls: 'bg-slate-100 text-slate-600' }
};

function StatusBadge({ status }) {
  const s = STATUS_LABELS[status] || { label: status, cls: 'bg-slate-100 text-slate-600' };
  return (
    <span className={`${adminTokens.classes.badge} ${s.cls}`}>{s.label}</span>
  );
}

function AdminSandbox() {
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [generating, setGenerating] = useState(false);
  const [lastGenerated, setLastGenerated] = useState(null);
  const [sandboxSimulacros, setSandboxSimulacros] = useState([]);
  const [selectedSimulacroId, setSelectedSimulacroId] = useState('');
  const [results, setResults] = useState(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadStudents = useCallback(async () => {
    try {
      const res = await adminListUsers({ role: 'estudiante', limit: 200, q: studentSearch || undefined });
      setStudents(res?.data?.items || res?.items || []);
    } catch (_err) {
      setStudents([]);
    }
  }, [studentSearch]);

  const loadSandboxSimulacros = useCallback(async () => {
    try {
      const res = await adminSandboxListSimulacros();
      const list = res?.data || [];
      setSandboxSimulacros(list);
      if (list.length > 0 && !selectedSimulacroId) {
        setSelectedSimulacroId(list[0].id);
      }
    } catch (_err) {
      setSandboxSimulacros([]);
    }
  }, [selectedSimulacroId]);

  useEffect(() => { loadStudents(); }, [loadStudents]);
  useEffect(() => { loadSandboxSimulacros(); }, []);

  const handleGenerate = async () => {
    if (!studentId) return setError('Selecciona un estudiante');
    setError('');
    setSuccessMsg('');
    setGenerating(true);
    try {
      const res = await adminSandboxGenerateSheet(studentId);
      const data = res?.data || res;
      setLastGenerated(data);
      setSuccessMsg(`Hoja generada para ${data.studentName}. Descarga el PDF y escanéalo con el equipo OMR.`);
      await loadSandboxSimulacros();
      if (data.simulacroId) setSelectedSimulacroId(data.simulacroId);
    } catch (err) {
      setError(err?.response?.data?.message || 'Error al generar la hoja');
    } finally {
      setGenerating(false);
    }
  };

  const handleLoadResults = async () => {
    if (!selectedSimulacroId) return;
    setLoadingResults(true);
    setError('');
    try {
      const res = await adminSandboxGetResults(selectedSimulacroId);
      setResults(res?.data || res);
    } catch (err) {
      setError(err?.response?.data?.message || 'Error al cargar resultados');
    } finally {
      setLoadingResults(false);
    }
  };

  useEffect(() => {
    if (selectedSimulacroId) handleLoadResults();
  }, [selectedSimulacroId]);

  const filteredStudents = students.filter((s) =>
    !studentSearch || s.name?.toLowerCase().includes(studentSearch.toLowerCase())
  );

  return (
    <div className={`${adminTokens.classes.page} ${adminTokens.spacing.page}`}>
      <div>
        <h1 className={adminTokens.classes.title}>Espacio de Prueba</h1>
        <p className={adminTokens.classes.subtitle}>
          Prueba el flujo completo de calificación de hojas físicas sin afectar datos reales.
          Solo visible para administradores.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Generar hoja */}
        <div className={`${adminTokens.classes.card} ${adminTokens.spacing.card} space-y-4`}>
          <h2 className={adminTokens.classes.sectionHeader}>1. Generar hoja de prueba</h2>
          <p className="text-sm text-slate-500">
            Genera una hoja OMR con marca de agua <strong>"PRUEBA - NO VÁLIDO"</strong>. El QR está
            firmado con HMAC-SHA256 y marcado como sandbox — el sistema nunca lo contará como
            actividad real del estudiante.
          </p>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Buscar estudiante</label>
            <input
              type="text"
              placeholder="Nombre del estudiante..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className={`${adminTokens.classes.input} w-full text-sm`}
            />
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className={`${adminTokens.classes.input} w-full text-sm`}
            >
              <option value="">— Selecciona un estudiante —</option>
              {filteredStudents.map((s) => (
                <option key={s.id} value={s.id}>{s.name} {s.email ? `(${s.email})` : ''}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
              {successMsg}
            </div>
          )}

          <button
            type="button"
            disabled={!studentId || generating}
            onClick={handleGenerate}
            className={`${adminTokens.classes.buttonPrimary} w-full text-sm disabled:opacity-50`}
          >
            {generating ? 'Generando...' : 'Generar hoja de prueba'}
          </button>

          {lastGenerated && (
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 space-y-2">
              <p className="text-sm font-medium text-blue-800">Hoja generada — {lastGenerated.studentName}</p>
              <div className="flex flex-col gap-1">
                <a
                  href={lastGenerated.omrPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-blue-700 underline hover:text-blue-900"
                >
                  Descargar hoja OMR (para escanear)
                </a>
                {lastGenerated.examPdfUrl && (
                  <a
                    href={lastGenerated.examPdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-blue-700 underline hover:text-blue-900"
                  >
                    Descargar hoja de preguntas
                  </a>
                )}
              </div>
              <p className="text-xs text-blue-500">
                Expira: {new Date(lastGenerated.expiresAt).toLocaleString('es-CO')}
              </p>
            </div>
          )}
        </div>

        {/* Ver resultados */}
        <div className={`${adminTokens.classes.card} ${adminTokens.spacing.card} space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className={adminTokens.classes.sectionHeader}>2. Resultados de escaneo</h2>
            <button
              type="button"
              onClick={handleLoadResults}
              disabled={!selectedSimulacroId || loadingResults}
              className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40"
            >
              {loadingResults ? 'Cargando...' : 'Actualizar'}
            </button>
          </div>

          {sandboxSimulacros.length > 1 && (
            <select
              value={selectedSimulacroId}
              onChange={(e) => setSelectedSimulacroId(e.target.value)}
              className={`${adminTokens.classes.input} w-full text-sm`}
            >
              {sandboxSimulacros.map((s) => (
                <option key={s.id} value={s.id}>{s.title} ({s.sheetsProcessed} hojas)</option>
              ))}
            </select>
          )}

          {!results && !loadingResults && (
            <p className="text-sm text-slate-400 text-center py-6">
              Genera una hoja, escanéala con el equipo OMR y vuelve aquí para ver el resultado.
            </p>
          )}

          {loadingResults && (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          )}

          {results && !loadingResults && (
            <div className="space-y-3">
              {results.sheets.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">
                  Ninguna hoja procesada aún para este sandbox.
                </p>
              )}
              {results.sheets.map((sheet) => (
                <div key={sheet.id} className="border border-slate-100 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-800">{sheet.studentName}</span>
                    <StatusBadge status={sheet.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-slate-600">
                    <div>
                      <span className="block text-slate-400">Puntaje</span>
                      <span className="font-semibold">{sheet.score != null ? sheet.score.toFixed(1) : '—'}</span>
                    </div>
                    <div>
                      <span className="block text-slate-400">Theta</span>
                      <span className="font-semibold">{sheet.theta != null ? sheet.theta.toFixed(2) : '—'}</span>
                    </div>
                    <div>
                      <span className="block text-slate-400">Confianza</span>
                      <span className="font-semibold">
                        {sheet.detectionConfidence != null
                          ? `${Math.round(sheet.detectionConfidence * 100)}%`
                          : '—'}
                      </span>
                    </div>
                  </div>
                  {Array.isArray(sheet.parsedAnswers) && sheet.parsedAnswers.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                        Ver respuestas detectadas ({sheet.parsedAnswers.length})
                      </summary>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {sheet.parsedAnswers.map((a) => (
                          <span
                            key={a.questionNumber}
                            className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700"
                          >
                            {a.questionNumber}: {a.markedOption || '—'}
                          </span>
                        ))}
                      </div>
                    </details>
                  )}
                  {Array.isArray(sheet.errors) && sheet.errors.length > 0 && (
                    <div className="text-xs text-red-600 space-y-0.5">
                      {sheet.errors.map((e, i) => (
                        <p key={i}>{e.type}: {e.message}</p>
                      ))}
                    </div>
                  )}
                  {sheet.previewUrl && (
                    <a
                      href={sheet.previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 underline"
                    >
                      Ver imagen escaneada
                    </a>
                  )}
                  <p className="text-xs text-slate-400">
                    Procesada: {sheet.processedAt ? new Date(sheet.processedAt).toLocaleString('es-CO') : 'pendiente'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 space-y-1">
        <p className="font-semibold">Cómo usar el espacio de prueba</p>
        <ol className="list-decimal list-inside space-y-0.5 text-amber-700">
          <li>Selecciona cualquier estudiante del colegio y genera la hoja OMR de prueba.</li>
          <li>Imprime la hoja — verás la marca de agua roja "PRUEBA - NO VÁLIDO".</li>
          <li>Márcala con respuestas y escanéala con el equipo OMR real.</li>
          <li>El resultado aparece aquí. El estudiante NO recibe ningún impacto en su perfil.</li>
        </ol>
      </div>
    </div>
  );
}

export default AdminSandbox;
