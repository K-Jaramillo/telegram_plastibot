import { useState, useEffect, useCallback } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { io } from 'socket.io-client';
import BotConfig from './components/BotConfig.jsx';
import DatabaseConfig from './components/DatabaseConfig.jsx';
import OrdenesBoard from './components/OrdenesBoard.jsx';
import OrdenDetalle from './components/OrdenDetalle.jsx';
import CrearVentaModal from './components/CrearVentaModal.jsx';
import ComandosRef from './components/ComandosRef.jsx';
import FacturasTab from './components/FacturasTab.jsx';
import { api } from './lib/api.js';

const socket = io();

export default function App() {
  const [ordenes, setOrdenes] = useState([]);
  const [selectedOrden, setSelectedOrden] = useState(null);
  const [botStatus, setBotStatus] = useState('stopped');
  const [showCrearVenta, setShowCrearVenta] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [activeTab, setActiveTab] = useState('ordenes');

  const cargarOrdenes = useCallback(async () => {
    try {
      const data = await api.getOrdenes(null, filtroEstado || null);
      setOrdenes(data);
    } catch (err) {
      toast.error('Error al cargar órdenes');
    }
  }, [filtroEstado]);

  useEffect(() => {
    cargarOrdenes();
    api.getBotStatus().then((s) => setBotStatus(s.status)).catch(() => {});
  }, [cargarOrdenes]);

  // Socket.IO listeners
  useEffect(() => {
    socket.on('orden:nueva', (orden) => {
      setOrdenes((prev) => [orden, ...prev]);
      toast.success(`Nueva orden #${orden.id} de ${orden.cliente}`);
    });

    socket.on('orden:actualizada', (orden) => {
      setOrdenes((prev) => prev.map((o) => (o.id === orden.id ? orden : o)));
      if (selectedOrden?.id === orden.id) setSelectedOrden(orden);
    });

    socket.on('orden:eliminada', ({ id }) => {
      setOrdenes((prev) => prev.filter((o) => o.id !== id));
      if (selectedOrden?.id === id) setSelectedOrden(null);
    });

    socket.on('bot:status', ({ status }) => {
      setBotStatus(status);
    });

    return () => {
      socket.off('orden:nueva');
      socket.off('orden:actualizada');
      socket.off('orden:eliminada');
      socket.off('bot:status');
    };
  }, [selectedOrden]);

  const handleVerificar = async () => {
    if (!selectedOrden) return;
    try {
      await api.verificarOrden(selectedOrden.id);
      toast.success('Orden verificada');
    } catch {
      toast.error('Error al verificar');
    }
  };

  const handleProcesar = async () => {
    if (!selectedOrden) return;
    try {
      await api.procesarOrden(selectedOrden.id);
      toast.success('Orden procesada');
    } catch {
      toast.error('Error al procesar');
    }
  };

  const handleEliminar = async () => {
    if (!selectedOrden) return;
    if (!confirm(`¿Eliminar orden #${selectedOrden.id}?`)) return;
    try {
      await api.eliminarOrden(selectedOrden.id);
      setSelectedOrden(null);
      toast.success('Orden eliminada');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const handleCambiarEstado = async (estado) => {
    if (!selectedOrden) return;
    try {
      await api.cambiarEstado(selectedOrden.id, estado);
      toast.success(`Estado cambiado a ${estado}`);
    } catch {
      toast.error('Error al cambiar estado');
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Toaster position="top-right" />

      {/* Header */}
      <header className="bg-gradient-to-r from-blue-800 to-indigo-900 text-white px-6 py-3 shadow-lg flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          🛒 Órdenes Telegram — Eleventa
        </h1>
        <nav className="flex gap-1">
          <button
            className={`px-4 py-1.5 rounded-t text-sm font-medium transition ${
              activeTab === 'ordenes'
                ? 'bg-white text-blue-800 shadow'
                : 'text-blue-200 hover:text-white hover:bg-blue-700/50'
            }`}
            onClick={() => setActiveTab('ordenes')}
          >
            📋 Órdenes
          </button>
          <button
            className={`px-4 py-1.5 rounded-t text-sm font-medium transition ${
              activeTab === 'facturas'
                ? 'bg-white text-blue-800 shadow'
                : 'text-blue-200 hover:text-white hover:bg-blue-700/50'
            }`}
            onClick={() => setActiveTab('facturas')}
          >
            🧾 Facturas
          </button>
        </nav>
      </header>

      {/* Bot Config */}
      <BotConfig botStatus={botStatus} />

      {/* Database Config */}
      <DatabaseConfig />

      {/* Main Content */}
      {activeTab === 'ordenes' ? (
        <main className="flex-1 flex gap-4 p-4 overflow-hidden">
          {/* Left Panel - Orders Board */}
          <div className="flex-[3] flex flex-col min-w-0">
            {/* Toolbar */}
            <div className="bg-white rounded-t-lg px-4 py-2 flex items-center gap-2 border-b flex-wrap">
            <select
              className="border rounded px-2 py-1 text-sm"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
            >
              <option value="">Todos los estados</option>
              <option value="pendiente">⏳ Pendiente</option>
              <option value="aprobado">✅ Aprobado</option>
              <option value="empacado">📦 Empacado</option>
              <option value="despachado">🚚 Despachado</option>
              <option value="cancelado">❌ Cancelado</option>
            </select>

            <div className="flex-1" />

            <button
              className="btn-success text-sm py-1"
              onClick={handleVerificar}
              disabled={!selectedOrden}
            >
              ✅ Verificar
            </button>
            <button
              className="btn-primary text-sm py-1"
              onClick={handleProcesar}
              disabled={!selectedOrden}
            >
              📦 Procesar
            </button>

            <div className="w-px h-6 bg-gray-300" />

            <button
              className="btn-accent text-sm py-1"
              onClick={() => setShowCrearVenta(true)}
              disabled={!selectedOrden}
            >
              🛒 Crear Venta en Eleventa
            </button>

            <div className="w-px h-6 bg-gray-300" />

            <button
              className="btn-danger text-sm py-1"
              onClick={handleEliminar}
              disabled={!selectedOrden}
            >
              🗑️ Eliminar
            </button>

            <button
              className="text-sm px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
              onClick={cargarOrdenes}
            >
              🔄 Refrescar
            </button>
          </div>

          {/* Orders Board */}
          <OrdenesBoard
            ordenes={ordenes}
            selectedId={selectedOrden?.id}
            onSelect={setSelectedOrden}
          />
        </div>

        {/* Right Panel - Detail */}
        <div className="flex-1 min-w-[320px]">
          <OrdenDetalle
            orden={selectedOrden}
            onCambiarEstado={handleCambiarEstado}
          />
        </div>
      </main>
      ) : (
        <main className="flex-1 p-4 overflow-hidden">
          <FacturasTab />
        </main>
      )}

      {/* Commands Reference */}
      <ComandosRef />

      {/* Create Sale Modal */}
      {showCrearVenta && selectedOrden && (
        <CrearVentaModal
          orden={selectedOrden}
          onClose={() => setShowCrearVenta(false)}
          onCreated={() => {
            setShowCrearVenta(false);
            toast.success('Venta creada en Eleventa');
          }}
        />
      )}
    </div>
  );
}
