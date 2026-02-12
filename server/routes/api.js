import { Router } from 'express';
import { botManager } from '../index.js';
import {
  getConfig,
  setConfig,
  obtenerOrdenes,
  obtenerOrdenPorId,
  actualizarOrden,
  eliminarOrden,
  cambiarEstadoOrden,
  contarOrdenesPorEstado,
  crearOrden,
} from '../db/sqlite.js';
import {
  buscarProductos,
  obtenerProductos,
  buscarClientes,
  obtenerClientes,
  crearVentaEleventa,
  obtenerFacturas,
  obtenerDetalleFactura,
} from '../db/firebird.js';
import { emitOrdenActualizada, emitOrdenEliminada, emitNuevaOrden } from '../socket.js';

const router = Router();

// ── Bot ─────────────────────────────────────────
router.get('/bot/status', (req, res) => {
  res.json(botManager.getStatus());
});

router.post('/bot/start', async (req, res) => {
  const token = req.body.token || getConfig('telegram_bot_token') || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(400).json({ success: false, error: 'Token no configurado' });
  }
  // Persist token
  setConfig('telegram_bot_token', token);
  const result = await botManager.start(token);
  res.json(result);
});

router.post('/bot/stop', async (req, res) => {
  const result = await botManager.stop();
  res.json(result);
});

// ── Config ──────────────────────────────────────
router.get('/config/token', (req, res) => {
  const token = getConfig('telegram_bot_token') || process.env.TELEGRAM_BOT_TOKEN || '';
  res.json({ token });
});

router.post('/config/token', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token requerido' });
  setConfig('telegram_bot_token', token);
  res.json({ success: true });
});

// ── Órdenes ─────────────────────────────────────
router.get('/ordenes', (req, res) => {
  const { fecha, estado } = req.query;
  const ordenes = obtenerOrdenes(fecha || null, estado || null);
  res.json(ordenes);
});

router.get('/ordenes/conteo', (req, res) => {
  const conteos = contarOrdenesPorEstado();
  res.json(conteos);
});

router.get('/ordenes/:id', (req, res) => {
  const orden = obtenerOrdenPorId(parseInt(req.params.id));
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
  res.json(orden);
});

router.post('/ordenes', (req, res) => {
  try {
    const id = crearOrden(req.body);
    const orden = obtenerOrdenPorId(id);
    emitNuevaOrden(orden);
    res.json(orden);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/ordenes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  actualizarOrden(id, req.body);
  const orden = obtenerOrdenPorId(id);
  emitOrdenActualizada(orden);
  res.json(orden);
});

router.put('/ordenes/:id/estado', (req, res) => {
  const id = parseInt(req.params.id);
  const { estado, usuario } = req.body;
  cambiarEstadoOrden(id, estado, usuario || 'web');
  const orden = obtenerOrdenPorId(id);
  emitOrdenActualizada(orden);
  res.json(orden);
});

router.put('/ordenes/:id/verificar', (req, res) => {
  const id = parseInt(req.params.id);
  actualizarOrden(id, { verificada: 1 });
  const orden = obtenerOrdenPorId(id);
  emitOrdenActualizada(orden);
  res.json(orden);
});

router.put('/ordenes/:id/procesar', (req, res) => {
  const id = parseInt(req.params.id);
  actualizarOrden(id, { procesada: 1 });
  const orden = obtenerOrdenPorId(id);
  emitOrdenActualizada(orden);
  res.json(orden);
});

router.delete('/ordenes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  eliminarOrden(id);
  emitOrdenEliminada(id);
  res.json({ success: true });
});

// ── Productos (Firebird) ────────────────────────
router.get('/productos', async (req, res) => {
  try {
    const { buscar } = req.query;
    const productos = buscar
      ? await buscarProductos(buscar)
      : await obtenerProductos();
    res.json(productos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Clientes (Firebird) ─────────────────────────
router.get('/clientes', async (req, res) => {
  try {
    const { buscar } = req.query;
    const clientes = buscar
      ? await buscarClientes(buscar)
      : await obtenerClientes();
    res.json(clientes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Crear venta en Eleventa ─────────────────────
router.post('/ventas/crear', async (req, res) => {
  try {
    const { orden_id, productos, cliente, forma_pago, cliente_id } = req.body;
    const orden = obtenerOrdenPorId(orden_id);
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });

    console.log(`📝 Creando venta para orden #${orden_id}...`);
    const resultado = await crearVentaEleventa(orden, productos, cliente, forma_pago, cliente_id);
    console.log(`✅ Venta creada:`, JSON.stringify(resultado));

    // Update order with ticket info
    actualizarOrden(orden_id, {
      estado: 'aprobado',
      ticket_id: resultado.ticketId,
      folio: resultado.folio,
      total: resultado.total,
      aprobado_por: 'web',
      aprobado_en: new Date().toISOString(),
    });
    console.log(`✅ Orden #${orden_id} actualizada a 'aprobado'`);

    const ordenActualizada = obtenerOrdenPorId(orden_id);
    emitOrdenActualizada(ordenActualizada);

    res.json({ success: true, ...resultado });
  } catch (err) {
    console.error(`❌ Error creando venta:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Facturas (Firebird) ─────────────────────────
router.get('/facturas', async (req, res) => {
  try {
    const { fecha, fecha_hasta, folio, cliente, limite } = req.query;
    const facturas = await obtenerFacturas({
      fecha: fecha || undefined,
      fechaHasta: fecha_hasta || undefined,
      folio: folio || undefined,
      cliente: cliente || undefined,
      limite: limite ? parseInt(limite) : 100,
    });
    res.json(facturas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/facturas/:id/detalle', async (req, res) => {
  try {
    const articulos = await obtenerDetalleFactura(parseInt(req.params.id));
    res.json(articulos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
