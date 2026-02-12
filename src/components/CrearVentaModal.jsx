import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { api } from '../lib/api.js';

export default function CrearVentaModal({ orden, onClose, onCreated }) {
  const [clienteBuscar, setClienteBuscar] = useState(orden.cliente || '');
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [clientesSugeridos, setClientesSugeridos] = useState([]);
  const [formaPago, setFormaPago] = useState('EFECTIVO');

  const [buscarProducto, setBuscarProducto] = useState('');
  const [productosDB, setProductosDB] = useState([]);
  const [productosVenta, setProductosVenta] = useState([]);
  const [notas, setNotas] = useState('');
  const [incluirNotas, setIncluirNotas] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verificandoStock, setVerificandoStock] = useState(false);

  // Initialize products from order and verify stock
  useEffect(() => {
    try {
      const prods = JSON.parse(orden.productos_json || '[]');
      const items = prods.map((p) => ({
        codigo: p.codigo || '',
        descripcion: p.descripcion || '',
        cantidad: p.cantidad || 1,
        precio: p.precio || 0,
        stock: p.stock ?? null, // null = not yet verified
      }));
      setProductosVenta(items);
      // Verify stock for each product
      _verificarStockProductos(items);
    } catch {
      setProductosVenta([]);
    }
  }, [orden]);

  const _verificarStockProductos = async (items) => {
    if (!items.length) return;
    setVerificandoStock(true);
    const updated = [...items];
    for (let i = 0; i < updated.length; i++) {
      if (updated[i].codigo && updated[i].stock === null) {
        try {
          const results = await api.getProductos(updated[i].codigo);
          const found = results.find((r) => r.CODIGO === updated[i].codigo);
          if (found) {
            updated[i] = { ...updated[i], stock: Number(found.STOCK || 0) };
          } else {
            updated[i] = { ...updated[i], stock: 0 };
          }
        } catch {
          updated[i] = { ...updated[i], stock: 0 };
        }
      }
    }
    setProductosVenta(updated);
    setVerificandoStock(false);
  };

  // Auto-search and select client from order
  useEffect(() => {
    if (!orden.cliente) return;
    (async () => {
      try {
        const clientes = await api.getClientes(orden.cliente);
        const lista = clientes.map((c) => ({
          id: c.ID,
          nombre: c.NOMBRE || c.NOMBRES || '',
        }));
        if (lista.length > 0) {
          setClienteSeleccionado(lista[0]);
          setClienteBuscar(lista[0].nombre);
        }
      } catch {}
    })();
  }, [orden.cliente]);

  // Search clients
  const buscarClientes = useCallback(async (texto) => {
    if (texto.length < 2) {
      setClientesSugeridos([]);
      return;
    }
    try {
      const clientes = await api.getClientes(texto);
      setClientesSugeridos(clientes.map((c) => ({
        id: c.ID,
        nombre: c.NOMBRE || c.NOMBRES || '',
      })));
    } catch {
      setClientesSugeridos([]);
    }
  }, []);

  // Search products
  const buscarProductos = async () => {
    if (!buscarProducto.trim()) return;
    try {
      const prods = await api.getProductos(buscarProducto);
      setProductosDB(prods);
    } catch (err) {
      toast.error('Error al buscar productos');
    }
  };

  const agregarProducto = (prod) => {
    const existe = productosVenta.find((p) => p.codigo === prod.CODIGO);
    if (existe) {
      setProductosVenta((prev) =>
        prev.map((p) =>
          p.codigo === prod.CODIGO ? { ...p, cantidad: p.cantidad + 1 } : p
        )
      );
    } else {
      setProductosVenta((prev) => [
        ...prev,
        {
          codigo: prod.CODIGO,
          descripcion: prod.DESCRIPCION,
          cantidad: 1,
          precio: Number(prod.PRECIO) || 0,
          stock: Number(prod.STOCK) || 0,
        },
      ]);
    }
  };

  const editarCantidad = (index, cantidad) => {
    const cant = parseInt(cantidad);
    if (isNaN(cant) || cant < 1) return;
    setProductosVenta((prev) =>
      prev.map((p, i) => (i === index ? { ...p, cantidad: cant } : p))
    );
  };

  const quitarProducto = (index) => {
    setProductosVenta((prev) => prev.filter((_, i) => i !== index));
  };

  const total = productosVenta.reduce(
    (sum, p) => sum + p.cantidad * p.precio,
    0
  );

  const hayProductosSinStock = productosVenta.some(
    (p) => p.stock !== null && p.stock < p.cantidad
  );

  const handleCrear = async () => {
    if (!clienteSeleccionado) return toast.error('Selecciona un cliente');
    if (productosVenta.length === 0) return toast.error('Agrega al menos un producto');
    if (hayProductosSinStock) return toast.error('Hay productos sin stock suficiente');
    if (verificandoStock) return toast.error('Verificando stock, espera...');

    setLoading(true);
    try {
      await api.crearVenta({
        orden_id: orden.id,
        productos: productosVenta,
        cliente: clienteSeleccionado.nombre,
        cliente_id: clienteSeleccionado.id,
        forma_pago: formaPago,
      });
      onCreated();
    } catch (err) {
      toast.error(err.message || 'Error al crear venta');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-auto">
        <div className="bg-gradient-to-r from-purple-700 to-indigo-800 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
          <h2 className="text-lg font-bold">🛒 Crear Venta en Eleventa</h2>
          <button
            className="text-white/80 hover:text-white text-2xl"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Section 1: Client */}
          <section>
            <h3 className="text-sm font-bold text-gray-600 uppercase mb-2">
              👤 Datos del Cliente
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                className="border rounded px-3 py-2 flex-1"
                placeholder="Buscar cliente..."
                value={clienteBuscar}
                onChange={(e) => {
                  setClienteBuscar(e.target.value);
                  buscarClientes(e.target.value);
                }}
              />
              <select
                className="border rounded px-3 py-2"
                value={formaPago}
                onChange={(e) => setFormaPago(e.target.value)}
              >
                <option value="EFECTIVO">Efectivo</option>
                <option value="CREDITO">Crédito</option>
                <option value="TARJETA">Tarjeta</option>
                <option value="TRANSFERENCIA">Transferencia</option>
              </select>
            </div>

            {clientesSugeridos.length > 0 && (
              <div className="border rounded mt-1 max-h-32 overflow-auto bg-white shadow">
                {clientesSugeridos.map((c, i) => (
                  <button
                    key={i}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 border-b last:border-0"
                    onClick={() => {
                      setClienteSeleccionado(c);
                      setClienteBuscar(c.nombre);
                      setClientesSugeridos([]);
                    }}
                  >
                    {c.nombre}
                  </button>
                ))}
              </div>
            )}

            {clienteSeleccionado && (
              <p className="text-sm text-green-600 mt-1">
                ✅ Cliente: <strong>{clienteSeleccionado.nombre}</strong>
              </p>
            )}
          </section>

          {/* Section 2: Original message */}
          <section>
            <h3 className="text-sm font-bold text-gray-600 uppercase mb-2">
              💬 Mensaje Original
            </h3>
            <div className="bg-gray-50 rounded p-3 text-sm font-mono whitespace-pre-wrap border max-h-24 overflow-auto">
              {orden.mensaje_original || '—'}
            </div>
          </section>

          {/* Section 3: Search Products */}
          <section>
            <h3 className="text-sm font-bold text-gray-600 uppercase mb-2">
              🔍 Buscar Productos en Catálogo
            </h3>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                className="border rounded px-3 py-2 flex-1"
                placeholder="Buscar producto..."
                value={buscarProducto}
                onChange={(e) => setBuscarProducto(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && buscarProductos()}
              />
              <button className="btn-primary text-sm" onClick={buscarProductos}>
                🔍 Buscar
              </button>
            </div>

            {productosDB.length > 0 && (
              <div className="border rounded overflow-hidden max-h-48 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left">Código</th>
                      <th className="px-2 py-1 text-left">Descripción</th>
                      <th className="px-2 py-1 text-right">Stock</th>
                      <th className="px-2 py-1 text-right">Precio</th>
                      <th className="px-2 py-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosDB.map((p, i) => (
                      <tr key={i} className="border-t hover:bg-blue-50">
                        <td className="px-2 py-1 font-mono text-xs">
                          {p.CODIGO}
                        </td>
                        <td className="px-2 py-1">{p.DESCRIPCION}</td>
                        <td className="px-2 py-1 text-right">
                          <span
                            className={
                              p.STOCK > 0 ? 'text-green-600' : 'text-red-500'
                            }
                          >
                            {p.STOCK}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-right">
                          ${Number(p.PRECIO).toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-center">
                          <button
                            className="text-blue-600 hover:text-blue-800 font-bold"
                            onClick={() => agregarProducto(p)}
                          >
                            ➕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Section 4: Products in Sale */}
          <section>
            <h3 className="text-sm font-bold text-gray-600 uppercase mb-2">
              📦 Productos de la Venta
            </h3>
            {productosVenta.length === 0 ? (
              <p className="text-gray-400 text-sm italic">
                No hay productos agregados
              </p>
            ) : (
              <div className="border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-2 py-1 text-left">Código</th>
                      <th className="px-2 py-1 text-left">Descripción</th>
                      <th className="px-2 py-1 text-center w-20">Cant</th>
                      <th className="px-2 py-1 text-right">P. Unit.</th>
                      <th className="px-2 py-1 text-right">Subtotal</th>
                      <th className="px-2 py-1 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosVenta.map((p, i) => {
                      const sinStock = p.stock !== null && p.stock < p.cantidad;
                      return (
                      <tr key={i} className={sinStock ? 'border-t bg-red-50' : 'border-t'}>
                        <td className="px-2 py-1 font-mono text-xs">
                          {p.codigo}
                        </td>
                        <td className={`px-2 py-1 ${sinStock ? 'text-red-600 font-semibold' : ''}`}>
                          {p.descripcion}
                          {sinStock && (
                            <span className="block text-xs text-red-500 font-normal">
                              ❌ Sin stock suficiente (disponible: {p.stock})
                            </span>
                          )}
                          {p.stock === null && (
                            <span className="block text-xs text-gray-400 font-normal">
                              ⏳ Verificando stock...
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-center">
                          <input
                            type="number"
                            min="1"
                            className="border rounded w-16 text-center px-1 py-0.5"
                            value={p.cantidad}
                            onChange={(e) => editarCantidad(i, e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-1 text-right">
                          ${p.precio.toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-right font-bold">
                          ${(p.cantidad * p.precio).toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-center">
                          <button
                            className="text-red-500 hover:text-red-700"
                            onClick={() => quitarProducto(i)}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="bg-gray-50 px-4 py-2 text-right text-lg font-bold border-t">
                  TOTAL: ${total.toFixed(2)}
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <button
                className="text-sm text-red-500 hover:underline"
                onClick={() => setProductosVenta([])}
              >
                🗑️ Limpiar todo
              </button>
            </div>
          </section>

          {/* Section 5: Notes */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={incluirNotas}
                onChange={(e) => setIncluirNotas(e.target.checked)}
                id="incluir-notas"
              />
              <label htmlFor="incluir-notas" className="text-sm font-bold text-gray-600 uppercase">
                📝 Notas de la Venta
              </label>
            </div>
            {incluirNotas && (
              <textarea
                className="border rounded p-2 w-full h-20 text-sm"
                placeholder="Notas adicionales..."
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            )}
          </section>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            {hayProductosSinStock && (
              <p className="text-red-500 text-sm font-semibold self-center mr-auto">
                ⚠️ No se puede crear: hay productos sin stock
              </p>
            )}
            <button className="btn-danger" onClick={onClose}>
              ❌ Cancelar
            </button>
            <button
              className={`text-lg px-8 ${hayProductosSinStock || verificandoStock ? 'btn-disabled opacity-50 cursor-not-allowed bg-gray-400 text-white rounded' : 'btn-success'}`}
              onClick={handleCrear}
              disabled={loading || hayProductosSinStock || verificandoStock}
            >
              {loading ? '⏳ Creando...' : verificandoStock ? '⏳ Verificando stock...' : '✅ Crear Venta en Eleventa'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
