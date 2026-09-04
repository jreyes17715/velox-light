import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout/Layout';
import { LoadingSpinner } from '../components/Common/LoadingSpinner';
import { ErrorAlert } from '../components/Common/ErrorAlert';
import api from '../utils/api';

// "Asignar Consultoras a Directoras" oculto a pedido de Padrino (25-ago-2026)
// -- no se va a usar y GET /admin/users trae casi 1000 registros sin paginar,
// haciendo esta pagina lenta. Se deja todo el codigo comentado (interface,
// fetch, estado, handler y el bloque JSX) para poder reactivarlo facil si
// hace falta -- no se borro nada, solo se dejo de llamar/renderizar.
// interface AdminUser {
//   id: string;
//   sapUserId: string;
//   name: string;
//   role: string;
//   unitName: string | null;
//   supervisorId: string | null;
//   supervisor: { id: string; name: string } | null;
// }

interface SyncLog {
  id: string;
  syncType: string;
  status: string;
  recordsProcessed: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

// Facturas agregadas manualmente por DocNum (caso raro, 2-3 veces/año) --
// ver POST /api/admin/invoices/manual en el backend. Cambiado de DocEntry a
// DocNum el 03-sep-2026 a pedido de Padrino (es el numero que tiene a mano).
interface ManualInvoiceRow {
  id: string;
  sapOrderId: string;
  sapDocEntry: string;
  sapDocNum: number | null;
  userId: string;
  userName: string;
  amount: number;
  saleDate: string;
  status: string;
}
interface ManualInvoiceResult {
  ok: boolean;
  agregadas: { docNum: number; sapOrderId: string; userId: string; userName: string; amount: number }[];
  errores: { docNum: number; error: string }[];
}

export function AdminPage() {
  // const [users, setUsers] = useState<AdminUser[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // const directoras = users.filter((u) => u.role === 'directora');
  // const consultoras = users.filter((u) => u.role === 'consultora');

  const [manualInvoices, setManualInvoices] = useState<ManualInvoiceRow[]>([]);
  const [docNumsInput, setDocNumsInput] = useState('');
  const [addingManual, setAddingManual] = useState(false);
  const [manualResult, setManualResult] = useState<ManualInvoiceResult | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // GET /admin/users ya no se llama aqui -- ver comentario junto a
      // AdminUser mas arriba. Si se reactiva la asignacion, volver a incluir
      // ese fetch en el Promise.all.
      const [logsRes, manualRes] = await Promise.all([
        api.get<SyncLog[]>('/admin/sync/logs'),
        api.get<ManualInvoiceRow[]>('/admin/invoices/manual'),
      ]);
      setLogs(logsRes.data);
      setManualInvoices(manualRes.data);
    } catch {
      setError('Error cargando datos de admin.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddManualInvoices = async () => {
    const docNums = docNumsInput
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);

    if (docNums.length === 0) {
      setError('Pega al menos un DocNum valido.');
      return;
    }

    setAddingManual(true);
    setError(null);
    setManualResult(null);
    try {
      const { data } = await api.post<ManualInvoiceResult>('/admin/invoices/manual', { docNums });
      setManualResult(data);
      setDocNumsInput('');
      const manualRes = await api.get<ManualInvoiceRow[]>('/admin/invoices/manual');
      setManualInvoices(manualRes.data);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Error agregando facturas';
      setError(`Error: ${msg}`);
    } finally {
      setAddingManual(false);
    }
  };

  const handleRemoveManualInvoice = async (id: string) => {
    try {
      await api.delete(`/admin/invoices/manual/${id}`);
      setManualInvoices((prev) => prev.filter((m) => m.id !== id));
    } catch {
      setError('Error quitando la factura.');
    }
  };

