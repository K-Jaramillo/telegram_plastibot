import Firebird from 'node-firebird';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from './sqlite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve database path to absolute
function resolveDbPath(dbPath) {
  if (!dbPath) return path.join(__dirname, '..', '..', 'PDVDATA.FDB');
  if (path.isAbsolute(dbPath)) return dbPath;
  // Relative paths resolve from project root
  return path.resolve(path.join(__dirname, '..', '..'), dbPath);
}

function getOptions() {
  const configPath = getConfig('firebird_database_path');
  const dbPath = configPath || process.env.FIREBIRD_DATABASE;
  
  return {
    host: process.env.FIREBIRD_HOST || 'localhost',
    port: parseInt(process.env.FIREBIRD_PORT || '3050'),
    database: resolveDbPath(dbPath),
    user: process.env.FIREBIRD_USER || 'SYSDBA',
    password: process.env.FIREBIRD_PASSWORD || 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096,
    timeout: 10000, // 10 segundos
    retryConnectionInterval: 1000,
  };
}

// Retry helper
async function retryOperation(operation, maxRetries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      const isConnectionError = err.message?.includes('ECONNRESET') || 
                                err.message?.includes('ECONNREFUSED') ||
                                err.message?.includes('connection');
      
      if (attempt === maxRetries || !isConnectionError) {
        throw err;
      }
      
      console.warn(`⚠️ Connection error (attempt ${attempt}/${maxRetries}), retrying...`);
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
}

function query(sql, params = []) {
  return retryOperation(() => new Promise((resolve, reject) => {
    const opts = getOptions();
    const timeout = setTimeout(() => {
      reject(new Error('Query timeout after 10 seconds'));
    }, 10000);

    Firebird.attach(opts, (err, db) => {
      if (err) {
        clearTimeout(timeout);
        console.error('❌ Firebird connection error:', err.message);
        return reject(err);
      }
      
      db.query(sql, params, (err, result) => {
        clearTimeout(timeout);
        db.detach(() => {
          if (err) {
            console.error('❌ Firebird query error:', err.message);
            return reject(err);
          }
          resolve(result || []);
        });
      });
    });
  }));
}

function execute(sql, params = []) {
  return retryOperation(() => new Promise((resolve, reject) => {
    const opts = getOptions();
    Firebird.attach(opts, (err, db) => {
      if (err) return reject(err);
      db.transaction(Firebird.ISOLATION_READ_COMMITTED, (err, tr) => {
        if (err) { db.detach(); return reject(err); }
        tr.query(sql, params, (err, result) => {
          if (err) {
            tr.rollback(() => db.detach());
            return reject(err);
          }
          tr.commit((err) => {
            db.detach();
            if (err) return reject(err);
            resolve(result);
          });
        });
      });
    });
  }));
}

// Execute multiple statements in a single transaction
function executeTransaction(fn) {
  return retryOperation(() => new Promise((resolve, reject) => {
    const opts = getOptions();
    Firebird.attach(opts, (err, db) => {
      if (err) return reject(err);
      db.transaction(Firebird.ISOLATION_READ_COMMITTED, async (err, tr) => {
        if (err) { db.detach(); return reject(err); }

        const trQuery = (sql, params = []) => new Promise((res, rej) => {
          tr.query(sql, params, (err, rows) => err ? rej(err) : res(rows || []));
        });
        const trCommit = () => new Promise((res, rej) => {
          tr.commit((err) => err ? rej(err) : res());
        });
        const trRollback = () => new Promise((res) => {
          tr.rollback(() => res());
        });

        try {
          const result = await fn(trQuery);
          await trCommit();
          db.detach();
          resolve(result);
        } catch (e) {
          await trRollback();
          db.detach();
          reject(e);
        }
      });
    });
  }));
}

