// Script para crear o actualizar el superadmin del sistema
// Uso: node create-admin.js <username> <password>
// Ejemplo: node create-admin.js SA-ADMIN MiPassword123

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const username = process.argv[2];
  const password = process.argv[3];

  if (!username || !password) {
    console.error('❌ Uso: node create-admin.js <username> <password>');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('❌ La contraseña debe tener al menos 8 caracteres');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { sapUserId: username },
    update: {
      localPassword: hash,
      isSuperAdmin: true,
    },
    create: {
      sapUserId:    username,
      name:         'Super Admin',
      role:         'directora',
      isSuperAdmin: true,
      localPassword: hash,
    },
  });

  console.log(`\n✅ SuperAdmin creado/actualizado:`);
  console.log(`   Usuario:     ${user.sapUserId}`);
  console.log(`   Nombre:      ${user.name}`);
  console.log(`   isSuperAdmin: ${user.isSuperAdmin}`);
  console.log(`\n🔐 Ya puedes iniciar sesión con estas credenciales en el dashboard.\n`);
}

main()
  .catch(e => { console.error('❌ Error:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
