import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function errorHandler(err: Error & { status?: number; statusCode?: number; type?: string }, req: Request, res: Response, _next: NextFunction): void {
  logger.error(`Unhandled error: ${err.message}`, err.stack);
  // Respeta el status real del error cuando existe (ej: body-parser manda
  // status 413 "entity.too.large" para payloads que exceden el limite) en
  // vez de aplastar todo a un 500 generico que ocultaba la causa real.
  const status = err.status ?? err.statusCode ?? 500;
  const message = err.type === 'entity.too.large'
    ? 'El archivo es demasiado grande.'
    : status === 500 ? 'Internal server error' : err.message;
  res.status(status).json({ error: message });
}
