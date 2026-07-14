import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { logger } from './logger';

// SAP Service Layer usa certificado self-signed en IPs privadas
const httpsAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: false });

let sessionId: string | null = null;
let sessionExpiry: Date | null = null;

const sapAxios: AxiosInstance = axios.create({
  baseURL: process.env.SAP_BASE_URL,
  httpsAgent,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
});

const MAX_RETRIES = 6;
const BASE_RETRY_DELAY_MS = 1500;

function isRetryableNetworkError(err: any): boolean {
  // Errores de socket/red (sin respuesta HTTP de SAP) — vale la pena reintentar
  if (err?.response) return false;
  return ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EPIPE', 'ECONNREFUSED', 'EAI_AGAIN'].includes(err?.code);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function sapLogin(): Promise<string> {
  logger.info('SAP: iniciando sesión...');
  const response = await sapAxios.post('/Login', {
    CompanyDB: process.env.SAP_COMPANY_DB,
    UserName: process.env.SAP_USERNAME,
    Password: process.env.SAP_PASSWORD,
  });

  sessionId = response.data.SessionId;
  // Sesiones SAP duran 30 min por defecto
  sessionExpiry = new Date(Date.now() + 28 * 60 * 1000);
  logger.info(`SAP: sesión iniciada OK (expira ${sessionExpiry.toISOString()})`);
  return sessionId!;
}

export async function getSapSession(): Promise<string> {
  if (sessionId && sessionExpiry && new Date() < sessionExpiry) {
    return sessionId;
  }
  return await sapLogin();
}

export async function sapGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  let lastErr: any;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const session = await getSapSession();
    try {
      const response = await sapAxios.get<T>(path, {
        params,
        headers: {
          Cookie: `B1SESSION=${session}; CompanyDB=${process.env.SAP_COMPANY_DB}`,
          Prefer: 'odata.maxpagesize=500', // SAP por defecto devuelve 20; esto lo sube a 500
          Connection: 'close',
        },
      });
      return response.data;
    } catch (err: any) {
      lastErr = err;

      if (isRetryableNetworkError(err) && attempt < MAX_RETRIES) {
        const delay = BASE_RETRY_DELAY_MS * attempt; // backoff creciente: 1.5s, 3s, 4.5s, 6s, 7.5s
        logger.warn(`SAP GET ${path} intento ${attempt}/${MAX_RETRIES} falló (${err.code}). Reintentando en ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      const status = err?.response?.status;
      const rawData = err?.response?.data;
      const sapMessage = rawData?.error?.message?.value;
      const bodyPreview = typeof rawData === 'string' ? rawData.slice(0, 500) : JSON.stringify(rawData)?.slice(0, 500);
      logger.error(`SAP GET ${path} falló (status=${status} code=${err?.code}) params=${JSON.stringify(params)} body=${bodyPreview}`);

      if (sapMessage) {
        throw new Error(`SAP ${path} (${status}): ${sapMessage}`);
      }
      if (bodyPreview) {
        throw new Error(`SAP ${path} (${status}): ${bodyPreview}`);
      }
      throw err;
    }
  }

  throw lastErr;
}

export async function sapLogout(): Promise<void> {
  if (!sessionId) return;
  try {
    await sapAxios.post('/Logout', {}, {
      headers: { Cookie: `B1SESSION=${sessionId}` },
    });
    sessionId = null;
    sessionExpiry = null;
    logger.info('SAP: sesión cerrada');
  } catch {
    logger.warn('SAP: error cerrando sesión (ignorado)');
  }
}
