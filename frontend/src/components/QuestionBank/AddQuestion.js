import { useState } from 'react';
import { addQuestion } from '../../services/api';

function AddQuestion() {
  const [formData, setFormData] = useState({
    area: '', competencia: '', evidencia: '', nivelCognitivo: 'Bajo',
    questionText: '', options: ['', '', '', ''], correctAnswer: 0
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleOptionChange = (index, value) => {
    const newOptions = [...formData.options];
    newOptions[index] = value;
    setFormData({ ...formData, options: newOptions });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await addQuestion(formData);
      alert('Pregunta agregada');
    } catch (err) {
      alert('Error');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Inputs para cada campo */}
      <input name="area" onChange={handleChange} placeholder="Área" />
      <input name="competencia" onChange={handleChange} placeholder="Competencia" />
      <input name="evidencia" onChange={handleChange} placeholder="Evidencia" />
      <select name="nivelCognitivo" onChange={handleChange}>
        <option>Bajo</option><option>Medio</option><option>Alto</option>
      </select>
      <textarea name="questionText" onChange={handleChange} placeholder="Texto de pregunta" />
      {formData.options.map((opt, i) => (
        <input key={i} value={opt} onChange={(e) => handleOptionChange(i, e.target.value)} placeholder={`Opción ${i+1}`} />
      ))}
      <select name="correctAnswer" onChange={handleChange}>
        <option value={0}>A</option><option value={1}>B</option><option value={2}>C</option><option value={3}>D</option>
      </select>
      <button type="submit">Agregar</button>
    </form>
  );
}

export default AddQuestion;