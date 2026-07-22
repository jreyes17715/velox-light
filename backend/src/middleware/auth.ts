import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma';
import { AuthRequest, JwtPayload } from '../types';
import { logger } from '../utils/logger';

export async function authenticateJWT(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.substring(7);
    const secret = process.env.JWT_SECRET!;

    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, secret) as JwtPayload;
    } catch (err: any) {
      // warn (no debug) para que quede visible en logs de produccion --
      // esto se estaba silenciando por completo antes (logger.debug no
      // imprime nada cuando NODE_ENV=production), lo que hacia imposible
      // diagnosticar por que ciertos usuarios no podian entrar.
      logger.warn(`JWT verification failed: ${err?.name} - ${err?.message} (token prefix: ${token.slice(0, 12)}...)`);
      res.status(403).json({ error: 'Invalid token' });
      return;
    }

    // Extraer sapUserId del payload (soporta multiples formatos)
    const sapUserId = decoded.sapUserId || decoded.userId || String(decoded.data?.user?.id || '');

    if (!sapUserId) {
      logger.warn(`No sapUserId found in token payload. Keys: ${Object.keys(decoded).join(', ')}`);
      res.status(403).json({ error: 'Invalid token payload' });
      return;
    }

    // findFirst + mode: 'insensitive' -- el token de WordPress a veces trae el
    // sapUserId en minusculas (ej: "yr-00001") mientras que en la BD esta
    // guardado tal cual lo entrega SAP, en mayusculas (ej: "YR-00001"). Una
    // busqueda exacta (findUnique) no los encontraba y tiraba 403 "User not
    // found" aunque el usuario si existiera (bug reportado 21-jul-2026, caso
    // YISSEL RUIZ PIMENTEL / YR-00001). Mismo criterio que ya usaba el login
    // con contraseña master en auth.ts.
    const user = await prisma.user.findFirst({
      where: { sapUserId: { equals: sapUserId, mode: 'insensitive' } },
      include: { subordinates: true },
    });

    if (!user) {
      logger.warn(`User not found for sapUserId: ${sapUserId}`);
      res.status(403).json({ error: 'User not found' });
      return;
    }

    // Para iniciadora: su grupo son sus reclutas (inciadoraId), no supervisorId
    if (user.role === 'iniciadora') {
      const reclutas = await prisma.user.findMany({
        where: { inciadoraId: user.id },
        orderBy: { name: 'asc' },
      });
      (user as any).subordinates = reclutas;
    }

    req.user = user as typeof user & { subordinates: (typeof user)[] };
    logger.debug(`Authenticated user: ${user.name} (${user.role}) - grupo: ${(user as any).subordinates.length}`);
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
