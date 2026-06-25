const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

prisma.$on('error', async (e) => {
  if (e.message.includes('ConnectionReset') || e.message.includes('terminating connection')) {
    console.log('[DB] Reconectando a Neon...');
    await prisma.$connect();
  }
});

module.exports = prisma;
