import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuthStore } from '../store/authStore';
import { User } from '../types';

export function useAuth() {
  const { user, token, setUser, setToken, logout } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const validateToken = async (tkn: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await api.post<User>('/auth/me', {}, {
        headers: { Authorization: `Bearer ${tkn}` },
      });
      setUser(data);
      setToken(tkn);
      return true;
    } catch {
      setError('Token inválido o expirado');
      logout();
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token && !user) {
      validateToken(token).then((ok) => {
        if (!ok) navigate('/login');
      });
    }
  }, []);

  return { user, token, isLoading, error, validateToken, logout };
}
