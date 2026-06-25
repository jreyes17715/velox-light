// Genera un JWT de prueba para cualquier usuario en la BD
// Uso: node gettoken.js <sapUserId>
// Ejemplo: node gettoken.js AROMA01

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || '(KGf3O{]Imghj{vUN|[kZ}l:zeJpZg|xf:lB4k&G@L1yu;]7h@2k18,!=F:0+a!X';

const sapUserId = process.argv[2];

if (!sapUserId) {
  console.error('❌ Uso: node gettoken.js <sapUserId>');
  console.error('   Ejemplo: node gettoken.js AROMA01');
  process.exit(1);
}

const token = jwt.sign(
  { sapUserId },
  JWT_SECRET,
  { expiresIn: '24h' }
);

console.log('\n✅ Token generado para:', sapUserId);
console.log('\n--- TOKEN ---');
console.log(token);
console.log('-------------');
console.log('\n📋 URL de login:');
console.log(`http://localhost:5173/login?token=${token}`);
console.log('\nPega la URL en el navegador para iniciar sesión.\n');
