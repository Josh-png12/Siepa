const prisma = require('../config/prisma');

const VALID_AREAS = ['LECTURA_CRITICA', 'MATEMATICAS', 'CIENCIAS_NATURALES', 'CIENCIAS_SOCIALES', 'INGLES'];

const AREA_NORMALIZE_MAP = [
  { pattern: /lectura|critica|comprension|lector/i, area: 'LECTURA_CRITICA' },
  { pattern: /matematica|calculo|algebra|geometr/i, area: 'MATEMATICAS' },
  { pattern: /ciencias nat|biolog|fisica|quimic|naturaleza/i, area: 'CIENCIAS_NATURALES' },
  { pattern: /ciencias soc|historia|politica|filosof|sociol/i, area: 'CIENCIAS_SOCIALES' },
  { pattern: /ingles|english|idioma/i, area: 'INGLES' }
];

const normalizeArea = (name) => {
  if (!name) return null;
  const clean = String(name)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  for (const { pattern, area } of AREA_NORMALIZE_MAP) {
    if (pattern.test(clean)) return area;
  }
  // Try exact match after upper + underscore normalization
  const upper = clean.toUpperCase().replace(/\s+/g, '_');
  return VALID_AREAS.includes(upper) ? upper : null;
};

const updateAreaProgress = async (studentId, schoolId, resultadoPorArea) => {
  const areas = Object.keys(resultadoPorArea || {}).filter(a => VALID_AREAS.includes(a));
  if (!areas.length) return { previousScores: {} };

  const existing = await prisma.studentAreaProgress.findMany({
    where: { studentId, area: { in: areas } },
    select: { area: true, lastScore: true, bestScore: true, averageScore: true, totalSimulacros: true }
  });
  const existingMap = new Map(existing.map(e => [e.area, e]));
  const previousScores = Object.fromEntries(existing.map(e => [e.area, e.lastScore]));

  await Promise.all(areas.map(async (area) => {
    const newScore = Number(resultadoPorArea[area]);
    const curr = existingMap.get(area);
    const totalSimulacros = curr ? curr.totalSimulacros + 1 : 1;
    const bestScore = curr ? Math.max(curr.bestScore, newScore) : newScore;
    const averageScore = curr
      ? ((curr.averageScore * curr.totalSimulacros) + newScore) / totalSimulacros
      : newScore;

    await prisma.studentAreaProgress.upsert({
      where: { studentId_area: { studentId, area } },
      create: { studentId, schoolId, area, lastScore: newScore, bestScore: newScore, averageScore: newScore, totalSimulacros: 1, lastUpdated: new Date() },
      update: { lastScore: newScore, bestScore, averageScore, totalSimulacros, lastUpdated: new Date() }
    });
  }));

  return { previousScores };
};

const updateTarget = async (studentId, schoolId, area, targetScore) => {
  if (!VALID_AREAS.includes(area)) throw Object.assign(new Error('Área inválida'), { statusCode: 400 });
  const score = Number(targetScore);
  if (isNaN(score) || score < 0 || score > 500) throw Object.assign(new Error('targetScore debe ser entre 0 y 500'), { statusCode: 400 });

  return prisma.studentAreaProgress.upsert({
    where: { studentId_area: { studentId, area } },
    create: { studentId, schoolId, area, targetScore: score },
    update: { targetScore: score }
  });
};

const getAreaProgress = async (studentId) =>
  prisma.studentAreaProgress.findMany({ where: { studentId }, orderBy: { area: 'asc' } });

module.exports = { updateAreaProgress, updateTarget, getAreaProgress, normalizeArea, VALID_AREAS };