// ── Productos ───────────────────────────────────
export async function buscarProductos(texto) {
  const sql = `
    SELECT FIRST 50 
      p.CODIGO, p.DESCRIPCION, 
      COALESCE(ib.CANTIDAD_ACTUAL, p.DINVENTARIO) as STOCK,
      p.PVENTA as PRECIO
    FROM PRODUCTOS p
    LEFT JOIN INVENTARIO_BALANCES ib ON ib.PRODUCTO_ID = p.ID
    WHERE UPPER(p.DESCRIPCION) LIKE UPPER(?)
      AND p.ELIMINADO_EN IS NULL
    ORDER BY p.DESCRIPCION
  `;
  return query(sql, [`%${texto}%`]);
}

export async function obtenerProductos() {
  const sql = `
    SELECT FIRST 500
      p.CODIGO, p.DESCRIPCION,
      COALESCE(ib.CANTIDAD_ACTUAL, p.DINVENTARIO) as STOCK,
      p.PVENTA as PRECIO
    FROM PRODUCTOS p
    LEFT JOIN INVENTARIO_BALANCES ib ON ib.PRODUCTO_ID = p.ID
    WHERE COALESCE(ib.CANTIDAD_ACTUAL, p.DINVENTARIO) > 0
      AND p.ELIMINADO_EN IS NULL
    ORDER BY p.DESCRIPCION
  `;
  return query(sql);
}

export async function obtenerTodosProductos() {
  const sql = `
    SELECT
      p.CODIGO, p.DESCRIPCION,
      COALESCE(ib.CANTIDAD_ACTUAL, p.DINVENTARIO) as STOCK,
      p.PVENTA as PRECIO
    FROM PRODUCTOS p
    LEFT JOIN INVENTARIO_BALANCES ib ON ib.PRODUCTO_ID = p.ID
    WHERE p.ELIMINADO_EN IS NULL
    ORDER BY p.DESCRIPCION
  `;
  return query(sql);
}

export async function verificarStock(codigo) {
  const sql = `
    SELECT p.CODIGO, p.DESCRIPCION, 
      COALESCE(ib.CANTIDAD_ACTUAL, p.DINVENTARIO) as STOCK,
      p.PVENTA as PRECIO
    FROM PRODUCTOS p
    LEFT JOIN INVENTARIO_BALANCES ib ON ib.PRODUCTO_ID = p.ID
    WHERE p.CODIGO = ?
  `;
  const rows = await query(sql, [codigo]);
  return rows[0] || null;
}

// ── Clientes ────────────────────────────────────
export async function buscarClientes(texto) {
  const textoLimpio = texto.trim();
  if (textoLimpio.length < 2) return [];

  // Estrategia simplificada: Buscar en NOMBRES y APELLIDOS por separado
  // Luego filtrar en JavaScript
  const palabrasIgnorar = ['LA', 'EL', 'DE', 'DEL', 'LOS', 'LAS', 'Y'];
  const palabras = textoLimpio
    .split(/\s+/)
    .filter(p => p.length >= 1); // Aceptar todas las palabras, incluso de 1 letra

  if (palabras.length === 0) return [];

  // Filtrar palabras significativas
  const palabrasSignificativas = palabras.filter(p => 
    p.length >= 2 && !palabrasIgnorar.includes(p.toUpperCase())
  );

  // Si hay palabras significativas, usarlas; sino usar todas
  const palabrasBuscar = palabrasSignificativas.length > 0 ? palabrasSignificativas : palabras;

  // Buscar que AL MENOS UNA palabra coincida en NOMBRES o APELLIDOS
  const condiciones = palabrasBuscar.map(() =>
    '(UPPER(NOMBRES) CONTAINING UPPER(?) OR UPPER(APELLIDOS) CONTAINING UPPER(?))'
  ).join(' OR ');

  const params = [];
  for (const p of palabrasBuscar) {
    params.push(p, p);
  }

  const sql = `
    SELECT FIRST 50 ID, NOMBRES, APELLIDOS, TELEFONO
    FROM CLIENTESV2
    WHERE ACTIVO = 1
      AND (${condiciones})
    ORDER BY NOMBRES
  `;
  
  const rows = await query(sql, params);
  
  // Mapear resultados
  const resultados = rows.map(r => ({
    ID: r.ID,
    NOMBRE: ((r.NOMBRES || '').trim() + ' ' + (r.APELLIDOS || '').trim()).trim(),
    TELEFONO: r.TELEFONO || '',
    _nombreCompleto: ((r.NOMBRES || '') + ' ' + (r.APELLIDOS || '')).toUpperCase().trim(),
  }));

  // Filtro adicional en JavaScript: priorizar coincidencias exactas del texto completo
  const textoUpper = textoLimpio.toUpperCase();
  const conCoincidenciaExacta = resultados.filter(r => 
    r._nombreCompleto.includes(textoUpper)
  );

  if (conCoincidenciaExacta.length > 0) {
    return conCoincidenciaExacta.slice(0, 30).map(r => ({
      ID: r.ID,
      NOMBRE: r.NOMBRE,
      TELEFONO: r.TELEFONO,
    }));
  }

  // Si no hay coincidencia exacta, retornar todos los resultados
  return resultados.slice(0, 30).map(r => ({
    ID: r.ID,
    NOMBRE: r.NOMBRE,
    TELEFONO: r.TELEFONO,
  }));
}

