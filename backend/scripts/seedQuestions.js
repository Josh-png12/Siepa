#!/usr/bin/env node
'use strict';

require('dotenv').config();
const prisma = require('../src/config/prisma');

const QUESTIONS = [
  {
    area: 'lectura',
    competencia: 'Comprensión lectora',
    statementText:
      'Lee el siguiente fragmento:\n\n"El ser humano es el único animal que tropieza dos veces con la misma piedra, y lo hace porque la memoria selectiva le permite recordar los triunfos y olvidar los fracasos."\n\nSegún el fragmento, ¿cuál es la función de la memoria selectiva en el ser humano?',
    options: [
      { label: 'A', text: 'Permite aprender de los errores cometidos.' },
      { label: 'B', text: 'Facilita recordar éxitos y olvidar fracasos.' },
      { label: 'C', text: 'Ayuda a evitar cometer los mismos errores.' },
      { label: 'D', text: 'Genera una visión negativa del fracaso.' }
    ],
    correctAnswer: 'B'
  },
  {
    area: 'matematicas',
    competencia: 'Razonamiento y argumentación',
    statementText:
      'Una tienda vende camisas a $45.000 cada una. Si un cliente compra 3 camisas y paga con un billete de $200.000, ¿cuánto dinero le devuelven?',
    options: [
      { label: 'A', text: '$55.000' },
      { label: 'B', text: '$65.000' },
      { label: 'C', text: '$75.000' },
      { label: 'D', text: '$85.000' }
    ],
    correctAnswer: 'B'
  },
  {
    area: 'ciencias',
    competencia: 'Explicación de fenómenos',
    statementText:
      'Una planta se coloca en una habitación oscura durante 48 horas. Al encender la luz, ¿cuál de los siguientes procesos se activa primero?',
    options: [
      { label: 'A', text: 'La respiración celular.' },
      { label: 'B', text: 'La fotosíntesis.' },
      { label: 'C', text: 'La transpiración.' },
      { label: 'D', text: 'La absorción de agua.' }
    ],
    correctAnswer: 'B'
  },
  {
    area: 'sociales',
    competencia: 'Pensamiento sistémico',
    statementText:
      'En Colombia, la Constitución de 1991 estableció el Estado Social de Derecho. ¿Cuál de las siguientes características define mejor este modelo?',
    options: [
      { label: 'A', text: 'El Estado garantiza únicamente el orden público.' },
      { label: 'B', text: 'Los derechos fundamentales son protegidos por el Estado.' },
      { label: 'C', text: 'La economía es controlada totalmente por el gobierno.' },
      { label: 'D', text: 'Los ciudadanos no tienen obligaciones con el Estado.' }
    ],
    correctAnswer: 'B'
  },
  {
    area: 'ingles',
    competencia: 'Reading comprehension',
    statementText:
      "Read the text:\n\n\"Sarah has been working as a nurse for 10 years. She loves helping patients recover, but sometimes finds the night shifts exhausting.\"\n\nAccording to the text, how does Sarah feel about her job?",
    options: [
      { label: 'A', text: 'She finds it boring and tiring.' },
      { label: 'B', text: 'She considers it very rewarding.' },
      { label: 'C', text: 'She wants to change her career.' },
      { label: 'D', text: 'She dislikes working with patients.' }
    ],
    correctAnswer: 'B'
  }
];

async function main() {
  console.log('Seeding questions...\n');

  const school = await prisma.school.findUnique({ where: { slug: 'demo' } });
  if (!school) {
    console.error('School "demo" not found. Run "node scripts/seed.js" first.');
    process.exit(1);
  }
  console.log(`School: "${school.name}" (id: ${school.id})`);

  const author = await prisma.user.findFirst({
    where: { schoolId: school.id, role: { in: ['docente', 'admin'] } },
    orderBy: { createdAt: 'asc' }
  });
  if (!author) {
    console.error('No docente or admin user found in school "demo". Run seed.js first.');
    process.exit(1);
  }
  console.log(`Author: "${author.name}" <${author.email}> role=${author.role}\n`);

  // Delete all existing questions for this school before reseeding
  // Must remove QuestionVersion rows first due to FK RESTRICT constraint
  const existingIds = await prisma.question.findMany({
    where: { schoolId: school.id },
    select: { id: true }
  });
  const ids = existingIds.map((q) => q.id);
  if (ids.length > 0) {
    await prisma.questionVersion.deleteMany({ where: { questionId: { in: ids } } });
  }
  const deleted = await prisma.question.deleteMany({ where: { schoolId: school.id } });
  console.log(`Deleted ${deleted.count} existing question(s) from school.\n`);

  for (const q of QUESTIONS) {
    await prisma.question.create({
      data: {
        schoolId: school.id,
        statementText: q.statementText,
        statementImages: [],
        latex: '',
        options: q.options,
        correctAnswer: q.correctAnswer,
        area: q.area,
        competencia: q.competencia,
        nivelCognitivo: 'comprender',
        dificultadCualitativa: 'media',
        triParamA: 1.0,
        triParamB: 0.0,
        triParamC: 0.2,
        visibility: 'institutional',
        calibrationStatus: 'experimental',
        estado: 'publicada',
        currentVersion: 1,
        createdById: author.id,
        updatedById: author.id
      }
    });
    console.log(`  OK  [${q.area}] "${q.statementText.slice(0, 70).replace(/\n/g, ' ')}..."`);
  }

  console.log(`\nDone. Created: ${QUESTIONS.length}`);
}

main()
  .catch((err) => {
    console.error('\nSeed failed:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
