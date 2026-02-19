function OmrScanForm({
  scanFile,
  qrPayload,
  bubbleDetections,
  working,
  onScanFileChange,
  onQrPayloadChange,
  onBubbleDetectionsChange,
  onSubmit
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => onScanFileChange(e.target.files?.[0] || null)} className="w-full border rounded-lg px-3 py-2" />
      <textarea
        rows="3"
        placeholder='QR payload, ej: {"studentID":"...","simulacroPhysicalID":"..."}'
        value={qrPayload}
        onChange={(e) => onQrPayloadChange(e.target.value)}
        className="w-full border rounded-lg px-3 py-2"
      />
      <textarea
        rows="6"
        placeholder='bubbleDetections JSON [{"question":1,"option":"A","density":0.12}]'
        value={bubbleDetections}
        onChange={(e) => onBubbleDetectionsChange(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 font-mono text-xs"
      />
      <button type="submit" disabled={working || !scanFile} className="bg-blue-600 text-white px-4 py-2 rounded-lg disabled:opacity-60">
        {working ? 'Procesando...' : 'Procesar escaneo'}
      </button>
    </form>
  );
}

export default OmrScanForm;
