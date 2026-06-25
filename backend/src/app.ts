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
import { startSyncScheduler } from './cron/syncScheduler';

dotenv.config();

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

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

// Error handler
app.use(errorHandler);

// Iniciar cron jobs (solo en producción o si SAP está configurado)
if (process.env.SAP_BASE_URL) {
  startSyncScheduler();
}

export default app;
