import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { logger } from './logger';

// SAP Service Layer usa certificado self-signed en IPs privadas
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

let sessionId: string | null = null;
let sessionExpiry: Date | null = null;

const sapAxios: AxiosInstance = axios.create({
  baseURL: process.env.SAP_BASE_URL,
  httpsAgent,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

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
  const session = await getSapSession();
  const response = await sapAxios.get<T>(path, {
    params,
    headers: {
      Cookie: `B1SESSION=${session}; CompanyDB=${process.env.SAP_COMPANY_DB}`,
      Prefer: 'odata.maxpagesize=500', // SAP por defecto devuelve 20; esto lo sube a 500
    },
  });
  return response.data;
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
