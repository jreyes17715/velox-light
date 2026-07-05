import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useAuth } from '../../hooks/useAuth';
import api from '../../utils/api';

export function LoginPage() {
  const navigate   = useNavigate();
  const { token }  = useAuthStore();
  const { validateToken } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    // Capturar token desde URL (fallback)
    const params   = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      window.history.replaceState({}, '', '/login');
      validateToken(urlToken).then(ok => { if (ok) navigate('/dashboard'); });
      return;
    }
    if (token) navigate('/dashboard');
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Ingresa tu usuario y contraseña');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 1. Obtener token via proxy del backend (evita CORS)
      const { data } = await api.post<{ token: string }>(
        '/auth/login',
        { username, password }
      );

      const wpToken = data.token;
      if (!wpToken) throw new Error('No se recibió token');

      // 2. Validar token en nuestro backend
      const ok = await validateToken(wpToken);
      if (ok) {
        // Leer el usuario recién seteado para redirigir según rol
        const { user: loggedUser } = useAuthStore.getState();
        navigate(loggedUser?.isSuperAdmin ? '/superadmin' : '/dashboard');
      } else {
        setError('Usuario no encontrado en el sistema. Contacta al administrador.');
      }
    } catch (err: any) {
      if (err.response?.data?.error) {
        // Error del backend propio
        setError(err.response.data.error);
      } else if (err.response?.data?.message) {
        // Mensaje de WordPress traducido
        const msg = err.response.data.message as string;
        if (msg.includes('password') || msg.includes('incorrect')) {
          setError('Contrasena incorrecta.');
        } else if (msg.includes('username') || msg.includes('user')) {
          setError('Usuario no encontrado.');
        } else {
          setError('Credenciales invalidas.');
        }
      } else if (!err.response) {
        setError('No se puede conectar al servidor. Verifica que el backend este corriendo en puerto 3000.');
      } else {
        setError(`Error ${err.response?.status ?? ''}: Intenta de nuevo.`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-pink-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-pink-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-3xl font-bold">MK</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Mary Kay</h1>
          <p className="text-gray-500 mt-1">Producción de Consultoras · República Dominicana</p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Tu usuario de Mary Kay"
              autoComplete="username"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Acceso exclusivo para Directoras y Consultoras Mary Kay RD
        </p>
      </div>
    </div>
  );
}
