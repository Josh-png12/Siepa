// frontend/src/components/BookletDetail/BookletDetail.js
import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getBooklet, getBookletPDF } from '../../services/api'; // Asegúrate de tener esta función

function BookletDetail() {
  const { id } = useParams(); // Suponiendo que la ruta es /booklets/:id
  const [booklet, setBooklet] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBooklet = async () => {
      try {
        const data = await getBooklet(id);
        setBooklet(data);
      } catch (err) {
        console.error('Error cargando cuadernillo:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchBooklet();
  }, [id]);

  // ← Aquí va tu función
  const handleDownloadPDF = async () => {
    try {
      const blob = await getBookletPDF(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cuadernillo_${booklet?.title || 'sin_nombre'}.pdf`;
      document.body.appendChild(a);   // recomendable en algunos navegadores
      a.click();
      document.body.removeChild(a);   // limpia
      URL.revokeObjectURL(url);       // libera memoria
    } catch (err) {
      console.error('Error descargando PDF:', err);
      alert('No se pudo descargar el PDF. Intenta de nuevo.');
    }
  };

  if (loading) return <div>Cargando cuadernillo...</div>;
  if (!booklet) return <div>Cuadernillo no encontrado</div>;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">{booklet.title}</h1>
      
      <div className="mb-6">
        <p>Preguntas: {booklet.questions.length}</p>
        <p>Duración: {booklet.duration} minutos</p>
      </div>

      {/* Botón de descarga */}
      <button
        onClick={handleDownloadPDF}
        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg mb-6"
        disabled={!booklet.questions?.length}
      >
        Descargar PDF
      </button>

      {/* Vista previa o lista de preguntas (opcional) */}
      <div className="border rounded p-4">
        <h2 className="text-xl mb-2">Preguntas incluidas:</h2>
        <ul className="list-disc pl-6">
          {booklet.questions.map((q, idx) => (
            <li key={q._id}>{q.questionText.substring(0, 80)}...</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default BookletDetail;