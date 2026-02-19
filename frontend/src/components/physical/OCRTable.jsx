function OCRTable({ rows = [], onReview }) {
  return (
    <div className="bg-white rounded-2xl shadow overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b text-left">
            <th className="p-3">Estudiante</th>
            <th className="p-3">Estado</th>
            <th className="p-3">Valid Answers</th>
            <th className="p-3">Errores</th>
            <th className="p-3">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="p-3 text-gray-500" colSpan="5">Sin hojas escaneadas.</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id || row.studentId} className="border-b">
                <td className="p-3">{row.studentName}</td>
                <td className="p-3">{row.status}</td>
                <td className="p-3">{row.validAnswers ?? 0}</td>
                <td className="p-3">{row.errors ?? 0}</td>
                <td className="p-3">
                  <button
                    type="button"
                    onClick={() => onReview?.(row)}
                    className="bg-blue-600 text-white px-3 py-1 rounded"
                  >
                    Revisar
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default OCRTable;
