import fs from 'fs';
import path from 'path';

// ============================================================================
// Configuracion administrable de Llave Rosa (fotos reales de los vehiculos).
//
// Se guarda en un archivo JSON en disco en vez de una tabla en la base de
// datos porque este modulo no requiere una migracion de Prisma para algo tan
// simple, y evita tener que coordinar una migracion contra la BD real del
// cliente solo para dos campos de texto (URLs / data-URLs de imagen).
//
// NOTA IMPORTANTE: en Railway el filesystem no es persistente entre deploys
// (se reinicia el contenedor). Esto es aceptable como solucion "de momento"
// (las fotos se pueden volver a subir despues de cada deploy), pero si se
// necesita persistencia real a futuro, migrar esto a una tabla en Postgres
// o a un bucket de almacenamiento (S3/Cloudinary/etc).
// ============================================================================

export interface LlaveRosaConfig {
  carImageA: string | null;   // URL o data-URL (base64) de la foto real del vehiculo Nivel A
  carImageB: string | null;   // URL o data-URL (base64) de la foto real del vehiculo Nivel B
  vehicleNameA: string;
  vehicleNameB: string;
  // Preferencia de premio (auto vs. efectivo) por directora, definida por el
  // Super Admin -- la directora solo la ve, no la puede cambiar ella misma.
  // Se guarda por sapUserId. Si una directora no tiene entrada aqui, se usa
  // un valor de ejemplo (placeholder) hasta que el Super Admin la defina.
  premioPreferencias: Record<string, 'auto' | 'efectivo'>;
}

const DEFAULT_CONFIG: LlaveRosaConfig = {
  carImageA: null,
  carImageB: null,
  vehicleNameA: 'Tiggo 4',
  vehicleNameB: 'Tiggo 7',
  premioPreferencias: {},
};

const CONFIG_DIR  = path.join(__dirname, '..', '..', 'data');
const CONFIG_PATH = path.join(CONFIG_DIR, 'llaveRosaConfig.json');

export function getLlaveRosaConfig(): LlaveRosaConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULT_CONFIG };
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveLlaveRosaConfig(partial: Partial<LlaveRosaConfig>): LlaveRosaConfig {
  const current = getLlaveRosaConfig();
  const updated = { ...current, ...partial };
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}
