import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './components/Auth/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { SalesPage } from './pages/SalesPage';
import { ConsultorasPage } from './pages/ConsultorasPage';
import { MetasPage } from './pages/MetasPage';
import { AdminPage } from './pages/AdminPage';
import ComisionesPage from './pages/ComisionesPage';
import SuperAdminPage from './pages/SuperAdminPage';
import PerfilPage from './pages/PerfilPage';
import DIQPage from './pages/DIQPage';
import LlaveRosaPage from './pages/LlaveRosaPage';
import { useAuthStore } from './store/authStore';
import { useAuth } from './hooks/useAuth';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Restaura el usuario desde el token al recargar la pagina
function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-400">
          <i className="fa-solid fa-spinner fa-spin text-3xl" />
          <p className="mt-3 text-sm">Cargando sesion...</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <AuthInitializer>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/sales" element={<ProtectedRoute><SalesPage /></ProtectedRoute>} />
          <Route path="/consultoras" element={<ProtectedRoute><ConsultorasPage /></ProtectedRoute>} />
          <Route path="/metas" element={<ProtectedRoute><MetasPage /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
          <Route path="/comisiones" element={<ProtectedRoute><ComisionesPage /></ProtectedRoute>} />
          <Route path="/superadmin/:tab?" element={<ProtectedRoute><SuperAdminPage /></ProtectedRoute>} />
          <Route path="/perfil" element={<ProtectedRoute><PerfilPage /></ProtectedRoute>} />
          <Route path="/perfil/:userId" element={<ProtectedRoute><PerfilPage /></ProtectedRoute>} />
          <Route path="/diq" element={<ProtectedRoute><DIQPage /></ProtectedRoute>} />
          <Route path="/llave-rosa" element={<ProtectedRoute><LlaveRosaPage /></ProtectedRoute>} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthInitializer>
    </BrowserRouter>
  );
}

export default App;
