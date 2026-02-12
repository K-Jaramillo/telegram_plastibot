import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getDBPath() {
  // Check if there's a configured path in the database
  if (db) {
    const configPath = getConfig('sqlite_database_path');
    if (configPath && configPath.trim()) {
      return path.isAbsolute(configPath) ? configPath : path.resolve(configPath);
    }
  }
  // Default path
  return path.join(__dirname, '..', '..', 'liquidador_data.db');
}

const DB_PATH = path.join(__dirname, '..', '..', 'liquidador_data.db');

let db;

// ── Helpers internos ────────────────────────────
// sql.js devuelve arrays de arrays; estas utilidades los convierten a objetos
function stmtAll(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const cols = stmt.getColumnNames();
  const rows = [];
  while (stmt.step()) {
    const vals = stmt.get();
    const obj = {};
    cols.forEach((c, i) => (obj[c] = vals[i]));
    rows.push(obj);
  }
  stmt.free();
  return rows;
}

function stmtGet(sql, params = []) {
  const rows = stmtAll(sql, params);
  return rows.length ? rows[0] : undefined;
}

function stmtRun(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);
  // Devuelve el last insert rowid
  const res = db.exec('SELECT last_insert_rowid() AS id');
  return res.length ? res[0].values[0][0] : 0;
}

function saveDB() {
  const dbPath = getDBPath();
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

// ── Inicialización (asíncrona) ──────────────────
export async function getDB() {
  if (!db) {
    const dbPath = DB_PATH; // Use default path for initial load
    const SQL = await initSqlJs();
    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }
    db.run('PRAGMA foreign_keys = ON');
  }
  return db;
}

export async function initDB() {
  await getDB();

  db.run(`
    CREATE TABLE IF NOT EXISTS config (
      clave TEXT PRIMARY KEY,
      valor TEXT
    )
  `);

  db.run(`
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
    )
  `);

  saveDB();
  console.log('✅ SQLite database initialized');
}

// ── Config helpers ──────────────────────────────
export function getConfig(clave) {
  try {
    const row = stmtGet('SELECT valor FROM config WHERE clave = ?', [clave]);
    return row ? row.valor : null;
  } catch (err) {
    console.error('Error in getConfig:', err.message);
    return null;
  }
}

export function setConfig(clave, valor) {
  db.run('INSERT OR REPLACE INTO config (clave, valor) VALUES (?, ?)', [clave, valor]);
  saveDB();
}

// ── Órdenes CRUD ────────────────────────────────
export function crearOrden(data) {
  const params = [
    data.fecha || new Date().toISOString().split('T')[0],
    data.telegram_user_id ?? null,
    data.telegram_username ?? null,
    data.telegram_nombre ?? null,
    data.mensaje_original || '',
    data.cliente || '',
    data.cliente_id ?? null,
    data.productos || '',
    data.productos_json || '[]',
    data.notas || '',
    data.estado || 'pendiente',
    data.total || 0,
    data.subtotal || 0,
  ];

  const id = stmtRun(
    `INSERT INTO ordenes_telegram 
      (fecha, telegram_user_id, telegram_username, telegram_nombre,
       mensaje_original, cliente, cliente_id, productos, productos_json,
       notas, estado, total, subtotal)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params
  );

  saveDB();
  return id;
}

export function obtenerOrdenes(fecha, estado) {
  let sql = 'SELECT * FROM ordenes_telegram WHERE 1=1';
  const params = [];

  if (fecha) {
    sql += ' AND fecha = ?';
    params.push(fecha);
  }
  if (estado) {
    sql += ' AND estado = ?';
    params.push(estado);
  }

  sql += ' ORDER BY id DESC';
  return stmtAll(sql, params);
}

export function obtenerOrdenPorId(id) {
  return stmtGet('SELECT * FROM ordenes_telegram WHERE id = ?', [id]);
}

export function actualizarOrden(id, data) {
  const fields = [];
  const params = [];

  for (const [key, value] of Object.entries(data)) {
    if (key !== 'id') {
      fields.push(`${key} = ?`);
      params.push(value);
    }
  }

  if (fields.length === 0) return;

  fields.push("fecha_modificacion = datetime('now','localtime')");
  params.push(id);
  const sql = `UPDATE ordenes_telegram SET ${fields.join(', ')} WHERE id = ?`;
  db.run(sql, params);
  saveDB();
}

export function eliminarOrden(id) {
  db.run('DELETE FROM ordenes_telegram WHERE id = ?', [id]);
  saveDB();
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
  return stmtAll(
    `SELECT estado, COUNT(*) as total 
     FROM ordenes_telegram 
     GROUP BY estado`
  );
}

export async function testSQLiteConnection() {
  try {
    await getDB();
    const result = stmtGet('SELECT 1 as test');
    if (result && result.test === 1) {
      return { success: true, message: 'Conexión exitosa a SQLite' };
    }
    throw new Error('Respuesta inesperada de la base de datos');
  } catch (err) {
    throw new Error(`Error de conexión SQLite: ${err.message}`);
  }
}