  const handleSync = async (type: 'full' | 'users' | 'sales' | 'credit-notes') => {
    setSyncing(true);
    setSyncMessage(null);
    setError(null);
    try {
      const { data } = await api.post(`/admin/sync/${type}`);
      setSyncMessage(`✅ Sync completado: ${JSON.stringify(data)}`);
      fetchData();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Error en sync';
      setError(`Error: ${msg}`);
    } finally {
      setSyncing(false);
    }
  };

  // const handleAssignSupervisor = async (consultaId: string, supervisorId: string) => {
  //   try {
  //     await api.patch(`/admin/users/${consultaId}/supervisor`, {
  //       supervisorId: supervisorId || null,
  //     });
  //     setUsers((prev) =>
  //       prev.map((u) => {
  //         if (u.id !== consultaId) return u;
  //         const sup = directoras.find((d) => d.id === supervisorId) || null;
  //         return { ...u, supervisorId: supervisorId || null, supervisor: sup };
  //       })
  //     );
  //   } catch {
  //     setError('Error asignando supervisora');
  //   }
  // };

  const statusColor = (s: string) => {
    if (s === 'success') return 'text-green-600 bg-green-50';
    if (s === 'error') return 'text-red-600 bg-red-50';
    return 'text-yellow-600 bg-yellow-50';
  };

  if (isLoading) return <LoadingSpinner message="Cargando admin..." />;

  return (
    <Layout>
      <div className="flex flex-col min-h-screen">
        <div className="bg-white border-b border-gray-200 px-6 py-3">
          <h2 className="text-lg font-bold text-gray-800">Administración</h2>
          <p className="text-xs text-gray-500">Sync SAP</p>
        </div>

        <div className="flex-1 p-6 space-y-5 max-w-5xl mx-auto w-full">
          {error && <ErrorAlert message={error} />}
          {syncMessage && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              {syncMessage}
            </div>
          )}

          {/* Sync SAP */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-800 mb-3">Sincronización SAP</h3>
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => handleSync('full')}
                disabled={syncing}
                className="bg-pink-600 hover:bg-pink-700 text-white font-medium px-4 py-2 rounded-lg text-sm disabled:opacity-50 transition-colors"
              >
                {syncing ? '⏳ Sincronizando...' : '🔄 Sync Completo'}
              </button>
              <button
                onClick={() => handleSync('users')}
                disabled={syncing}
                className="border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-lg text-sm disabled:opacity-50 transition-colors"
              >
                👥 Solo Usuarios
              </button>
              <button
                onClick={() => handleSync('sales')}
                disabled={syncing}
                className="border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-lg text-sm disabled:opacity-50 transition-colors"
              >
                💰 Solo Compras
              </button>
              <button
                onClick={() => handleSync('credit-notes')}
                disabled={syncing}
                className="border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-lg text-sm disabled:opacity-50 transition-colors"
              >
                <i className="fa-solid fa-file-circle-minus mr-1.5 text-red-500" />Notas de Credito
              </button>
            </div>

