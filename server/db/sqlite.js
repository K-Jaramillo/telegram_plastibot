import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', '..', 'liquidador_data.db');

let db;

export function getDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function initDB() {
  const database = getDB();

  database.exec(`
    CREATE TABLE IF NOT EXISTS config (
      clave TEXT PRIMARY KEY,
      valor TEXT
    );

    CREATE TABLE IF NOT EXISTS ordenes_telegram (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha DATE NOT NULL DEFAULT (date('now','localtime')),
      telegram_user_id INTEGER,
      telegram_username TEXT,
      telegram_nombre TEXT,
      mensaje_original TEXT,
      cliente TEXT,
      cliente_id INTEGER,
      productos TEXT,
      productos_json TEXT,
      notas TEXT,
      estado TEXT NOT NULL DEFAULT 'pendiente'
        CHECK(estado IN ('pendiente','aprobado','empacado','despachado','cancelado')),
      verificada INTEGER NOT NULL DEFAULT 0,
      procesada INTEGER NOT NULL DEFAULT 0,
      total REAL DEFAULT 0,
      subtotal REAL DEFAULT 0,
      ticket_id INTEGER,
      folio INTEGER,
      aprobado_por TEXT,
      aprobado_en TIMESTAMP,
      empacado_por TEXT,
      empacado_en TIMESTAMP,
      despachado_por TEXT,
      despachado_en TIMESTAMP,
      fecha_creacion TIMESTAMP DEFAULT (datetime('now','localtime')),
      fecha_modificacion TIMESTAMP DEFAULT (datetime('now','localtime'))
    );
  `);

  console.log('✅ SQLite database initialized');
}

// ── Config helpers ──────────────────────────────
export function getConfig(clave) {
  const row = getDB().prepare('SELECT valor FROM config WHERE clave = ?').get(clave);
  return row ? row.valor : null;
}

export function setConfig(clave, valor) {
  getDB()
    .prepare('INSERT OR REPLACE INTO config (clave, valor) VALUES (?, ?)')
    .run(clave, valor);
}

// ── Órdenes CRUD ────────────────────────────────
export function crearOrden(data) {
  const stmt = getDB().prepare(`
    INSERT INTO ordenes_telegram 
      (fecha, telegram_user_id, telegram_username, telegram_nombre,
       mensaje_original, cliente, cliente_id, productos, productos_json,
       notas, estado, total, subtotal)
    VALUES 
      (@fecha, @telegram_user_id, @telegram_username, @telegram_nombre,
       @mensaje_original, @cliente, @cliente_id, @productos, @productos_json,
       @notas, @estado, @total, @subtotal)
  `);

  const result = stmt.run({
    fecha: data.fecha || new Date().toISOString().split('T')[0],
    telegram_user_id: data.telegram_user_id || null,
    telegram_username: data.telegram_username || null,
    telegram_nombre: data.telegram_nombre || null,
    mensaje_original: data.mensaje_original || '',
    cliente: data.cliente || '',
    cliente_id: data.cliente_id || null,
    productos: data.productos || '',
    productos_json: data.productos_json || '[]',
    notas: data.notas || '',
    estado: data.estado || 'pendiente',
    total: data.total || 0,
    subtotal: data.subtotal || 0,
  });

  return result.lastInsertRowid;
}

export function obtenerOrdenes(fecha, estado) {
  let sql = 'SELECT * FROM ordenes_telegram WHERE 1=1';
  const params = {};

  if (fecha) {
    sql += ' AND fecha = @fecha';
    params.fecha = fecha;
  }
  if (estado) {
    sql += ' AND estado = @estado';
    params.estado = estado;
  }

  sql += ' ORDER BY id DESC';
  return getDB().prepare(sql).all(params);
}

export function obtenerOrdenPorId(id) {
  return getDB().prepare('SELECT * FROM ordenes_telegram WHERE id = ?').get(id);
}

export function actualizarOrden(id, data) {
  const fields = [];
  const params = { id };

  for (const [key, value] of Object.entries(data)) {
    if (key !== 'id') {
      fields.push(`${key} = @${key}`);
      params[key] = value;
    }
  }

  if (fields.length === 0) return;

  fields.push("fecha_modificacion = datetime('now','localtime')");
  const sql = `UPDATE ordenes_telegram SET ${fields.join(', ')} WHERE id = @id`;
  getDB().prepare(sql).run(params);
}

export function eliminarOrden(id) {
  getDB().prepare('DELETE FROM ordenes_telegram WHERE id = ?').run(id);
}

export function cambiarEstadoOrden(id, nuevoEstado, usuario) {
  const now = new Date().toISOString();
  const data = { estado: nuevoEstado };

  if (nuevoEstado === 'aprobado') {
    data.aprobado_por = usuario;
    data.aprobado_en = now;
  } else if (nuevoEstado === 'empacado') {
    data.empacado_por = usuario;
    data.empacado_en = now;
  } else if (nuevoEstado === 'despachado') {
    data.despachado_por = usuario;
    data.despachado_en = now;
  }

  actualizarOrden(id, data);
}

export function contarOrdenesPorEstado() {
  return getDB()
    .prepare(
      `SELECT estado, COUNT(*) as total 
       FROM ordenes_telegram 
       GROUP BY estado`
    )
    .all();
}
