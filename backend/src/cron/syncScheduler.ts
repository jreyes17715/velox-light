import cron from 'node-cron';
import { syncSales, syncUsers } from '../services/syncService';
import { logger } from '../utils/logger';

export function startSyncScheduler(): void {
  // Ventas: cada 15 minutos
  cron.schedule('*/15 * * * *', async () => {
    logger.info('CRON: sync de ventas (cada 15 min)');
    try {
      await syncSales(false);
    } catch (error) {
      logger.error('CRON: error en sync de ventas:', error);
    }
  });

  // Usuarios: cada hora
  cron.schedule('0 * * * *', async () => {
    logger.info('CRON: sync de usuarios (cada hora)');
    try {
      await syncUsers();
    } catch (error) {
      logger.error('CRON: error en sync de usuarios:', error);
    }
  });

  logger.info('CRON: schedulers iniciados (ventas c/15min, usuarios c/1h)');
}
