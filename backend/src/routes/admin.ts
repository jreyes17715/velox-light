import { Router, Request, Response } from 'express';
import { fullSync, syncUsers, syncSales, syncCreditNotes } from '../services/syncService';
import { fetchSection1ItemCodes, SapOrder } from '../services/sapService';
import { sapGet } from '../utils/sapClient';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import axios from 'axios';
import https from 'https';

const router = Router();
const ITBIS = 1.18;

// Tipos minimos para /Invoices -- deliberadamente NO se agregan a sapService.ts
// (esto es una funcionalidad aislada y poco frecuente, ver comentario junto a
// POST /invoices/manual mas abajo; no se busca repetir la migracion completa
// de Orders a Invoices que se probo y se revirtio el 25-ago-2026).
interface ManualInvoiceLine {
  ItemCode: string;
  LineTotal: number;
}
interface ManualInvoice {
  DocEntry: number;
  DocNum: number;
  CardCode: string;
  DocDate: string;
  DocTotal: number;
  Cancelled: string; // 'tYES' | 'tNO'
  DocumentLines?: ManualInvoiceLine[];
}

// GET /api/admin/sap/test — diagnóstico de conexión SAP
router.get('/sap/test', async (_req: Request, res: Response) => {
  const httpsAgent = new https.Agent({ rejectUnauthorized: false });
  const baseURL = process.env.SAP_BASE_URL!;
  const companyDB = process.env.SAP_COMPANY_DB!;
  const userName = process.env.SAP_USERNAME!;
  const password = process.env.SAP_PASSWORD!;

  logger.info(`SAP TEST: URL=${baseURL}, CompanyDB=${companyDB}, UserName=${userName}`);

  // Intentar con el username tal cual
  try {
    const r = await axios.post(`${baseURL}/Login`, { CompanyDB: companyDB, UserName: userName, Password: password }, { httpsAgent, timeout: 15000 });
    return res.json({ ok: true, sessionId: r.data.SessionId, testedWith: userName });
  } catch (e1: unknown) {
    const err1 = e1 as { response?: { status?: number; data?: unknown }; message?: string };
    const status1 = err1?.response?.status;
    const data1 = err1?.response?.data;

    // Si falla, intentar con solo la parte después del backslash
    const shortUser = userName.includes('\\') ? userName.split('\\').pop()! : null;
    if (shortUser && shortUser !== userName) {
      try {
        const r2 = await axios.post(`${baseURL}/Login`, { CompanyDB: companyDB, UserName: shortUser, Password: password }, { httpsAgent, timeout: 15000 });
        return res.json({ ok: true, sessionId: r2.data.SessionId, testedWith: shortUser, note: 'Funcionó sin dominio' });
      } catch (e2: unknown) {
        const err2 = e2 as { response?: { status?: number; data?: unknown }; message?: string };
        return res.status(200).json({
          ok: false,
          attempt1: { user: userName, status: status1, sapResponse: data1 },
          attempt2: { user: shortUser, status: err2?.response?.status, sapResponse: err2?.response?.data },
        });
      }
    }

    return res.status(200).json({
      ok: false,
      attempt1: { user: userName, status: status1, sapResponse: data1, message: err1?.message },
    });
  }
});

// POST /api/admin/sync/full — sync completo manual
router.post('/sync/full', async (_req: Request, res: Response) => {
  logger.info('ADMIN: sync completo manual iniciado');
  try {
    await fullSync();
    res.json({ ok: true, message: 'Sync completo finalizado' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ ok: false, error: msg });
  }
});

// POST /api/admin/sync/users — sync solo usuarios
router.post('/sync/users', async (_req: Request, res: Response) => {
  try {
    const result = await syncUsers();
    res.json({ ok: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ ok: false, error: msg });
  }
});

// POST /api/admin/sync/sales — sync solo ventas
router.post('/sync/sales', async (_req: Request, res: Response) => {
  try {
    const result = await syncSales(true);
    res.json({ ok: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ ok: false, error: msg });
  }
});

