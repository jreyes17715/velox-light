import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';

export function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Barra superior solo en movil */}
      <div className="md:hidden fixed top-0 inset-x-0 h-14 bg-gray-950 flex items-center px-4 z-30">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Abrir menu"
          className="text-white w-9 h-9 flex items-center justify-center -ml-2"
        >
          <i className="fa-solid fa-bars text-lg" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-2 ml-1">
          <div className="w-7 h-7 bg-pink-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">MK</span>
          </div>
          <span className="text-white font-bold text-sm">Mary Kay</span>
        </div>
      </div>

      {/* Overlay al abrir el drawer en movil */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  );
}
