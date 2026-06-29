const AREA_NAMES = {
  LECTURA_CRITICA: 'Lectura Crítica',
  MATEMATICAS: 'Matemáticas',
  CIENCIAS_NATURALES: 'Ciencias Naturales',
  CIENCIAS_SOCIALES: 'Ciencias Sociales',
  INGLES: 'Inglés'
};

const BADGES = {
  FIRST_SIMULACRO: {
    key: 'FIRST_SIMULACRO',
    name: 'Primer paso',
    description: 'Completaste tu primer simulacro',
    icon: 'trophy'
  },
  STREAK_7: {
    key: 'STREAK_7',
    name: 'Semana constante',
    description: '7 días seguidos practicando',
    icon: 'flame'
  },
  STREAK_30: {
    key: 'STREAK_30',
    name: 'Mes de fuego',
    description: '30 días seguidos practicando',
    icon: 'star'
  },
  FIRST_PERFECT: {
    key: 'FIRST_PERFECT',
    name: 'Puntaje perfecto',
    description: 'Obtuviste 100% en un área',
    icon: 'sparkle'
  },
  IMPROVEMENT_10: {
    key: 'IMPROVEMENT_10',
    name: 'En ascenso',
    description: 'Subiste 10+ puntos en un área vs tu simulacro anterior',
    icon: 'trending-up'
  }
};

for (const [area, areaName] of Object.entries(AREA_NAMES)) {
  BADGES[`MASTERY_${area}`] = {
    key: `MASTERY_${area}`,
    name: `Dominio en ${areaName}`,
    description: `Superaste 80% en ${areaName} en un simulacro`,
    icon: 'medal'
  };
}

module.exports = { BADGES, AREA_NAMES };