// GET /api/admin/sync/logs — últimos logs de sync
router.get('/sync/logs', async (_req: Request, res: Response) => {
  const logs = await prisma.syncLog.findMany({
    orderBy: { startedAt: 'desc' },
    take: 20,
  });
  res.json(logs);
});

// POST /api/admin/invoices/manual — agrega Facturas especificas (por DocNum,
// el numero de documento visible en SAP/impresiones -- antes se pedia DocEntry,
// cambiado a DocNum el 03-sep-2026 a pedido de Padrino porque es el numero que
// tiene a mano) como produccion, por fuera del sync normal de Orders. Caso
// puntual y poco frecuente (2-3 veces/año, confirmado por Padrino 25-ago-2026):
// facturas que deben contarle a una directora pero que nunca pasaron por una
// Orden. Body: { docNums: number[] }.
//
// Cada factura se guarda como una fila mas de Sale, con el mismo filtro de
// "solo Seccion 1" que usa el resto del sistema, pero con sapOrderId prefijado
// "INV-<DocEntry>" (usando el DocEntry real que devuelve SAP -- ese sigue
// siendo el identificador interno unico, DocNum solo se usa para buscar) y
// isManualInvoice=true (para poder distinguirla en los historiales de ventas).
// Pegar el mismo DocNum de nuevo actualiza la misma fila en vez de duplicarla.
//
// Nota: DocNum se reinicia cada año fiscal en SAP B1 (a diferencia de DocEntry,
// que es unico siempre), asi que en teoria podria haber mas de una factura con
// el mismo DocNum en años distintos. Si el filtro devuelve mas de un resultado,
// se marca como error en vez de adivinar cual es.
router.post('/invoices/manual', async (req: Request, res: Response) => {
  const { docNums } = req.body as { docNums?: unknown };

  if (!Array.isArray(docNums) || docNums.length === 0) {
    res.status(400).json({ error: 'docNums (array de numeros) es requerido' });
    return;
  }
  const entries = docNums
    .map((d) => Number(d))
    .filter((d) => Number.isFinite(d) && d > 0);
  if (entries.length === 0) {
    res.status(400).json({ error: 'docNums no tiene numeros validos' });
    return;
  }

  logger.info(`ADMIN: agregando facturas manuales, DocNum=${entries.join(',')}`);

  const section1Codes = await fetchSection1ItemCodes();
  const agregadas: Array<{ docNum: number; sapOrderId: string; userId: string; userName: string; amount: number }> = [];
  const errores: Array<{ docNum: number; error: string }> = [];

  for (const docNum of entries) {
    try {
      const data = await sapGet<{ value: ManualInvoice[] }>('/Invoices', {
        $filter: `DocNum eq ${docNum}`,
        $select: 'DocEntry,DocNum,CardCode,DocDate,DocTotal,Cancelled,DocumentLines',
      });
      if (!data.value || data.value.length === 0) {
        errores.push({ docNum, error: 'No encontrada en SAP (/Invoices)' });
        continue;
      }
      if (data.value.length > 1) {
        errores.push({ docNum, error: `Hay ${data.value.length} facturas con ese DocNum (numeracion repetida entre años) -- pega el DocEntry en su lugar para este caso` });
        continue;
      }
      const invoice = data.value[0];

      const user = await prisma.user.findUnique({
        where: { sapUserId: invoice.CardCode },
        select: { sapUserId: true, name: true },
      });
      if (!user) {
        errores.push({ docNum, error: `CardCode ${invoice.CardCode} no existe como usuario en nuestra base` });
        continue;
      }

      const lines = invoice.DocumentLines ?? [];
      let amount: number;
      if (lines.length === 0) {
        amount = invoice.DocTotal; // sin lineas, fallback seguro igual que en el sync normal
      } else {
        const seccion1Lines = lines.filter((l) => section1Codes.has(l.ItemCode));
        const sumNeta = seccion1Lines.reduce((s, l) => s + (l.LineTotal ?? 0), 0);
        amount = sumNeta * ITBIS;
      }

      const status = invoice.Cancelled === 'tYES' ? 'cancelled' : 'completed';
      const sapOrderId = `INV-${invoice.DocEntry}`;

      await prisma.sale.upsert({
        where: { sapOrderId },
        create: {
          sapOrderId,
          userId: invoice.CardCode,
          amount,
          currency: 'DOP',
          saleDate: new Date(invoice.DocDate),
          status,
          sapDocNum: invoice.DocNum,
          sapDocEntry: String(invoice.DocEntry),
          isManualInvoice: true,
          syncedAt: new Date(),
        },
        update: {
          amount,
          status,
          saleDate: new Date(invoice.DocDate),
          isManualInvoice: true,
          syncedAt: new Date(),
        },
      });

      agregadas.push({
        docNum, sapOrderId, userId: invoice.CardCode, userName: user.name,
        amount: Math.round(amount * 100) / 100,
      });
    } catch (error) {
      errores.push({ docNum, error: error instanceof Error ? error.message : String(error) });
    }
  }

  res.json({ ok: true, agregadas, errores });
});

