import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import api from '../../utils/api';
import { StatusBadge } from '../Common/StatusBadge';

const ALL_NAV_ITEMS: { to: string; label: string; icon: string; roles: string[] }[] = [
  { to: '/dashboard',        label: 'Dashboard General',   icon: 'grid',    roles: ['directora', 'consultora', 'diq', 'iniciadora', 'superadmin'] },
  // "Ventas y Produccion" (reporte global) se movio a solo superadmin -- para
  // el resto de roles el historial de ventas propio ahora vive dentro de "Mi
  // Perfil" (pestaña nueva). Ver PerfilPage.tsx. Confirmado 12-ago-2026.
  { to: '/sales',            label: 'Ventas y Produccion', icon: 'chart',   roles: ['superadmin'] },
  { to: '/consultoras',      label: 'Consultoras',          icon: 'group',   roles: ['directora', 'diq', 'iniciadora'] },
  // Mismo destino/funcion que antes (celulas de reclutas), solo se le cambio
  // el nombre a "Ventas y Produccion" a pedido de Padrino (12-ago-2026).
  { to: '/mis-iniciadoras',  label: 'Ventas y Produccion',  icon: 'star',    roles: ['directora', 'diq'] },
  // Comisiones oculta de nuevo a pedido de Padrino (25-ago-2026) -- la ruta y
  // pagina siguen existiendo, solo se quita del menu.
  // { to: '/comisiones',    label: 'Comisiones',           icon: 'money',   roles: ['directora', 'consultora', 'diq', 'iniciadora'] },
  { to: '/llave-rosa',       label: 'Llave Rosa',           icon: 'car',     roles: ['directora', 'superadmin'] },
  { to: '/metas',            label: 'Metas',                icon: 'target',  roles: ['directora', 'diq', 'iniciadora'] },
  { to: '/superadmin/metas', label: 'Metas',                icon: 'target',  roles: ['superadmin'] },
  { to: '/perfil',           label: 'Mi Perfil',            icon: 'user',    roles: ['directora', 'consultora', 'diq', 'iniciadora'] },
  { to: '/admin',            label: 'Administracion',       icon: 'settings',roles: ['superadmin'] },
];

// Iconos Font Awesome 6 Free -- fa-regular = contorno, fa-solid donde no hay regular gratis
const FA_ICONS: Record<string, string> = {
  grid:     'fa-solid fa-table-cells-large',
  chart:    'fa-solid fa-chart-line',
  group:    'fa-solid fa-users',
  target:   'fa-solid fa-bullseye',
  star:     'fa-regular fa-star',
  user:     'fa-regular fa-circle-user',
  settings: 'fa-solid fa-gear',
  crown:    'fa-solid fa-crown',
  car:      'fa-solid fa-car-side',
  money:    'fa-solid fa-sack-dollar',
  logout:   'fa-solid fa-right-from-bracket',
};

const Icon = ({ name }: { name: string }) => (
  <i className={`${FA_ICONS[name] ?? 'fa-solid fa-circle'} fa-fw text-[1rem]`} aria-hidden="true" />
);

// Tema de colores por rol
type Theme = {
  aside: string;
  logoBg: string;
  logoText: string;
  activeNav: string;
  inactiveNav: string;
  userText: string;
  userSubtext: string;
  roleColor: string;
  border: string;
  superLink: string;
  superLinkActive: string;
  logoutHover: string;
};

function getTheme(role: string, isSuperAdmin: boolean): Theme {
  if (isSuperAdmin) return {
    aside:          'bg-gray-950',
    logoBg:         'bg-blue-600',
    logoText:       'text-white',
    activeNav:      'bg-blue-600 text-white',
    inactiveNav:    'text-gray-400 hover:bg-gray-800 hover:text-white',
    userText:       'text-white',
    userSubtext:    'text-gray-400',
    roleColor:      'text-blue-400',
    border:         'border-gray-800',
    superLink:      'text-yellow-400 hover:bg-gray-800 hover:text-yellow-300',
    superLinkActive:'bg-yellow-500 text-white',
    logoutHover:    'text-gray-400 hover:bg-gray-800 hover:text-red-400',
  };
  if (role === 'directora') return {
    aside:          'bg-sky-800',
    logoBg:         'bg-white/20',
    logoText:       'text-white',
    activeNav:      'bg-white/20 text-white',
    inactiveNav:    'text-sky-100 hover:bg-white/10 hover:text-white',
    userText:       'text-white',
    userSubtext:    'text-sky-200',
    roleColor:      'text-sky-200',
    border:         'border-sky-700',
    superLink:      '',
    superLinkActive:'',
    logoutHover:    'text-sky-200 hover:bg-white/10 hover:text-red-300',
  };
  if (role === 'diq') return {
    aside:          'bg-amber-600',
    logoBg:         'bg-white/20',
    logoText:       'text-white',
    activeNav:      'bg-white/20 text-white',
    inactiveNav:    'text-amber-100 hover:bg-black/10 hover:text-white',
    userText:       'text-white',
    userSubtext:    'text-amber-100',
    roleColor:      'text-amber-100',
    border:         'border-amber-500',
    superLink:      '',
    superLinkActive:'',
    logoutHover:    'text-amber-100 hover:bg-black/10 hover:text-red-200',
  };
  if (role === 'iniciadora') return {
    aside:          'bg-purple-800',
    logoBg:         'bg-white/20',
    logoText:       'text-white',
    activeNav:      'bg-white/20 text-white',
    inactiveNav:    'text-purple-200 hover:bg-white/10 hover:text-white',
    userText:       'text-white',
    userSubtext:    'text-purple-200',
    roleColor:      'text-purple-200',
    border:         'border-purple-700',
    superLink:      '',
    superLinkActive:'',
    logoutHover:    'text-purple-200 hover:bg-white/10 hover:text-red-300',
  };
  // consultora (default)
  return {
    aside:          'bg-teal-700',
    logoBg:         'bg-white/20',
    logoText:       'text-white',
    activeNav:      'bg-white/20 text-white',
    inactiveNav:    'text-teal-100 hover:bg-white/10 hover:text-white',
    userText:       'text-white',
    userSubtext:    'text-teal-100',
    roleColor:      'text-teal-100',
    border:         'border-teal-600',
    superLink:      '',
    superLinkActive:'',
    logoutHover:    'text-teal-100 hover:bg-white/10 hover:text-red-300',
  };
}

