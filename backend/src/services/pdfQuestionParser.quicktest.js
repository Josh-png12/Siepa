const { parseQuestionBlocks } = require('./pdfQuestionParserService');

const samples = [
  {
    name: 'ICFES base',
    text: `
1. En una reacción química, seleccione la opción correcta según la ley de conservación de masa.
A. La masa total de reactivos es igual a la masa total de productos.
B. La masa se destruye durante el proceso.
C. La masa solo se conserva en estado sólido.
D. Ninguna de las anteriores.
Respuesta: A
Explicación: La ley de Lavoisier establece conservación de la masa.
2)
El estudiante analiza una tabla de datos y concluye que la variable dependiente cambia linealmente.
A) El modelo es exponencial.
B) El modelo es lineal.
C) El modelo no existe.
D) El modelo es logarítmico.
`
  },
  {
    name: 'Opciones inline',
    text: `
Pregunta 10: Si x^2 = 4, entonces x puede ser:
A. 2 B. -2 C. 2 y -2 D. 0
Clave: C
Pregunta 11:
En el siguiente texto se describe una figura geométrica con tres lados.
(A) Cuadrado
(B) Triángulo
(C) Pentágono
(D) Círculo
`
  },
  {
    name: 'Saltos y gaps',
    text: `
13
Marque la respuesta correcta.
A - Opción uno
B - Opción dos
C - Opción tres

15 - Enunciado con salto en numeración.
A: alfa
B: beta
C: gamma
D: delta
R. D
Justificación: Se cumple la condición del enunciado.
`
  }
];

samples.forEach((sample, idx) => {
  const parsed = parseQuestionBlocks(sample.text);
  // eslint-disable-next-line no-console
  console.log(`\n[Sample ${idx + 1}] ${sample.name}`);
  // eslint-disable-next-line no-console
  console.log('stats:', parsed.meta.stats);
  // eslint-disable-next-line no-console
  console.log('warnings:', parsed.meta.warnings);
  // eslint-disable-next-line no-console
  console.log('first question:', parsed.questions[0]);
});
