
/**
 * Modelo Logístico 3PL (3-Parameter Logistic)
 * @param {number} theta - Habilidad del estudiante
 * @param {number} a - Discriminación del ítem
 * @param {number} b - Dificultad del ítem
 * @param {number} c - Pseudo-azar (por defecto 0.2 para 5 opciones)
 * @returns {number} Probabilidad de respuesta correcta
 */
const threePL = (theta, a, b, c = 0.2) => {
  const expTerm = Math.exp(-a * (theta - b));
  return c + (1 - c) / (1 + expTerm);
};

/**
 * Derivada de la función 3PL (para Newton-Raphson)
 * @param {number} theta - Habilidad del estudiante
 * @param {number} a - Discriminación
 * @param {number} b - Dificultad
 * @param {number} c - Pseudo-azar
 * @returns {number} Derivada
 */
const derivativeThreePL = (theta, a, b, c = 0.2) => {
  const expTerm = Math.exp(-a * (theta - b));
  const denom = Math.pow(1 + expTerm, 2);
  return (a * (1 - c) * expTerm) / denom;
};

/**
 * Información del ítem en 3PL (Fisher information)
 * @param {number} theta - Habilidad del estudiante
 * @param {number} a - Discriminación
 * @param {number} b - Dificultad
 * @param {number} c - Pseudo-azar
 * @returns {number} Información
 */
const itemInformation = (theta, a, b, c = 0.2) => {
  const p = threePL(theta, a, b, c);
  const d = derivativeThreePL(theta, a, b, c);
  return (d * d) / (p * (1 - p));
};

/**
 * Estimación de θ con MLE + Newton-Raphson (versión robusta)
 * @param {Array} responses - Respuestas del estudiante (array de { questionId, selectedOption })
 * @param {Array} items - Ítems (array de { _id, a, b, c, correctAnswer })
 * @param {number} initialTheta - θ inicial (default 0)
 * @returns {number} θ estimado
 */
const estimateTheta = (responses, items, initialTheta = 0) => {
  if (responses.length === 0 || items.length === 0) {
    console.warn('No hay respuestas o ítems para estimar θ. Retornando 0.');
    return 0;
  }

  let theta = initialTheta;
  const maxIterations = 50;
  const tolerance = 1e-5;
  const minTheta = -3;  // Bounds para evitar divergencia
  const maxTheta = 3;

  for (let i = 0; i < maxIterations; i++) {
    let firstDerivative = 0;
    let secondDerivative = 0;

    responses.forEach((resp) => {
      const item = items.find(q => q._id.toString() === resp.questionId.toString());
      if (!item) return;

      const a = item.a || 1.0;
      const b = item.b || 0.0;
      const c = item.c || 0.2;
      const p = threePL(theta, a, b, c);
      const d = derivativeThreePL(theta, a, b, c);

      const u = (resp.selectedOption === item.correctAnswer) ? 1 : 0;
      firstDerivative += (u - p) * d / (p * (1 - p));
      secondDerivative -= itemInformation(theta, a, b, c);
    });

    if (Math.abs(secondDerivative) < 1e-6) {
      console.warn('Denominador demasiado pequeño. Retornando θ actual.');
      break;
    }

    const delta = firstDerivative / secondDerivative;
    theta -= delta;

    // Bounds para evitar divergencia
    if (theta < minTheta) theta = minTheta;
    if (theta > maxTheta) theta = maxTheta;

    if (Math.abs(delta) < tolerance) break;
  }

  return parseFloat(theta.toFixed(4));
};

/**
 * Estimación de θ con EAP (Expected a Posteriori) - Alternativa bayesiana
 * @param {Array} responses - Respuestas del estudiante
 * @param {Array} items - Ítems
 * @param {number} priorMean - Media del prior (default 0)
 * @param {number} priorVariance - Varianza del prior (default 1)
 * @returns {number} θ estimado
 */
const estimateThetaEAP = (responses, items, priorMean = 0, priorVariance = 1) => {
  if (responses.length === 0 || items.length === 0) return 0;

  let posteriorMean = priorMean;
  let posteriorVariance = priorVariance;

  responses.forEach((resp) => {
    const item = items.find(q => q._id.toString() === resp.questionId.toString());
    if (!item) return;

    const a = item.a || 1.0;
    const b = item.b || 0.0;
    const c = item.c || 0.2;
    const p = threePL(posteriorMean, a, b, c);

    const u = (resp.selectedOption === item.correctAnswer) ? 1 : 0;
    const likelihood = u * p + (1 - u) * (1 - p);

    // Actualizar posterior (aproximación)
    posteriorMean = (posteriorMean * (1 / posteriorVariance) + a * (u - c) / (1 - c)) / (1 / posteriorVariance + a * a * p * (1 - p));
    posteriorVariance = 1 / (1 / posteriorVariance + a * a * p * (1 - p));
  });

  return parseFloat(posteriorMean.toFixed(4));
};

module.exports = { threePL, estimateTheta, estimateThetaEAP };