export async function obtenerClientes() {
  const sql = `
    SELECT FIRST 200 ID, NOMBRES, APELLIDOS, TELEFONO
    FROM CLIENTESV2
    WHERE ACTIVO = 1
    ORDER BY NOMBRES
  `;
  const rows = await query(sql);
  return rows.map(r => ({
    ID: r.ID,
    NOMBRE: ((r.NOMBRES || '').trim() + ' ' + (r.APELLIDOS || '').trim()).trim(),
    TELEFONO: r.TELEFONO || '',
  }));
}

// ── Ventas (crear ticket en Eleventa) ───────────
export async function obtenerSiguienteFolio() {
  const sql = 'SELECT MAX(FOLIO) as MAX_FOLIO FROM VENTATICKETS';
  const rows = await query(sql);
  return (rows[0]?.MAX_FOLIO || 0) + 1;
}

export async function obtenerTurnoActivo() {
  const ctx = await obtenerContextoTurnoActivo();
  return ctx.turnoId;
}

export async function obtenerContextoTurnoActivo() {
  // Preferir un turno abierto (TERMINO_EN IS NULL). Si no hay, usar el último.
  const sql = `
    SELECT FIRST 1 ID, ID_CAJA, ID_CAJERO
    FROM TURNOS
    WHERE TERMINO_EN IS NULL
    ORDER BY ID DESC
  `;
  const abiertos = await query(sql);
  if (abiertos[0]?.ID) {
    return {
      turnoId: abiertos[0].ID,
      cajaId: abiertos[0].ID_CAJA || null,
      cajeroId: abiertos[0].ID_CAJERO || null,
    };
  }

  const ultSql = `SELECT FIRST 1 ID, ID_CAJA, ID_CAJERO FROM TURNOS ORDER BY ID DESC`;
  const rows = await query(ultSql);
  return {
    turnoId: rows[0]?.ID || 1,
    cajaId: rows[0]?.ID_CAJA || null,
    cajeroId: rows[0]?.ID_CAJERO || null,
  };
}

function normalizarFormaPago(formaPago) {
  if (!formaPago) return 'e';
  const f = String(formaPago).trim().toLowerCase();
  if (['e', 'efectivo', 'cash'].includes(f)) return 'e';
  if (['t', 'tarjeta', 'card', 'debito', 'débito', 'credito', 'crédito'].includes(f)) return 't';
  if (['c', 'credito', 'crédito'].includes(f)) return 'c';
  if (['v', 'vale', 'vales'].includes(f)) return 'v';
  // Si llega algo como "EFECTIVO   " o "TARJETA", intentar mapear por prefijo.
  if (f.startsWith('efect')) return 'e';
  if (f.startsWith('tarj')) return 't';
  if (f.startsWith('cred')) return 'c';
  if (f.startsWith('vale')) return 'v';
  return f.length === 1 ? f : 'e';
}

