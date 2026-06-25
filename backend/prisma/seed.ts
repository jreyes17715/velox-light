import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Limpiar datos existentes
  await prisma.sale.deleteMany();
  await prisma.target.deleteMany();
  await prisma.user.deleteMany();

  // Crear Directoras
  const directora1 = await prisma.user.create({
    data: {
      sapUserId: 'A00247',
      name: 'María López',
      email: 'maria.lopez@marykay.do',
      role: 'directora',
      unitName: 'Grupo Celestial',
    },
  });

  const directora2 = await prisma.user.create({
    data: {
      sapUserId: 'A00250',
      name: 'Carmen García',
      email: 'carmen.garcia@marykay.do',
      role: 'directora',
      unitName: 'Unidad Rosa Diamante',
    },
  });

  const directora3 = await prisma.user.create({
    data: {
      sapUserId: 'A00251',
      name: 'Rosa Martínez',
      email: 'rosa.martinez@marykay.do',
      role: 'directora',
      unitName: 'Grupo Estrella Brillante',
    },
  });

  // Crear Consultoras de María López
  const consultoras1 = await Promise.all([
    prisma.user.create({ data: { sapUserId: 'A00248', name: 'Ana Pérez', email: 'ana.perez@marykay.do', role: 'consultora', supervisorId: directora1.id } }),
    prisma.user.create({ data: { sapUserId: 'A00249', name: 'Laura Díaz', email: 'laura.diaz@marykay.do', role: 'consultora', supervisorId: directora1.id } }),
    prisma.user.create({ data: { sapUserId: 'A00252', name: 'Sofia Torres', email: 'sofia.torres@marykay.do', role: 'consultora', supervisorId: directora1.id } }),
    prisma.user.create({ data: { sapUserId: 'A00253', name: 'Isabella Reyes', email: 'isabella.reyes@marykay.do', role: 'consultora', supervisorId: directora1.id } }),
  ]);

  // Crear Consultoras de Carmen García
  const consultoras2 = await Promise.all([
    prisma.user.create({ data: { sapUserId: 'A00254', name: 'Valentina Cruz', email: 'valentina.cruz@marykay.do', role: 'consultora', supervisorId: directora2.id } }),
    prisma.user.create({ data: { sapUserId: 'A00255', name: 'Camila Flores', email: 'camila.flores@marykay.do', role: 'consultora', supervisorId: directora2.id } }),
    prisma.user.create({ data: { sapUserId: 'A00256', name: 'Daniela Vargas', email: 'daniela.vargas@marykay.do', role: 'consultora', supervisorId: directora2.id } }),
  ]);

  // Crear Consultoras de Rosa Martínez
  const consultoras3 = await Promise.all([
    prisma.user.create({ data: { sapUserId: 'A00257', name: 'Gabriela Morales', email: 'gabriela.morales@marykay.do', role: 'consultora', supervisorId: directora3.id } }),
    prisma.user.create({ data: { sapUserId: 'A00258', name: 'Natalia Jiménez', email: 'natalia.jimenez@marykay.do', role: 'consultora', supervisorId: directora3.id } }),
    prisma.user.create({ data: { sapUserId: 'A00259', name: 'Paola Herrera', email: 'paola.herrera@marykay.do', role: 'consultora', supervisorId: directora3.id } }),
  ]);

  const todasLasConsultoras = [...consultoras1, ...consultoras2, ...consultoras3];
  const todosLosUsuarios = [directora1, directora2, directora3, ...todasLasConsultoras];

  // Crear Metas para mes actual y anterior
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;

  for (const user of todosLosUsuarios) {
    const isDirectora = user.role === 'directora';
    const targetAmount = isDirectora ? 80000 : 35000;

    await prisma.target.create({
      data: {
        userId: user.sapUserId,
        month: currentMonth,
        year: currentYear,
        targetAmount,
        currency: 'DOP',
      },
    });

    await prisma.target.create({
      data: {
        userId: user.sapUserId,
        month: prevMonth,
        year: prevYear,
        targetAmount,
        currency: 'DOP',
      },
    });
  }

  // Crear Ventas ficticias (últimos 60 días)
  const statuses = ['completed', 'completed', 'completed', 'completed', 'pending', 'cancelled'];
  let saleCounter = 1000;

  for (const user of todosLosUsuarios) {
    const numSales = Math.floor(Math.random() * 8) + 5; // 5-12 ventas por usuario

    for (let i = 0; i < numSales; i++) {
      const daysAgo = Math.floor(Math.random() * 60);
      const saleDate = new Date();
      saleDate.setDate(saleDate.getDate() - daysAgo);

      const amount = Math.floor(Math.random() * 9500) + 500; // 500-10000 DOP
      const status = statuses[Math.floor(Math.random() * statuses.length)];

      saleCounter++;
      await prisma.sale.create({
        data: {
          sapOrderId: `ORD-${saleCounter}`,
          userId: user.sapUserId,
          amount,
          currency: 'DOP',
          saleDate,
          status,
          sapDocNum: saleCounter,
          sapDocEntry: `${saleCounter}`,
        },
      });
    }
  }

  const totalSales = await prisma.sale.count();
  const totalUsers = await prisma.user.count();
  console.log(`✅ Seed completado: ${totalUsers} usuarios, ${totalSales} ventas`);
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
