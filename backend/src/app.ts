import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import dashboardRoutes from './routes/dashboard';
import salesRoutes from './routes/sales';
import adminRoutes from './routes/admin';
import commissionRoutes from './routes/commissions';
import superadminRoutes from './routes/superadmin';
import profileRoutes from './routes/profile';
import diqRoutes from './routes/diq';
import llaveRosaRoutes from './routes/llaveRosa';
import { startSyncScheduler } from './cron/syncScheduler';

dotenv.config();

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
// limit subido a 10mb -- las fotos de vehiculos de Llave Rosa se mandan como
// data-URL (base64) dentro del body JSON, y el default de Express (100kb) las
// rechazaba con "payload too large" (se veia como 500 generico en el frontend
// porque errorHandler no distinguia el codigo real del error).
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/diq', diqRoutes);
app.use('/api/llaverosa', llaveRosaRoutes);

// Error handler
app.use(errorHandler);

// Iniciar cron jobs (solo en producción o si SAP está configurado)
if (process.env.SAP_BASE_URL) {
  startSyncScheduler();
}

export default app;