export async function crearVentaEleventa(orden, productos, clienteNombre, formaPago, clienteId) {
  const folio = await obtenerSiguienteFolio();
  const { turnoId, cajaId, cajeroId } = await obtenerContextoTurnoActivo();
  const ahora = new Date();

  const formaPagoNorm = normalizarFormaPago(formaPago);

  const total = productos.reduce((sum, p) => sum + (p.cantidad * p.precio), 0);
  const numArticulos = productos.reduce((sum, p) => sum + p.cantidad, 0);

  const result = await executeTransaction(async (trQuery) => {
    // 1. Insert ticket (todos los campos que Eleventa requiere)
    await trQuery(`
      INSERT INTO VENTATICKETS (
        FOLIO, NOMBRE, TOTAL, SUBTOTAL, PAGO_CON,
        VENDIDO_EN, PAGADO_EN, ESTA_ABIERTO, TURNO_ID,
        CAJA_ID, CAJERO_ID, OPERACION_ID,
        FORMA_PAGO, NUMERO_ARTICULOS, CREADO_EN,
        TOTAL_FACTURABLE, IMPUESTOS, GANANCIA,
        ESTA_CANCELADO, ES_MODIFICABLE, ACTIVO,
        IMPRIMIR_NOTA, IMPRIMIR_DATOS_CLIENTE,
        TIPO_DE_CAMBIO, TOTAL_DEVUELTO, TOTAL_AHORRADO,
        TOTAL_CREDITO, SALDO_CREDITO, IMPUESTOS_RETENIDOS,
        CLIENTESV2_ID, REFERENCIA
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, 'f', ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, 0, 0,
        'f', 't', 't',
        't', 'f',
        1, 0, 0,
        0, 0, 0,
        ?, ''
      )
    `, [
      folio, clienteNombre, total, total, total,
      ahora, ahora, turnoId,
      cajaId || 1, cajeroId || 1, -1,
      formaPagoNorm, numArticulos, ahora,
      total, // TOTAL_FACTURABLE
      clienteId || 1, // CLIENTESV2_ID
    ]);

    // 2. Get the ticket ID via SELECT (RETURNING no soportado por node-firebird)
    const ticketRows = await trQuery(
      'SELECT FIRST 1 ID FROM VENTATICKETS WHERE FOLIO = ? ORDER BY ID DESC',
      [folio]
    );
    const ticketId = ticketRows[0]?.ID;
    if (!ticketId) throw new Error('No se pudo obtener el ID del ticket insertado');

    // 3. Insert articles + inventory history + update balances
    for (const prod of productos) {
      // Insert article
      await trQuery(`
        INSERT INTO VENTATICKETS_ARTICULOS (
          TICKET_ID, PRODUCTO_CODIGO, PRODUCTO_NOMBRE, CANTIDAD, 
          PRECIO_USADO, PRECIO_FINAL, TOTAL_ARTICULO, PAGADO_EN, AGREGADO_EN,
          PORCENTAJE_PAGADO, PORCENTAJE_DESCUENTO,
          IMPUESTO_UNITARIO, IMPUESTOS_USADOS,
          CANTIDAD_DEVUELTA, FUE_DEVUELTO, USA_MAYOREO,
          GANANCIA, DEPARTAMENTO_ID
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
          1000000, 0,
          0, ',',
          0, 'f', 'f',
          0, 4
        )
      `, [
        ticketId, prod.codigo, prod.descripcion, prod.cantidad,
        prod.precio, prod.precio, prod.cantidad * prod.precio, ahora, ahora,
      ]);

      // Get PRODUCTO_ID and current stock for inventory history
      const prodRows = await trQuery(
        'SELECT ID, PCOSTO FROM PRODUCTOS WHERE CODIGO = ?',
        [prod.codigo]
      );
      if (prodRows.length > 0) {
        const productoId = prodRows[0].ID;
        const costoUnitario = prodRows[0].PCOSTO || 0;

        // Get current stock
        const balRows = await trQuery(
          'SELECT CANTIDAD_ACTUAL FROM INVENTARIO_BALANCES WHERE PRODUCTO_ID = ? AND ALMACEN_ID = 1',
          [productoId]
        );
        const stockAnterior = balRows[0]?.CANTIDAD_ACTUAL || 0;

        // Insert inventory history record
        await trQuery(`
          INSERT INTO INVENTARIO_HISTORIAL (
            PRODUCTO_ID, CUANDO_FUE, CANTIDAD_ANTERIOR, CANTIDAD,
            DESCRIPCION, COSTO_UNITARIO, COSTO_DESPUES,
            VENTA_ID, CAJA_ID, USUARIO_ID, ALMACEN_ID, VENTA_POR_KIT
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'f')
        `, [
          productoId, ahora, stockAnterior, prod.cantidad,
          `Venta #${folio}`, costoUnitario, costoUnitario,
          ticketId, cajaId || 1, cajeroId || 1,
        ]);

        // Update inventory balance
        await trQuery(
          'UPDATE INVENTARIO_BALANCES SET CANTIDAD_ACTUAL = CANTIDAD_ACTUAL - ? WHERE PRODUCTO_ID = ? AND ALMACEN_ID = 1',
          [prod.cantidad, productoId]
        );
      }
    }

    return { folio, ticketId, total };
  });

  return result;
}

