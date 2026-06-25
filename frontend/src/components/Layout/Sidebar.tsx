import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import api from '../../utils/api';

const navItems = [
  { to: '/dashboard', label: 'Dashboard General', icon: '⊞' },
  { to: '/sales', label: 'Ventas y Producción', icon: '📈' },
  { to: '/consultoras', label: 'Consultoras', icon: '👥' },
  { to: '/metas', label: 'Metas', icon: '🎯' },
  { to: '/comisiones', label: 'Comisiones', icon: '💰' },
  { to: '/admin', label: 'Administración', icon: '⚙️' },
];

export function Sidebar() {
  const { user, logout, setUser } = useAuthStore();
  const navigate = useNavigate();
  const [editingUnit, setEditingUnit] = useState(false);
  const [unitInput, setUnitInput] = useState('');
  const [saving, setSaving] = useState(false);

  const handleEditUnit = () => {
    setUnitInput(user?.unitName || '');
    setEditingUnit(true);
  };

  const handleSaveUnit = async () => {
    if (!unitInput.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.patch<{ unitName: string }>('/auth/unit-name', { unitName: unitInput });
      if (user) setUser({ ...user, unitName: data.unitName });
      setEditingUnit(false);
    } catch {
      alert('Error guardando el nombre');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="w-60 bg-gray-900 flex flex-col min-h-screen flex-shrink-0">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-pink-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">MK</span>
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">MARY KAY</p>
            <p className="text-gray-400 text-xs">Comisiones RD</p>
          </div>
        </div>
      </div>

      {/* User info */}
      {user && (
        <div className="px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-pink-500 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">
                {user.name.charAt(0)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-medium truncate">Hola, {user.name.split(' ')[0]}</p>
              <p className="text-pink-400 text-xs capitalize">{user.role}</p>
              {user.role === 'directora' && (
                editingUnit ? (
                  <div className="mt-1 flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      className="bg-gray-800 text-white text-xs rounded px-1.5 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-pink-400"
                      value={unitInput}
                      onChange={(e) => setUnitInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveUnit(); if (e.key === 'Escape') setEditingUnit(false); }}
                      autoFocus
                    />
                    <button onClick={handleSaveUnit} disabled={saving} className="text-pink-400 hover:text-pink-300 text-xs font-bold">✓</button>
                    <button onClick={() => setEditingUnit(false)} className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
                  </div>
                ) : (
                  <button onClick={handleEditUnit} className="text-left mt-0.5 group flex items-center gap-1">
                    <p className="text-gray-400 text-xs truncate">✨ {user.unitName || 'Sin nombre de grupo'}</p>
                    <span className="text-gray-600 text-xs opacity-0 group-hover:opacity-100 transition-opacity">✏️</span>
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-pink-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}

        {/* Super Admin link — solo visible para isSuperAdmin */}
        {user?.isSuperAdmin && (
          <>
            <div className="border-t border-gray-700 my-2" />
            <NavLink
              to="/superadmin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-yellow-500 text-white'
                    : 'text-yellow-400 hover:bg-gray-800 hover:text-yellow-300'
                }`
              }
            >
              <span className="text-base">👑</span>
              Super Admin
            </NavLink>
          </>
        )}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-gray-700">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-red-400 transition-colors w-full"
        >
          <span>🚪</span>
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
