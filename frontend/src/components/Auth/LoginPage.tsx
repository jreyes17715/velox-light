import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useAuth } from '../../hooks/useAuth';

export function LoginPage() {
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const { validateToken } = useAuth();

  useEffect(() => {
    // Capturar token desde URL (callback de Mary Kay DO)
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');

    if (urlToken) {
      // Limpiar token de la URL
      window.history.replaceState({}, '', '/login');
      validateToken(urlToken).then((ok) => {
        if (ok) navigate('/dashboard');
      });
      return;
    }

    // Si ya hay token guardado, ir directo al dashboard
    if (token) {
      navigate('/dashboard');
    }
  }, []);

  const handleLogin = () => {
    const redirectUrl = `${window.location.origin}/login`;
    window.location.href = `https://marykay.do/login?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  // Para desarrollo: simular login con un token de prueba
  const handleDevLogin = () => {
    const testSapUserId = 'A00247'; // María López (directora)
    // Crear un JWT de prueba — en producción esto viene de marykay.do
    const devToken = prompt('Pega aquí el JWT token para probar:');
    if (devToken) {
      validateToken(devToken).then((ok) => {
        if (ok) navigate('/dashboard');
        else alert('Token inválido. Verifica el JWT.');
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-pink-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-pink-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-3xl font-bold">MK</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Mary Kay Comisiones</h1>
          <p className="text-gray-500 mt-1">República Dominicana</p>
        </div>

        {/* Login Button */}
        <button
          onClick={handleLogin}
          className="w-full bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200 mb-4"
        >
          Entrar con Mary Kay DO
        </button>

        {/* Dev mode helper */}
        {import.meta.env.DEV && (
          <button
            onClick={handleDevLogin}
            className="w-full border border-gray-300 hover:bg-gray-50 text-gray-600 font-medium py-2 px-6 rounded-xl transition-colors duration-200 text-sm"
          >
            🛠️ Login con token manual (dev)
          </button>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          Acceso exclusivo para Directoras y Consultoras Mary Kay RD
        </p>
      </div>
    </div>
  );
}
