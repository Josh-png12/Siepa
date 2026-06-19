const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');

// schoolId filter prevents mixing questions from different schools
// Uses raw SQL because Prisma does not support ORDER BY ABS(column - value)
const buildSimulacroByDifficulty = async ({
  schoolId,
  areas,
  totalQuestions,
  targetDifficulty
}) => {
  const areaList = Prisma.join(areas);

  const rows = await prisma.$queryRaw`
    SELECT id
    FROM "Question"
    WHERE "schoolId" = ${schoolId}
      AND estado = 'publicada'
      AND area IN (${areaList})
    ORDER BY ABS("triParamB" - ${Number(targetDifficulty)}) ASC
    LIMIT ${Number(totalQuestions)}
  `;

  return rows.map((row) => row.id);
};

module.exports = { buildSimulacroByDifficulty };