function roleLabel(role: string): string {
  if (role === 'diq')       return 'En proceso DEC';
  if (role === 'directora') return 'Directora';
  if (role === 'iniciadora')return 'Iniciadora';
  return 'Consultora';
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout, setUser } = useAuthStore();
  const navigate = useNavigate();
  const [editingUnit, setEditingUnit] = useState(false);
  const [unitInput,   setUnitInput]   = useState('');
  const [saving,      setSaving]      = useState(false);

  const theme = getTheme(user?.role ?? 'consultora', !!user?.isSuperAdmin);

  const handleEditUnit = () => {
    setUnitInput(user?.unitName ?? '');
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

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <aside className={`w-60 ${theme.aside} flex flex-col min-h-screen flex-shrink-0 fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:static md:z-auto`}>

      {/* Logo */}
      <div className={`px-6 py-5 border-b ${theme.border} flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 ${theme.logoBg} rounded-lg flex items-center justify-center flex-shrink-0`}>
            <span className={`${theme.logoText} text-sm font-bold`}>MK</span>
          </div>
          <div>
            <p className={`${theme.userText} font-bold text-sm leading-tight`}>MARY KAY</p>
            <p className={`${theme.userSubtext} text-xs`}>Producción</p>
          </div>
        </div>
        <button onClick={onClose} aria-label="Cerrar menu" className={`md:hidden ${theme.userSubtext} hover:opacity-80 w-8 h-8 flex items-center justify-center`}>
          <i className="fa-solid fa-xmark text-lg" aria-hidden="true" />
        </button>
      </div>

      {/* User info */}
      {user && (
        <div className={`px-6 py-4 border-b ${theme.border}`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 ${theme.logoBg} rounded-full flex items-center justify-center flex-shrink-0`}>
              <span className={`${theme.logoText} text-xs font-bold`}>{user.name.charAt(0)}</span>
            </div>
            <div className="min-w-0">
              <p className={`${theme.userText} text-xs font-medium truncate`}>Hola, {user.name.split(' ')[0]}</p>
              <p className={`${theme.roleColor} text-xs font-semibold`}>
                {user.isSuperAdmin ? 'Super Admin' : roleLabel(user.role)}
              </p>
              {(user.role === 'directora' || user.role === 'diq') && (
                editingUnit ? (
                  <div className="mt-1 flex gap-1" onClick={e => e.stopPropagation()}>
                    <input
                      className={`${theme.aside} ${theme.userText} text-xs rounded px-1.5 py-0.5 w-full focus:outline-none border ${theme.border}`}
                      value={unitInput}
                      onChange={e => setUnitInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveUnit(); if (e.key === 'Escape') setEditingUnit(false); }}
                      autoFocus
                    />
                    <button onClick={handleSaveUnit} disabled={saving} className={`${theme.roleColor} text-xs font-bold`}>
                      v
                    </button>
                    <button onClick={() => setEditingUnit(false)} className={`${theme.userSubtext} text-xs`}>x</button>
                  </div>
                ) : (
                  <button onClick={handleEditUnit} className="text-left mt-0.5 group flex items-center gap-1">
                    <p className={`${theme.userSubtext} text-xs truncate`}>{user.unitName ?? 'Sin nombre de grupo'}</p>
                    <i className={`fa-solid fa-pen-to-square text-xs opacity-0 group-hover:opacity-100 transition-opacity ${theme.userSubtext}`} aria-hidden="true" />
                  </button>
                )
              )}
              {user.status && (
                <div className="mt-1.5">
                  <StatusBadge status={user.status} variant="bubble" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {ALL_NAV_ITEMS.filter(item => {
          if (!user) return false;
          const role = user.isSuperAdmin ? 'superadmin' : user.role;
          return item.roles.includes(role);
        }).map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? theme.activeNav : theme.inactiveNav
              }`
            }
          >
            <Icon name={item.icon} />
            {item.label}
          </NavLink>
        ))}

        {/* Super Admin link */}
        {user?.isSuperAdmin && (
          <>
            <div className={`border-t ${theme.border} my-2`} />
            <NavLink
              to="/superadmin"
              end
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? theme.superLinkActive : theme.superLink
                }`
              }
            >
              <Icon name="crown" />
              Super Admin
            </NavLink>
          </>
        )}
      </nav>

      {/* Logout */}
      <div className={`px-3 py-4 border-t ${theme.border}`}>
        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full ${theme.logoutHover}`}
        >
          <Icon name="logout" />
          Cerrar sesion
        </button>
      </div>
    </aside>
  );
}
