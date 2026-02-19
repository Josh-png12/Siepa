import { useRef, useState } from 'react';

function UploadArea({
  label = 'Arrastra archivos PDF aqui o haz click para seleccionar',
  accept = '.pdf',
  multiple = true,
  onFilesSelected,
  disabled = false
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const openFilePicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const handleFiles = (fileList) => {
    if (disabled) return;
    const files = Array.from(fileList || []);
    if (!files.length) return;
    onFilesSelected?.(files);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openFilePicker}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openFilePicker();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
      className={`border-2 border-dashed rounded-2xl p-8 text-center transition cursor-pointer ${
        dragging ? 'border-[#0A2E57] bg-blue-50' : 'border-gray-300 bg-gray-50'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      <p className="text-sm text-gray-700">{label}</p>
      <p className="text-xs text-gray-500 mt-2">Formato recomendado: PDF escaneado a 300 dpi B/N</p>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
        disabled={disabled}
      />
    </div>
  );
}

export default UploadArea;
