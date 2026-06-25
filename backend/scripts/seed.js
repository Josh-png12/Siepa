#!/usr/bin/env node
'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/config/prisma');

async function main() {
  console.log('Seeding database...\n');

  // 1. School
  const school = await prisma.school.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Colegio Demo',
      slug: 'demo'
    }
  });
  console.log(`School: "${school.name}" (id: ${school.id})`);

  // 2. Admin user
  const hashedPassword = await bcrypt.hash('Admin1234!', 10);

  const admin = await prisma.user.upsert({
    where: { email_schoolId: { email: 'admin@demo.com', schoolId: school.id } },
    update: {},
    create: {
      schoolId: school.id,
      name: 'Admin',
      email: 'admin@demo.com',
      password: hashedPassword,
      role: 'admin'
    }
  });
  console.log(`User:   "${admin.name}" <${admin.email}> role=${admin.role} (id: ${admin.id})`);

  console.log('\nDone. Login credentials:');
  console.log('  email:     admin@demo.com');
  console.log('  password:  Admin1234!');
  console.log('  schoolSlug: demo');
}

main()
  .catch((err) => {
    console.error('\nSeed failed:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