// GET /api/admin/invoices/manual — lista las facturas agregadas manualmente
router.get('/invoices/manual', async (_req: Request, res: Response) => {
  try {
    const sales = await prisma.sale.findMany({
      where: { isManualInvoice: true },
      orderBy: { saleDate: 'desc' },
      include: { user: { select: { name: true, sapUserId: true } } },
    });
    res.json(sales.map((s) => ({
      id: s.id,
      sapOrderId: s.sapOrderId,
      sapDocEntry: s.sapDocEntry,
      sapDocNum: s.sapDocNum,
      userId: s.userId,
      userName: s.user.name,
      amount: Number(s.amount),
      saleDate: s.saleDate,
      status: s.status,
      syncedAt: s.syncedAt,
    })));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// DELETE /api/admin/invoices/manual/:id — quita una factura agregada manualmente
// (por si se pego un DocEntry por error). Solo borra si isManualInvoice=true,
// para no poder borrar por accidente una venta real sincronizada del flujo normal.
router.delete('/invoices/manual/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const sale = await prisma.sale.findUnique({ where: { id } });
    if (!sale || !sale.isManualInvoice) {
      res.status(404).json({ error: 'No encontrada, o no es una factura agregada manualmente' });
      return;
    }
    await prisma.sale.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// GET /api/admin/users — todos los usuarios (para asignación)
router.get('/users', async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      sapUserId: true,
      name: true,
      role: true,
      unitName: true,
      supervisorId: true,
      supervisor: { select: { id: true, name: true } },
    },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  res.json(users);
});

// PATCH /api/admin/users/:id/supervisor — asignar directora a consultora
router.patch('/users/:id/supervisor', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { supervisorId } = req.body as { supervisorId: string | null };

  try {
    // Validar que el supervisor sea directora
    if (supervisorId) {
      const supervisor = await prisma.user.findUnique({ where: { id: supervisorId } });
      if (!supervisor || supervisor.role !== 'directora') {
        res.status(400).json({ error: 'El supervisor debe ser una directora' });
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { supervisorId },
    });

    res.json({ ok: true, supervisorId: updated.supervisorId });
  } catch (error) {
    res.status(500).json({ error: 'Error actualizando supervisora' });
  }
});


// GET /api/admin/diag/order/:docEntry — diagnóstico read-only: trae la orden
// directo de SAP + el Set de códigos Sección 1 vigente, y muestra línea por
// línea cuáles cuentan como producción y por qué. NO toca la lógica real de
// comisiones/produccion, solo la expone para depurar diferencias reportadas.
router.get('/diag/order/:docEntry', async (req: Request, res: Response) => {
  const docEntry = req.params.docEntry as string;
  try {
    const [section1Codes, orderData] = await Promise.all([
      fetchSection1ItemCodes(),
      sapGet<{ value: SapOrder[] }>('/Orders', {
        $filter: `DocEntry eq ${docEntry}`,
        $select: 'DocEntry,DocNum,CardCode,DocDate,DocTotal,DocumentStatus,Cancelled,DocumentLines',
      }),
    ]);

    const order = orderData.value?.[0];
    if (!order) {
      res.status(404).json({ error: `Orden DocEntry=${docEntry} no encontrada en SAP` });
      return;
    }

    const lines = order.DocumentLines ?? [];
    const lineDetail = lines.map(l => ({
      ItemCode: l.ItemCode,
      LineTotal: l.LineTotal,
      esSeccion1: section1Codes.has(l.ItemCode),
    }));
    const sumTodasLineas = lines.reduce((s, l) => s + (l.LineTotal ?? 0), 0);
    const sumSeccion1 = lineDetail.filter(l => l.esSeccion1).reduce((s, l) => s + (l.LineTotal ?? 0), 0);

    res.json({
      section1CodesCount: section1Codes.size,
      order: { DocEntry: order.DocEntry, DocNum: order.DocNum, CardCode: order.CardCode, DocTotal: order.DocTotal },
      lineas: lineDetail,
      sumTodasLineasNeta: Math.round(sumTodasLineas * 100) / 100,
      sumSeccion1Neta: Math.round(sumSeccion1 * 100) / 100,
      amountCalculado: Math.round(sumSeccion1 * 1.18 * 100) / 100,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// GET /api/admin/diag/user/:sapUserId — diagnóstico read-only: compara el
// usuario tal como está en NUESTRA base (existe? role? cuándo se sincronizó)
// contra sus ventas locales, y contra las órdenes que SAP tiene registradas
// para ese CardCode en los últimos 6 meses. Sirve para depurar casos donde
// alguien reporta una compra que "no aparece" pese a correr sync completo.
router.get('/diag/user/:sapUserId', async (req: Request, res: Response) => {
  const sapUserId = req.params.sapUserId as string;
  try {
    const [user, sales, sapOrdersData, lastSyncLogs] = await Promise.all([
      prisma.user.findUnique({
        where: { sapUserId },
        select: { id: true, sapUserId: true, name: true, role: true, supervisorId: true, createdAt: true, lastSapSync: true },
      }),
      prisma.sale.findMany({
        where: { userId: sapUserId },
        orderBy: { saleDate: 'desc' },
        select: { sapOrderId: true, amount: true, saleDate: true, status: true, syncedAt: true },
      }),
      sapGet<{ value: SapOrder[] }>('/Orders', {
        $filter: `CardCode eq '${sapUserId}'`,
        $select: 'DocEntry,DocNum,CardCode,DocDate,DocTotal,DocumentStatus,Cancelled',
        $orderby: 'DocDate desc',
      }),
      prisma.syncLog.findMany({ where: { syncType: { in: ['sales', 'users'] } }, orderBy: { startedAt: 'desc' }, take: 6 }),
    ]);

    const sapOrders = sapOrdersData.value ?? [];
    const localDocEntries = new Set(sales.map(s => s.sapOrderId));
    const faltantes = sapOrders.filter(o => !localDocEntries.has(String(o.DocEntry)));

    res.json({
      usuarioEnNuestraBase: user,
      ventasLocales: sales,
      ordenesEnSAP: sapOrders,
      ordenesQueFaltanSincronizar: faltantes,
      ultimosSyncLogs: lastSyncLogs,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// GET /api/admin/diag/red/:sapUserId — diagnóstico read-only: arma el árbol de
// reclutas (inciadoraId) de una persona hasta 4 niveles de profundidad, con la
// producción individual de cada quien en el período indicado (o el de su DIQ
// activa si no se pasan fechas). Sirve para comparar contra reportes oficiales
// de SAP tipo "Calificacion DIQ" y ver hasta que nivel llega la diferencia.
router.get('/diag/red/:sapUserId', async (req: Request, res: Response) => {
  const sapUserId = req.params.sapUserId as string;
  try {
    const user = await prisma.user.findUnique({ where: { sapUserId }, select: { id: true, sapUserId: true, name: true } });
    if (!user) { res.status(404).json({ error: `Usuario ${sapUserId} no encontrado en nuestra base` }); return; }

    let gte: Date, lt: Date;
    if (req.query.startDate && req.query.endDate) {
      gte = new Date(req.query.startDate as string);
      lt  = new Date(req.query.endDate as string);
    } else {
      const diq = await prisma.dIQ.findUnique({ where: { userId: user.id }, select: { startDate: true, endDate: true } });
      if (!diq) { res.status(400).json({ error: 'No tiene DIQ activa -- pasa ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD' }); return; }
      gte = diq.startDate;
      lt  = diq.endDate;
    }

    // Nivel 1, 2, 3 y 4 -- por si el reporte de SAP llega mas profundo de lo esperado
    const nivel1 = await prisma.user.findMany({ where: { inciadoraId: user.id }, select: { id: true, sapUserId: true, name: true } });
    const nivel2 = nivel1.length ? await prisma.user.findMany({ where: { inciadoraId: { in: nivel1.map(n => n.id) } }, select: { id: true, sapUserId: true, name: true } }) : [];
    const nivel3 = nivel2.length ? await prisma.user.findMany({ where: { inciadoraId: { in: nivel2.map(n => n.id) } }, select: { id: true, sapUserId: true, name: true } }) : [];
    const nivel4 = nivel3.length ? await prisma.user.findMany({ where: { inciadoraId: { in: nivel3.map(n => n.id) } }, select: { id: true, sapUserId: true, name: true } }) : [];

    const todos = [
      { ...user, nivel: 0 },
      ...nivel1.map(n => ({ ...n, nivel: 1 })),
      ...nivel2.map(n => ({ ...n, nivel: 2 })),
      ...nivel3.map(n => ({ ...n, nivel: 3 })),
      ...nivel4.map(n => ({ ...n, nivel: 4 })),
    ];

    const produccion = await prisma.sale.groupBy({
      by: ['userId'],
      where: { userId: { in: todos.map(t => t.sapUserId) }, saleDate: { gte, lte: lt }, status: { not: 'cancelled' } },
      _sum: { amount: true },
    });
    const prodMap = new Map(produccion.map(p => [p.userId, Number(p._sum.amount ?? 0)]));

    const detalle = todos.map(t => ({
      nivel: t.nivel,
      sapUserId: t.sapUserId,
      name: t.name,
      produccion: prodMap.get(t.sapUserId) ?? 0,
    }));

    res.json({
      periodo: { gte, lt },
      totalPersonas: detalle.length,
      totalProduccion: detalle.reduce((s, d) => s + d.produccion, 0),
      porNivel: {
        nivel1: nivel1.length, nivel2: nivel2.length, nivel3: nivel3.length, nivel4: nivel4.length,
      },
      detalle: detalle.sort((a, b) => a.nivel - b.nivel || b.produccion - a.produccion),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// Patrón de CardCode temporal que SAP/WordPress asigna al momento del
// registro, antes de aprobar y convertir al CardCode definitivo (ej. "C01318").
// Confirmado 11-ago-2026 con casos reales: "CA-202607222334", "CA-202608122455".
const TEMP_CARDCODE_PATTERN = /^CA-\d{10,}$/;

// GET /api/admin/cleanup/temp-registrations — dry-run: lista usuarios cuyo
// sapUserId matchea el patrón de CardCode temporal (registro sin aprobar que
// quedó huérfano porque SAP ya lo reemplazó por el CardCode definitivo). No
// borra nada -- solo muestra qué se borraría y si tiene datos dependientes
// (ventas, metas, notas de crédito, subordinadas, reclutas, DIQ) que lo
// harían inseguro de borrar.
router.get('/cleanup/temp-registrations', async (_req: Request, res: Response) => {
  try {
    const all = await prisma.user.findMany({
      select: { id: true, sapUserId: true, name: true, role: true, createdAt: true },
    });
    const candidatos = all.filter(u => TEMP_CARDCODE_PATTERN.test(u.sapUserId));

    const detalle = await Promise.all(candidatos.map(async u => {
      const [sales, targets, creditNotes, subordinates, reclutas, diqAsCandidate, diqsRegistered] = await Promise.all([
        prisma.sale.count({ where: { userId: u.sapUserId } }),
        prisma.target.count({ where: { userId: u.sapUserId } }),
        prisma.creditNote.count({ where: { userId: u.sapUserId } }),
        prisma.user.count({ where: { supervisorId: u.id } }),
        prisma.user.count({ where: { inciadoraId: u.id } }),
        prisma.dIQ.count({ where: { userId: u.id } }),
        prisma.dIQ.count({ where: { registeredById: u.id } }),
      ]);
      const dependientes = sales + targets + creditNotes + subordinates + reclutas + diqAsCandidate + diqsRegistered;
      return {
        id: u.id, sapUserId: u.sapUserId, name: u.name, role: u.role, createdAt: u.createdAt,
        dependientes: { sales, targets, creditNotes, subordinates, reclutas, diqAsCandidate, diqsRegistered },
        seguroBorrar: dependientes === 0,
      };
    }));

    res.json({
      total: detalle.length,
      seguros: detalle.filter(d => d.seguroBorrar).length,
      conDependientes: detalle.filter(d => !d.seguroBorrar).length,
      registros: detalle,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// POST /api/admin/cleanup/temp-registrations — borra los registros temporales
// que dieron "seguroBorrar: true" en el GET de arriba (sin dependientes). Los
// que tienen dependientes se saltan y se reportan, no se tocan.
router.post('/cleanup/temp-registrations', async (_req: Request, res: Response) => {
  try {
    const all = await prisma.user.findMany({
      select: { id: true, sapUserId: true, name: true },
    });
    const candidatos = all.filter(u => TEMP_CARDCODE_PATTERN.test(u.sapUserId));

    const borrados: { sapUserId: string; name: string }[] = [];
    const saltados: { sapUserId: string; name: string; razon: string }[] = [];

    for (const u of candidatos) {
      const [sales, targets, creditNotes, subordinates, reclutas, diqAsCandidate, diqsRegistered] = await Promise.all([
        prisma.sale.count({ where: { userId: u.sapUserId } }),
        prisma.target.count({ where: { userId: u.sapUserId } }),
        prisma.creditNote.count({ where: { userId: u.sapUserId } }),
        prisma.user.count({ where: { supervisorId: u.id } }),
        prisma.user.count({ where: { inciadoraId: u.id } }),
        prisma.dIQ.count({ where: { userId: u.id } }),
        prisma.dIQ.count({ where: { registeredById: u.id } }),
      ]);
      const dependientes = sales + targets + creditNotes + subordinates + reclutas + diqAsCandidate + diqsRegistered;

      if (dependientes > 0) {
        saltados.push({ sapUserId: u.sapUserId, name: u.name, razon: `tiene ${dependientes} registro(s) dependiente(s)` });
        continue;
      }

      try {
        await prisma.user.delete({ where: { id: u.id } });
        borrados.push({ sapUserId: u.sapUserId, name: u.name });
      } catch (e) {
        saltados.push({ sapUserId: u.sapUserId, name: u.name, razon: 'error al borrar (posible FK no contemplada)' });
      }
    }

    logger.info(`ADMIN cleanup: ${borrados.length} registros temporales borrados, ${saltados.length} saltados`);
    res.json({ borrados: borrados.length, saltados: saltados.length, detalle: { borrados, saltados } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// POST /api/admin/sync/credit-notes — sync notas de crédito manual
router.post('/sync/credit-notes', async (_req: Request, res: Response) => {
  try {
    const result = await syncCreditNotes(true);
    res.json({ ok: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

export default router;
