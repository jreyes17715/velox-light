const jwt = require('jsonwebtoken');
const secret = '(KGf3O{]Imghj{vUN|[kZ}l:zeJpZg|xf:lB4k&G@L1yu;]7h@2k18,!=F:0+a!X';

// Generar tokens para cada usuario seed
const users = [
  { sapUserId: 'A00247', name: 'María López (Directora seed)' },
  { sapUserId: 'A00250', name: 'Carmen García (Directora seed)' },
  { sapUserId: 'A00248', name: 'Ana Pérez (Consultora seed)' },
  { sapUserId: 'CS-00001', name: 'Carmen Luisa Santiago V. (LUCERO)' },
  { sapUserId: 'AROMA01', name: 'Aroma del Rosal (EL ROSAL)' },
];

users.forEach(({ sapUserId, name }) => {
  const token = jwt.sign({ sapUserId }, secret, { expiresIn: '24h' });
  console.log(`\n--- ${name} ---`);
  console.log(token);
});