// ── Facturas (consulta de ventas) ───────────────
export async function obtenerFacturas({ fecha, fechaHasta, folio, cliente, limite = 100 } = {}) {
  let where = ['v.ESTA_CANCELADO = \'f\''];
  const params = [];

  if (fecha) {
    const desde = `${fecha} 00:00:00`;
    const hasta = fechaHasta ? `${fechaHasta} 23:59:59` : `${fecha} 23:59:59`;
    where.push('v.VENDIDO_EN BETWEEN ? AND ?');
    params.push(desde, hasta);
  }
  if (folio) {
    where.push('v.FOLIO = ?');
    params.push(parseInt(folio));
  }
  if (cliente) {
    where.push('UPPER(v.NOMBRE) LIKE UPPER(?)');
    params.push(`%${cliente}%`);
  }

  const sql = `
    SELECT FIRST ${parseInt(limite)}
      v.ID, v.FOLIO, v.NOMBRE, v.TOTAL, v.SUBTOTAL,
      v.VENDIDO_EN, v.FORMA_PAGO, v.NUMERO_ARTICULOS,
      v.PAGO_CON, v.ESTA_CANCELADO
    FROM VENTATICKETS v
    WHERE ${where.join(' AND ')}
    ORDER BY v.VENDIDO_EN DESC
  `;
  return query(sql, params);
}

export async function obtenerDetalleFactura(ticketId) {
  const sql = `
    SELECT
      a.PRODUCTO_CODIGO, a.PRODUCTO_NOMBRE, a.CANTIDAD,
      a.PRECIO_USADO, a.PRECIO_FINAL, a.TOTAL_ARTICULO
    FROM VENTATICKETS_ARTICULOS a
    WHERE a.TICKET_ID = ?
    ORDER BY a.ID
  `;
  return query(sql, [ticketId]);
}

export async function testFirebirdConnection() {
  try {
    const opts = getOptions();
    const result = await new Promise((resolve, reject) => {
      Firebird.attach(opts, (err, db) => {
        if (err) return reject(err);
        db.query('SELECT 1 FROM RDB$DATABASE', (err, result) => {
          db.detach();
          if (err) return reject(err);
          resolve(result);
        });
      });
    });
    return { success: true, message: 'Conexión exitosa' };
  } catch (err) {
    throw new Error(`Error de conexión Firebird: ${err.message}`);
  }
}

export { query, execute };
