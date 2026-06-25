import { Router, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../types';

const router = Router();

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
