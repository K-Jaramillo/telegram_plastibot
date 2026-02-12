const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Bot
  getBotStatus: () => request('/bot/status'),
  startBot: (token) => request('/bot/start', { method: 'POST', body: JSON.stringify({ token }) }),
  stopBot: () => request('/bot/stop', { method: 'POST' }),

  // Config
  getToken: () => request('/config/token'),
  saveToken: (token) =>
    request('/config/token', { method: 'POST', body: JSON.stringify({ token }) }),

  // Órdenes
  getOrdenes: (fecha, estado) => {
    const params = new URLSearchParams();
    if (fecha) params.set('fecha', fecha);
    if (estado) params.set('estado', estado);
    const qs = params.toString();
    return request(`/ordenes${qs ? '?' + qs : ''}`);
  },
  getOrden: (id) => request(`/ordenes/${id}`),
  crearOrden: (data) =>
    request('/ordenes', { method: 'POST', body: JSON.stringify(data) }),
  actualizarOrden: (id, data) =>
    request(`/ordenes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  verificarOrden: (id) =>
    request(`/ordenes/${id}/verificar`, { method: 'PUT' }),
  procesarOrden: (id) =>
    request(`/ordenes/${id}/procesar`, { method: 'PUT' }),
  cambiarEstado: (id, estado, usuario) =>
    request(`/ordenes/${id}/estado`, {
      method: 'PUT',
      body: JSON.stringify({ estado, usuario }),
    }),
  eliminarOrden: (id) => request(`/ordenes/${id}`, { method: 'DELETE' }),
  getConteoEstados: () => request('/ordenes/conteo'),

  // Productos
  getProductos: (buscar) => {
    const qs = buscar ? `?buscar=${encodeURIComponent(buscar)}` : '';
    return request(`/productos${qs}`);
  },

  // Clientes
  getClientes: (buscar) => {
    const qs = buscar ? `?buscar=${encodeURIComponent(buscar)}` : '';
    return request(`/clientes${qs}`);
  },

  // Ventas
  crearVenta: (data) =>
    request('/ventas/crear', { method: 'POST', body: JSON.stringify(data) }),

  // Facturas
  getFacturas: ({ fecha, fechaHasta, folio, cliente, limite } = {}) => {
    const params = new URLSearchParams();
    if (fecha) params.set('fecha', fecha);
    if (fechaHasta) params.set('fecha_hasta', fechaHasta);
    if (folio) params.set('folio', folio);
    if (cliente) params.set('cliente', cliente);
    if (limite) params.set('limite', limite);
    const qs = params.toString();
    return request(`/facturas${qs ? '?' + qs : ''}`);
  },
  getDetalleFactura: (id) => request(`/facturas/${id}/detalle`),
};
