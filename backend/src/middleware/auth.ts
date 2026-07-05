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
    } catch (err) {
      logger.debug('JWT verification failed:', err);
      res.status(403).json({ error: 'Invalid token' });
      return;
    }

    // Extraer sapUserId del payload (soporta multiples formatos)
    const sapUserId = decoded.sapUserId || decoded.userId || String(decoded.data?.user?.id || '');

    if (!sapUserId) {
      logger.debug('No sapUserId found in token payload:', decoded);
      res.status(403).json({ error: 'Invalid token payload' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { sapUserId },
      include: { subordinates: true },
    });

    if (!user) {
      logger.debug(`User not found for sapUserId: ${sapUserId}`);
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
