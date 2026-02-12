import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import toast from 'react-hot-toast';

function hoy() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function formatMoney(val) {
  const n = Number(val || 0);
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatFecha(val) {
  if (!val) return '—';
  const d = new Date(val);
  return d.toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formaPagoLabel(fp) {
  if (!fp) return '—';
  const f = fp.trim().toLowerCase();
  if (f === 'e' || f === 'efectivo') return 'Efectivo';
  if (f === 't' || f === 'tarjeta') return 'Tarjeta';
  if (f === 'c' || f === 'credito' || f === 'crédito') return 'Crédito';
  if (f === 'v' || f === 'vales') return 'Vales';
  return fp.trim();
}

export default function FacturasTab() {
  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detalle, setDetalle] = useState([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  // Filtros
  const [fecha, setFecha] = useState(hoy());
  const [fechaHasta, setFechaHasta] = useState('');
  const [folio, setFolio] = useState('');
  const [cliente, setCliente] = useState('');
  const [rangoActivo, setRangoActivo] = useState(false);

  const cargarFacturas = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getFacturas({
        fecha: fecha || undefined,
        fechaHasta: rangoActivo && fechaHasta ? fechaHasta : undefined,
        folio: folio || undefined,
        cliente: cliente || undefined,
      });
      setFacturas(data);
      setSelectedId(null);
      setDetalle([]);
    } catch (err) {
      toast.error('Error al cargar facturas: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [fecha, fechaHasta, folio, cliente, rangoActivo]);

  useEffect(() => {
    cargarFacturas();
  }, [cargarFacturas]);

  const verDetalle = async (id) => {
    if (selectedId === id) {
      setSelectedId(null);
      setDetalle([]);
      return;
    }
    setSelectedId(id);
    setLoadingDetalle(true);
    try {
      const arts = await api.getDetalleFactura(id);
      setDetalle(arts);
    } catch (err) {
      toast.error('Error al cargar detalle');
      setDetalle([]);
    } finally {
      setLoadingDetalle(false);
    }
  };

  const totalDia = facturas.reduce((s, f) => s + Number(f.TOTAL || 0), 0);
  const totalArticulos = facturas.reduce((s, f) => s + Number(f.NUMERO_ARTICULOS || 0), 0);

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow overflow-hidden">
      {/* Toolbar de filtros */}
      <div className="bg-gray-50 border-b px-4 py-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1 font-medium">
            📅 {rangoActivo ? 'Desde' : 'Fecha'}
          </label>
          <input
            type="date"
            className="border rounded px-2 py-1.5 text-sm w-40"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>

        {rangoActivo && (
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1 font-medium">Hasta</label>
            <input
              type="date"
              className="border rounded px-2 py-1.5 text-sm w-40"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              min={fecha}
            />
          </div>
        )}

        <button
          className={`text-xs px-2 py-1.5 rounded border ${rangoActivo ? 'bg-blue-100 border-blue-400 text-blue-700' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
          onClick={() => {
            setRangoActivo(!rangoActivo);
            if (!rangoActivo) setFechaHasta(fecha);
          }}
          title="Filtrar por rango de fechas"
        >
          📆 Rango
        </button>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1 font-medium">🔢 Folio</label>
          <input
            type="text"
            className="border rounded px-2 py-1.5 text-sm w-24"
            placeholder="Folio"
            value={folio}
            onChange={(e) => setFolio(e.target.value.replace(/\D/g, ''))}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1 font-medium">👤 Negocio / Cliente</label>
          <input
            type="text"
            className="border rounded px-2 py-1.5 text-sm w-52"
            placeholder="Buscar por nombre..."
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
          />
        </div>

        <button
          className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 transition font-medium"
          onClick={cargarFacturas}
          disabled={loading}
        >
          {loading ? '⏳' : '🔍'} Buscar
        </button>

        <button
          className="bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-sm hover:bg-gray-300 transition"
          onClick={() => {
            setFecha(hoy());
            setFechaHasta('');
            setFolio('');
            setCliente('');
            setRangoActivo(false);
          }}
        >
          🔄 Limpiar
        </button>

        {/* Resumen */}
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="text-gray-500">
            📋 <strong>{facturas.length}</strong> facturas
          </span>
          <span className="text-gray-500">
            📦 <strong>{totalArticulos}</strong> artículos
          </span>
          <span className="text-green-700 font-bold text-base">
            💰 {formatMoney(totalDia)}
          </span>
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            <span className="animate-spin mr-2">⏳</span> Cargando facturas...
          </div>
        ) : facturas.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            📭 No hay facturas para los filtros seleccionados
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-100 sticky top-0 z-10">
              <tr>
                <th className="text-left px-4 py-2 font-semibold text-gray-600">Folio</th>
                <th className="text-left px-4 py-2 font-semibold text-gray-600">Cliente / Negocio</th>
                <th className="text-center px-4 py-2 font-semibold text-gray-600">Arts.</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-600">Total</th>
                <th className="text-center px-4 py-2 font-semibold text-gray-600">Pago</th>
                <th className="text-center px-4 py-2 font-semibold text-gray-600">Fecha / Hora</th>
                <th className="text-center px-4 py-2 font-semibold text-gray-600">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((f) => (
                <FacturaRow
                  key={f.ID}
                  factura={f}
                  isSelected={selectedId === f.ID}
                  detalle={selectedId === f.ID ? detalle : null}
                  loadingDetalle={selectedId === f.ID && loadingDetalle}
                  onToggle={() => verDetalle(f.ID)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FacturaRow({ factura: f, isSelected, detalle, loadingDetalle, onToggle }) {
  return (
    <>
      <tr
        className={`border-b cursor-pointer transition hover:bg-blue-50 ${isSelected ? 'bg-blue-50' : ''}`}
        onClick={onToggle}
      >
        <td className="px-4 py-2 font-mono font-bold text-blue-700">#{f.FOLIO}</td>
        <td className="px-4 py-2 font-medium text-gray-800 max-w-[240px] truncate" title={f.NOMBRE}>
          {f.NOMBRE || '—'}
        </td>
        <td className="px-4 py-2 text-center text-gray-600">{f.NUMERO_ARTICULOS || 0}</td>
        <td className="px-4 py-2 text-right font-semibold text-green-700">{formatMoney(f.TOTAL)}</td>
        <td className="px-4 py-2 text-center">
          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
            ['e','efectivo'].includes(f.FORMA_PAGO?.trim().toLowerCase()) ? 'bg-green-100 text-green-800' :
            ['t','tarjeta'].includes(f.FORMA_PAGO?.trim().toLowerCase()) ? 'bg-blue-100 text-blue-800' :
            ['c','credito','crédito'].includes(f.FORMA_PAGO?.trim().toLowerCase()) ? 'bg-yellow-100 text-yellow-800' :
            'bg-gray-100 text-gray-700'
          }`}>
            {formaPagoLabel(f.FORMA_PAGO)}
          </span>
        </td>
        <td className="px-4 py-2 text-center text-gray-500 text-xs">{formatFecha(f.VENDIDO_EN)}</td>
        <td className="px-4 py-2 text-center">
          <button className="text-blue-500 hover:text-blue-700 text-lg" title="Ver detalle">
            {isSelected ? '▲' : '▼'}
          </button>
        </td>
      </tr>

      {/* Detalle expandido */}
      {isSelected && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-6 py-3">
            {loadingDetalle ? (
              <p className="text-gray-400 text-sm animate-pulse">Cargando artículos...</p>
            ) : detalle && detalle.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b">
                      <th className="text-left py-1 px-2">Código</th>
                      <th className="text-left py-1 px-2">Producto</th>
                      <th className="text-center py-1 px-2">Cantidad</th>
                      <th className="text-right py-1 px-2">Precio</th>
                      <th className="text-right py-1 px-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.map((a, i) => (
                      <tr key={i} className="border-b border-gray-200">
                        <td className="py-1 px-2 font-mono text-gray-500">{a.PRODUCTO_CODIGO}</td>
                        <td className="py-1 px-2 font-medium text-gray-700">{a.PRODUCTO_NOMBRE}</td>
                        <td className="py-1 px-2 text-center">{Number(a.CANTIDAD).toFixed(0)}</td>
                        <td className="py-1 px-2 text-right">{formatMoney(a.PRECIO_FINAL)}</td>
                        <td className="py-1 px-2 text-right font-semibold">{formatMoney(a.TOTAL_ARTICULO)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold text-sm">
                      <td colSpan={4} className="py-1 px-2 text-right">Total:</td>
                      <td className="py-1 px-2 text-right text-green-700">
                        {formatMoney(detalle.reduce((s, a) => s + Number(a.TOTAL_ARTICULO || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="text-gray-400 text-sm">Sin artículos</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
