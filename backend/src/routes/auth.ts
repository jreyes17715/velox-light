import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../types';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const router = Router();

// POST /api/auth/login — intenta auth local (master password o superadmin con contraseña propia).
// Si el usuario no tiene auth local, responde { requiresWordPress: true } y el FRONTEND
// llama directo a WordPress desde el navegador (evita que el Anti-Bot AI de SiteGround
// bloquee la llamada por ser tráfico server-to-server sin cookies).
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as { username: string; password: string };
    if (!username || !password) {
      res.status(400).json({ error: 'Usuario y contraseña requeridos' });
      return;
    }

    // 1. Master password de desarrollo — entra como cualquier usuario sin tocar WordPress
    //    Solo funciona si MASTER_PASSWORD está definido en .env
    const masterPassword = process.env.MASTER_PASSWORD;
    if (masterPassword && password === masterPassword) {
      const targetUser = await prisma.user.findFirst({
        where: { sapUserId: { equals: username, mode: 'insensitive' } },
        select: { sapUserId: true, name: true },
      });
      if (!targetUser) {
        res.status(404).json({ error: `Usuario "${username}" no encontrado en la BD local. Corre una sincronizacion primero.` });
        return;
      }
      const token = jwt.sign(
        { sapUserId: targetUser.sapUserId },
        process.env.JWT_SECRET!,
        { expiresIn: '8h' }
      );
      res.json({ token, _dev: true });
      return;
    }

    // 2. Buscar usuario local con contraseña propia (superadmin del sistema)
    const localUser = await prisma.user.findUnique({
      where: { sapUserId: username },
      select: { sapUserId: true, localPassword: true },
    });

    if (localUser?.localPassword) {
      const match = await bcrypt.compare(password, localUser.localPassword);
      if (!match) {
        res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        return;
      }
      const token = jwt.sign(
        { sapUserId: localUser.sapUserId },
        process.env.JWT_SECRET!,
        { expiresIn: '7d' }
      );
      res.json({ token });
      return;
    }

    // 3. No es auth local -> el frontend debe autenticar directo contra WordPress
    res.json({ requiresWordPress: true });
  } catch (err: any) {
    console.error('[auth/login] Error en auth local. message=%s', err.message);
    res.status(500).json({ error: 'Error interno de autenticación' });
  }
});

// POST /api/auth/me — valida JWT y retorna datos del usuario
router.post('/me', authenticateJWT, (req: AuthRequest, res: Response) => {
  const user = req.user!;

  res.json({
    userId: user.id,
    sapUserId: user.sapUserId,
    name: user.name,
    email: user.email,
    role: user.role,
    unitName: user.unitName,
    isSuperAdmin: user.isSuperAdmin,
    status: user.status,
    supervisorId: user.supervisorId,
    subordinates: user.subordinates.map((s) => ({
      id: s.id,
      name: s.name,
      sapUserId: s.sapUserId,
    })),
  });
});

// PATCH /api/auth/unit-name — actualiza el nombre de unidad (solo directoras)
router.patch('/unit-name', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const user = req.user!;

  if (user.role !== 'directora') {
    res.status(403).json({ error: 'Solo las directoras pueden editar el nombre de unidad' });
    return;
  }

  const { unitName } = req.body as { unitName: string };

  if (!unitName || unitName.trim().length === 0) {
    res.status(400).json({ error: 'El nombre de unidad no puede estar vacío' });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { unitName: unitName.trim() },
  });

  res.json({ unitName: updated.unitName });
});

export default router;