            {/* Logs */}
            {logs.length > 0 && (
              <div className="mt-4 space-y-1.5">
                <p className="text-xs text-gray-500 font-medium uppercase">Últimos sync</p>
                {logs.slice(0, 5).map((log) => (
                  <div key={log.id} className="flex items-center gap-3 text-xs text-gray-600">
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${statusColor(log.status)}`}>
                      {log.status}
                    </span>
                    <span className="capitalize">{log.syncType}</span>
                    <span>{log.recordsProcessed} registros</span>
                    <span className="text-gray-400">{new Date(log.startedAt).toLocaleString('es-DO')}</span>
                    {log.errorMessage && <span className="text-red-500 truncate max-w-xs">{log.errorMessage}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Facturas manuales -- caso raro (2-3 veces/año) donde una Factura
              especifica debe contarle a una directora aunque nunca paso por una
              Orden. Ver POST /api/admin/invoices/manual. */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-gray-800">Agregar Facturas Manualmente</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Pega los DocNum de las facturas (OINV) que deben contar como producción, separados por coma o uno por línea.
              </p>
            </div>

            <textarea
              value={docNumsInput}
              onChange={(e) => setDocNumsInput(e.target.value)}
              placeholder="Ej: 3671, 3672, 3680"
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pink-300"
            />

            <button
              onClick={handleAddManualInvoices}
              disabled={addingManual || !docNumsInput.trim()}
              className="bg-pink-600 hover:bg-pink-700 text-white font-medium px-4 py-2 rounded-lg text-sm disabled:opacity-50 transition-colors"
            >
              {addingManual ? '⏳ Agregando...' : '➕ Agregar facturas'}
            </button>

            {manualResult && (
              <div className="space-y-2 text-sm">
                {manualResult.agregadas.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-green-700 font-medium mb-1">{manualResult.agregadas.length} agregada(s):</p>
                    <ul className="text-xs text-green-700 space-y-0.5">
                      {manualResult.agregadas.map((a) => (
                        <li key={a.docNum}>
                          DocNum {a.docNum} — {a.userName} ({a.userId}) — RD${a.amount.toLocaleString('es-DO')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {manualResult.errores.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-red-700 font-medium mb-1">{manualResult.errores.length} con error:</p>
                    <ul className="text-xs text-red-700 space-y-0.5">
                      {manualResult.errores.map((e) => (
                        <li key={e.docNum}>DocNum {e.docNum} — {e.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {manualInvoices.length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 font-medium uppercase mb-2">
                  Facturas agregadas manualmente ({manualInvoices.length})
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 uppercase">
                        <th className="py-1.5 pr-3">DocNum</th>
                        <th className="py-1.5 pr-3">Consultora</th>
                        <th className="py-1.5 pr-3">Fecha</th>
                        <th className="py-1.5 pr-3 text-right">Monto</th>
                        <th className="py-1.5 pr-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {manualInvoices.map((m) => (
                        <tr key={m.id}>
                          <td className="py-1.5 pr-3 font-mono text-xs text-gray-600">{m.sapDocNum ?? m.sapDocEntry}</td>
                          <td className="py-1.5 pr-3 text-gray-800">{m.userName} <span className="text-gray-400 text-xs">({m.userId})</span></td>
                          <td className="py-1.5 pr-3 text-gray-500 text-xs">{new Date(m.saleDate).toLocaleDateString('es-DO')}</td>
                          <td className="py-1.5 pr-3 text-right font-medium text-gray-800">RD${m.amount.toLocaleString('es-DO')}</td>
                          <td className="py-1.5 pr-3 text-right">
                            <button
                              onClick={() => handleRemoveManualInvoice(m.id)}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              Quitar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Asignacion de supervisoras -- oculta a pedido de Padrino (25-ago-2026),
              no se va a usar y la carga de /admin/users (casi 1000 registros sin
              paginar) hacia esta pagina lenta. Bloque completo comentado, no
              borrado -- ver comentario junto a AdminUser mas arriba para reactivar. */}
          {/*
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Asignar Consultoras a Directoras</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {consultoras.length} consultoras · {directoras.length} directoras
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide border-b border-gray-100">
                    <th className="text-left px-5 py-3">Consultora</th>
                    <th className="text-left px-5 py-3">SAP ID</th>
                    <th className="text-left px-5 py-3">Directora asignada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {consultoras.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-800">{c.name}</td>
                      <td className="px-5 py-3 font-mono text-gray-500 text-xs">{c.sapUserId}</td>
                      <td className="px-5 py-3">
                        <select
                          value={c.supervisorId || ''}
                          onChange={(e) => handleAssignSupervisor(c.id, e.target.value)}
                          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-pink-300 w-full max-w-xs"
                        >
                          <option value="">— Sin asignar —</option>
                          {directoras.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}{d.unitName ? ` (${d.unitName})` : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          */}
        </div>
      </div>
    </Layout>
  );
}
