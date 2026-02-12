import { Bot, InlineKeyboard } from 'grammy';
import { emitBotStatus, emitNuevaOrden } from '../socket.js';
import { crearOrden } from '../db/sqlite.js';
import {
  buscarProductos,
  obtenerProductos,
  obtenerTodosProductos,
  buscarClientes,
  obtenerClientes,
  verificarStock,
} from '../db/firebird.js';

/*
 * Flujo interactivo de creación de orden:
 *
 * 1. Usuario escribe nombre → Bot busca clientes en Firebird → botones para confirmar
 * 2. Cliente confirmado → Bot pide que escriba los productos
 * 3. Usuario escribe productos → Bot verifica stock de cada uno
 *    - Con stock: muestra info y precio → confirmar
 *    - Sin stock: permite omitir o editar cantidad
 * 4. Resumen final con precios → confirmar o editar
 * 5. Se crea la orden
 */

export class BotManager {
  constructor(io) {
    this.io = io;
    this.bot = null;
    this.running = false;
    this.status = 'stopped';
    this.productosCache = [];
    this.todosProductosCache = [];
    this.clientesCache = [];
    this.userSessions = new Map();
  }

  getStatus() {
    return { status: this.status, running: this.running };
  }

  _getSession(userId) {
    return this.userSessions.get(userId) || null;
  }

  _setSession(userId, data) {
    this.userSessions.set(userId, { ...data, timestamp: Date.now() });
  }

  _clearSession(userId) {
    this.userSessions.delete(userId);
  }

  // ── Start / Stop ──────────────────────────────
  async start(token) {
    if (this.running) return { success: false, error: 'El bot ya está activo' };
    try {
      this.status = 'starting';
      emitBotStatus({ status: 'starting' });

      this.bot = new Bot(token);
      this._registerHandlers();
      await this._cargarCaches();

      this.bot.start({
        onStart: () => {
          this.running = true;
          this.status = 'running';
          emitBotStatus({ status: 'running' });
          console.log('🤖 Bot de Telegram iniciado');
        },
      });

      this.bot.catch((err) => {
        console.error('❌ Bot error:', err.message);
        this.status = 'error';
        this.running = false;
        emitBotStatus({ status: 'error', error: err.message });
      });

      return { success: true };
    } catch (err) {
      this.status = 'error';
      this.running = false;
      emitBotStatus({ status: 'error', error: err.message });
      return { success: false, error: err.message };
    }
  }

  async stop() {
    if (!this.running || !this.bot) {
      return { success: false, error: 'El bot no está activo' };
    }
    try {
      this.status = 'stopping';
      emitBotStatus({ status: 'stopping' });
      await this.bot.stop();
      this.bot = null;
      this.running = false;
      this.status = 'stopped';
      emitBotStatus({ status: 'stopped' });
      console.log('⏹️ Bot de Telegram detenido');
      return { success: true };
    } catch (err) {
      this.status = 'error';
      return { success: false, error: err.message };
    }
  }

  async _cargarCaches() {
    try {
      this.todosProductosCache = await obtenerTodosProductos();
      this.productosCache = this.todosProductosCache.filter(p => Number(p.STOCK) > 0);
      console.log(`📦 ${this.todosProductosCache.length} productos totales (${this.productosCache.length} con stock) cargados en caché`);
    } catch (e) {
      console.warn('⚠️ No se pudo cargar caché de productos:', e.message);
      this.todosProductosCache = [];
      this.productosCache = [];
    }
    try {
      const rows = await obtenerClientes();
      this.clientesCache = rows.map((r) => r.NOMBRE).filter(Boolean);
      console.log(`👥 ${this.clientesCache.length} clientes cargados en caché`);
    } catch (e) {
      console.warn('⚠️ No se pudo cargar caché de clientes:', e.message);
      this.clientesCache = [];
    }
  }

  // ════════════════════════════════════════════════
  //  REGISTER HANDLERS
  // ════════════════════════════════════════════════
  _registerHandlers() {
    const bot = this.bot;

    // ── /start ──
    bot.command('start', async (ctx) => {
      this._clearSession(ctx.from.id);
      const kb = new InlineKeyboard()
        .text('🛒 Nuevo Pedido', 'nuevo_pedido')
        .text('📦 Ver Productos', 'ver_productos')
        .row()
        .text('❓ Ayuda', 'cmd_ayuda');

      await ctx.reply(
        `🛒 *Bot de Ventas — Eleventa*\n\n` +
        `¡Hola ${ctx.from.first_name}!\n\n` +
        `Para crear un pedido simplemente escribe el *nombre del cliente*.\n` +
        `Yo buscaré las coincidencias en la base de datos y tú confirmas cuál es.\n\n` +
        `Luego me dices los productos y yo verifico stock y precios antes de crear la orden.`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
    });

    // ── /ayuda ──
    bot.command(['ayuda', 'help'], (ctx) => this._enviarAyuda(ctx));

    // ── /cancelar ──
    bot.command('cancelar', async (ctx) => {
      const session = this._getSession(ctx.from.id);
      if (session) {
        this._clearSession(ctx.from.id);
        await ctx.reply('❌ Pedido cancelado.');
      } else {
        await ctx.reply('ℹ️ No hay ningún pedido en proceso.');
      }
    });

    // ── /pedido, /p ──
    bot.command(['pedido', 'p'], async (ctx) => {
      this._clearSession(ctx.from.id);
      this._setSession(ctx.from.id, { paso: 'esperando_cliente' });
      await ctx.reply(
        '👤 *Nuevo Pedido*\n\nEscribe el nombre del cliente para buscarlo en la base de datos:',
        { parse_mode: 'Markdown' }
      );
    });

    // ── /stock, /s ──
    bot.command(['stock', 's'], async (ctx) => {
      const texto = ctx.match;
      if (!texto) return ctx.reply('Uso: `/stock nombre_producto`', { parse_mode: 'Markdown' });
      try {
        const productos = await buscarProductos(texto);
        if (!productos.length) return ctx.reply(`❌ No se encontraron productos con "${texto}"`);
        let msg = `📦 *Resultados para "${texto}":*\n\n`;
        for (const p of productos.slice(0, 15)) {
          const icon = p.STOCK > 0 ? '✅' : '❌';
          msg += `${icon} *${p.DESCRIPCION}*\n   \`${p.CODIGO}\` | Stock: ${p.STOCK} | $${Number(p.PRECIO).toFixed(2)}\n\n`;
        }
        if (productos.length > 15) msg += `_...y ${productos.length - 15} más_`;
        await ctx.reply(msg, { parse_mode: 'Markdown' });
      } catch (err) {
        await ctx.reply(`⚠️ Error: ${err.message}`);
      }
    });

    // ── /cliente, /c ──
    bot.command(['cliente', 'c'], async (ctx) => {
      const texto = ctx.match;
      if (!texto) return ctx.reply('Uso: `/cliente nombre`', { parse_mode: 'Markdown' });
      await this._buscarYMostrarClientes(ctx, texto, false);
    });

    // ── /productos ──
    bot.command('productos', async (ctx) => {
      try {
        const prods = this.productosCache.length > 0
          ? this.productosCache.slice(0, 20)
          : (await obtenerProductos()).slice(0, 20);
        if (!prods.length) return ctx.reply('📦 No hay productos con stock');
        let msg = '📦 *Productos con Stock:*\n\n';
        for (const p of prods) {
          msg += `• *${p.DESCRIPCION}*\n  \`${p.CODIGO}\` — Stock: ${p.STOCK} — $${Number(p.PRECIO).toFixed(2)}\n`;
        }
        await ctx.reply(msg, { parse_mode: 'Markdown' });
      } catch (err) {
        await ctx.reply(`⚠️ Error: ${err.message}`);
      }
    });

    // ── /buscar, /b ──
    bot.command(['buscar', 'b'], async (ctx) => {
      const texto = ctx.match;
      if (!texto) return ctx.reply('Uso: `/buscar texto`', { parse_mode: 'Markdown' });
      try {
        const [clientes, productos] = await Promise.all([
          buscarClientes(texto),
          buscarProductos(texto),
        ]);
        let msg = `🔍 *Resultados para "${texto}":*\n\n`;
        if (clientes.length) {
          msg += '👥 *Clientes:*\n';
          clientes.slice(0, 10).forEach((c) => { msg += `  • ${c.NOMBRE}\n`; });
          msg += '\n';
        }
        if (productos.length) {
          msg += '📦 *Productos:*\n';
          productos.slice(0, 10).forEach((p) => {
            msg += `  ${p.STOCK > 0 ? '✅' : '❌'} ${p.DESCRIPCION} (${p.STOCK}) — $${Number(p.PRECIO).toFixed(2)}\n`;
          });
        }
        if (!clientes.length && !productos.length) msg += '❌ Sin resultados';
        await ctx.reply(msg, { parse_mode: 'Markdown' });
      } catch (err) {
        await ctx.reply(`⚠️ Error: ${err.message}`);
      }
    });

    // ── /ordenes, /o ──
    bot.command(['ordenes', 'o'], async (ctx) => {
      const { contarOrdenesPorEstado } = await import('../db/sqlite.js');
      const conteos = contarOrdenesPorEstado();
      const iconos = { pendiente: '⏳', aprobado: '✅', empacado: '📦', despachado: '🚚', cancelado: '❌' };
      let msg = '📋 *Estado de Órdenes:*\n\n';
      for (const { estado, total } of conteos) {
        msg += `${iconos[estado] || '•'} *${estado}:* ${total}\n`;
      }
      if (!conteos.length) msg += '_No hay órdenes registradas_';
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    // ════════════════════════════════════════════
    //  CALLBACK QUERIES
    // ════════════════════════════════════════════
    bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;
      try {
        if (data === 'nuevo_pedido') {
          await ctx.answerCallbackQuery();
          this._clearSession(ctx.from.id);
          this._setSession(ctx.from.id, { paso: 'esperando_cliente' });
          return ctx.reply('👤 Escribe el *nombre del cliente* para buscarlo:', { parse_mode: 'Markdown' });
        }
        if (data === 'ver_productos') {
          await ctx.answerCallbackQuery();
          return ctx.reply('Escribe: /productos');
        }
        if (data === 'cmd_ayuda') {
          await ctx.answerCallbackQuery();
          return this._enviarAyuda(ctx);
        }
        if (data.startsWith('sel_cli:')) {
          return this._onClienteSeleccionado(ctx, data.substring(8));
        }
        if (data === 'buscar_otro_cliente') {
          await ctx.answerCallbackQuery();
          this._setSession(ctx.from.id, { paso: 'esperando_cliente' });
          return ctx.reply('👤 Escribe otro nombre para buscar:');
        }
        if (data.startsWith('prod_ok:')) {
          return this._onProductoConfirmado(ctx, data);
        }
        if (data.startsWith('prod_skip:')) {
          return this._onProductoOmitido(ctx, data);
        }
        if (data.startsWith('prod_retry:')) {
          return this._onReintentarProducto(ctx, data);
        }
        if (data.startsWith('prod_sel:')) {
          return this._onProductoElegido(ctx, data);
        }
        if (data.startsWith('precio_normal:')) {
          return this._onPrecioNormal(ctx, data);
        }
        if (data.startsWith('precio_especial:')) {
          return this._onPrecioEspecialSolicitar(ctx, data);
        }
        if (data === 'agregar_mas_productos') {
          return this._onAgregarMasProductos(ctx);
        }
        if (data === 'orden_confirmar') {
          return this._pedirNota(ctx);
        }
        if (data === 'orden_sin_nota') {
          return this._onOrdenConfirmada(ctx, '');
        }
        if (data === 'orden_cancelar') {
          await ctx.answerCallbackQuery({ text: 'Pedido cancelado' });
          this._clearSession(ctx.from.id);
          return ctx.editMessageText('❌ Pedido cancelado.');
        }
        if (data.startsWith('prod_edit_qty:')) {
          return this._onEditarCantidad(ctx, data);
        }
        if (data.startsWith('prod_remove:')) {
          return this._onQuitarProducto(ctx, data);
        }
        await ctx.answerCallbackQuery({ text: 'Acción no reconocida' });
      } catch (err) {
        console.error('Callback error:', err);
        await ctx.answerCallbackQuery({ text: '⚠️ Error' }).catch(() => {});
      }
    });

    // ════════════════════════════════════════════
    //  TEXT MESSAGES — flujo interactivo
    // ════════════════════════════════════════════
    bot.on('message:text', async (ctx) => {
      const texto = ctx.message.text.trim();
      if (texto.startsWith('/')) return;

      const session = this._getSession(ctx.from.id);

      // Esperando nombre de cliente
      if (session?.paso === 'esperando_cliente') {
        return this._buscarYMostrarClientes(ctx, texto, true);
      }

      // Esperando productos
      if (session?.paso === 'esperando_productos') {
        return this._recibirProductos(ctx, texto);
      }

      // Esperando nueva cantidad
      if (session?.paso === 'esperando_cantidad') {
        return this._recibirNuevaCantidad(ctx, texto);
      }

      // Esperando precio especial
      if (session?.paso === 'esperando_precio_especial') {
        return this._recibirPrecioEspecial(ctx, texto);
      }

      // Esperando nota
      if (session?.paso === 'esperando_nota') {
        return this._onOrdenConfirmada(ctx, texto);
      }

      // Reintentando búsqueda de un producto específico
      if (session?.paso === 'reintentando_producto') {
        return this._reintentarBusquedaProducto(ctx, texto);
      }

      // Agregando más productos al pedido existente
      if (session?.paso === 'agregando_productos') {
        return this._recibirProductos(ctx, texto);
      }

      // Sin sesión activa → auto-detectar si es producto o cliente
      if (!session) {
        return this._autoDetectarYBuscar(ctx, texto);
      }

      // Cualquier otro estado con sesión → buscar cliente
      return this._buscarYMostrarClientes(ctx, texto, true);
    });
  }

  // ════════════════════════════════════════════════
  //  AUTO-DETECTAR: ¿CLIENTE O PRODUCTO?
  // ════════════════════════════════════════════════
  _looksLikeProduct(texto) {
    const t = texto.toUpperCase().trim();
    // Tiene patrón de dimensiones: 8x12, 8X12, 812
    if (/\d+\s*[xX]\s*\d+/.test(t)) return true;
    // Empieza con número + texto ("10 bolsa...", "5 t40...")
    if (/^\d+\s+\S/.test(t)) return true;
    // Contiene T+número (T40, T15, T 20)
    if (/\bT\s*\d+/i.test(t)) return true;
    // Contiene dimensiones compactas (812, 1216, 1420)
    if (/\b\d{3,4}\b/.test(t) && !/\b\d{5,}\b/.test(t)) return true;
    // Contiene palabras típicas de productos
    if (/\b(bolsa|negra|negro|blanca|blanco|rollo|camiseta|vaso|hermetica|opaca|fina|marcada|basurera)\b/i.test(t)) return true;
    return false;
  }

  async _autoDetectarYBuscar(ctx, texto) {
    if (this._looksLikeProduct(texto)) {
      // Parece producto → preguntar si quiere iniciar pedido o solo consultar
      const resultados = await this._buscarProductoEnDB(texto);
      if (resultados.length > 0) {
        let msg = `📦 *Resultados para "${texto}":*\n\n`;
        for (const p of resultados.slice(0, 6)) {
          const stock = Number(p.STOCK || 0);
          const precio = Number(p.PRECIO || 0);
          const icon = stock > 0 ? '✅' : '❌';
          msg += `${icon} *${p.DESCRIPCION}*\n   Stock: ${stock} — $${precio.toFixed(2)}\n\n`;
        }
        msg += `_Para crear un pedido, escribe el nombre del cliente._`;
        await ctx.reply(msg, { parse_mode: 'Markdown' });
        return;
      }
    }
    // Por defecto → buscar como cliente e iniciar flujo
    return this._buscarYMostrarClientes(ctx, texto, true);
  }

  // ════════════════════════════════════════════════
  //  PASO 1: BUSCAR Y CONFIRMAR CLIENTE
  // ════════════════════════════════════════════════
  async _buscarYMostrarClientes(ctx, texto, iniciarFlujo = false) {
    try {
      const clientes = await buscarClientes(texto);

      if (!clientes.length) {
        const kb = new InlineKeyboard()
          .text('🔄 Buscar otro nombre', 'buscar_otro_cliente');
        return ctx.reply(
          `❌ No se encontró ningún cliente con *"${texto}"*\n\nIntenta con otro nombre.`,
          { parse_mode: 'Markdown', reply_markup: kb }
        );
      }

      const kb = new InlineKeyboard();
      const unicos = [...new Set(clientes.map((c) => c.NOMBRE))];

      for (const nombre of unicos.slice(0, 8)) {
        kb.text(nombre, `sel_cli:${nombre}`).row();
      }
      kb.text('🔄 Buscar otro', 'buscar_otro_cliente');

      let msg = `👥 *Clientes encontrados para "${texto}":*\n\n`;
      unicos.slice(0, 8).forEach((n, i) => {
        msg += `${i + 1}. ${n}\n`;
      });
      msg += '\n_Selecciona el cliente correcto:_';

      if (iniciarFlujo) {
        this._setSession(ctx.from.id, { paso: 'seleccionando_cliente', busqueda: texto });
      }

      await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: kb });
    } catch (err) {
      await ctx.reply(`⚠️ Error al buscar clientes: ${err.message}`);
    }
  }

  async _onClienteSeleccionado(ctx, clienteNombre) {
    await ctx.answerCallbackQuery({ text: `✅ ${clienteNombre}` });

    this._setSession(ctx.from.id, {
      paso: 'esperando_productos',
      cliente: clienteNombre,
      productos_texto: '',
      productos_confirmados: [],
      productos_pendientes: [],
      producto_actual_idx: 0,
    });

    await ctx.editMessageText(
      `✅ *Cliente:* ${clienteNombre}\n\n` +
      `📝 Ahora escribe los productos del pedido.\n` +
      `Un producto por línea con la cantidad:\n\n` +
      '```\n10 bolsa 8x12 negra\n5 camiseta blanca\n20 vaso desechable\n```\n\n' +
      `_Escribe /cancelar para cancelar el pedido_`,
      { parse_mode: 'Markdown' }
    );
  }

  // ════════════════════════════════════════════════
  //  PASO 2: RECIBIR PRODUCTOS Y VERIFICAR STOCK
  // ════════════════════════════════════════════════
  async _recibirProductos(ctx, texto) {
    const session = this._getSession(ctx.from.id);
    if (!session) return;

    const productosParsed = this._parsearProductos(texto);

    if (!productosParsed.length) {
      return ctx.reply(
        '⚠️ No pude interpretar los productos.\n\n' +
        'Escribe en formato:\n`10 nombre del producto`\n`5 otro producto`',
        { parse_mode: 'Markdown' }
      );
    }

    await ctx.reply(`🔍 Verificando ${productosParsed.length} producto(s) en inventario...`);

    // Search each product in Firebird
    const productosVerificados = [];
    for (const prod of productosParsed) {
      const coincidencias = await this._buscarProductoEnDB(prod.descripcion);
      productosVerificados.push({
        original: prod.descripcion,
        cantidad: prod.cantidad,
        coincidencias,
        confirmado: null,
      });
    }

    session.paso = 'verificando_stock';
    session.productos_pendientes = productosVerificados;
    // Preservar productos ya confirmados si estamos agregando más
    if (!session.productos_confirmados) session.productos_confirmados = [];
    session.producto_actual_idx = 0;
    session.productos_texto = (session.productos_texto ? session.productos_texto + '\n' : '') + texto;
    this._setSession(ctx.from.id, session);

    await this._mostrarSiguienteProducto(ctx);
  }

  // ════════════════════════════════════════════════
  //  BÚSQUEDA INTELIGENTE DE PRODUCTOS
  // ════════════════════════════════════════════════

  /**
   * Normaliza texto: mayúsculas, sin acentos, sin puntuación.
   * También expande dimensiones compactas: 812 → 8X12, 1216 → 12X16
   */
  _normalizarTexto(texto) {
    let t = texto
      .toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[.,;:!?()\[\]{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Expandir dimensiones compactas: "812" → "8X12", "1014" → "10X14", "1216" → "12X16"
    t = t.replace(/\b(\d{1,2})(\d{2})\b/g, (match, a, b) => {
      const numA = parseInt(a);
      const numB = parseInt(b);
      // Solo expandir si parece dimensión razonable (ambos entre 4 y 50)
      if (numA >= 4 && numA <= 50 && numB >= 4 && numB <= 50 && numB > numA) {
        return `${numA}X${numB}`;
      }
      return match;
    });

    return t;
  }

  /**
   * Genera variaciones de género y número de una palabra.
   * blanco ↔ blanca, negros ↔ negras, bolsa ↔ bolsas, etc.
   */
  _variacionesGenero(palabra) {
    const v = new Set([palabra]);
    // Swap femenino ↔ masculino
    if (palabra.endsWith('A') && !palabra.endsWith('IA')) v.add(palabra.slice(0, -1) + 'O');
    if (palabra.endsWith('O')) v.add(palabra.slice(0, -1) + 'A');
    if (palabra.endsWith('AS')) v.add(palabra.slice(0, -2) + 'OS');
    if (palabra.endsWith('OS')) v.add(palabra.slice(0, -2) + 'AS');
    // Singular ↔ plural
    if (palabra.endsWith('S') && palabra.length > 2 && !palabra.endsWith('SS')) {
      v.add(palabra.slice(0, -1));
    }
    if (!palabra.endsWith('S')) {
      v.add(palabra + 'S');
    }
    return [...v];
  }

  /**
   * Verifica si `needle` aparece en `haystack`, permitiendo separadores
   * opcionales (espacios, guiones, /) en transiciones letra↔número.
   *
   * "T40"  → coincide con "T 40", "T-40", "T40"
   * "8X12" → coincide con "8X12", "8 X 12", "8-X-12"
   */
  _coincideFlexible(haystack, needle) {
    if (!needle || !haystack) return false;
    const n = needle.toUpperCase();
    const h = haystack.toUpperCase();
    // Quick exact check
    if (h.includes(n)) return true;

    // Build regex with optional separators at letter↔number transitions
    let pattern = '';
    for (let i = 0; i < n.length; i++) {
      const c = n[i];
      const prev = i > 0 ? n[i - 1] : '';
      const isLetterToNum = /[A-Z]/.test(prev) && /\d/.test(c);
      const isNumToLetter = /\d/.test(prev) && /[A-Z]/.test(c);
      if (isLetterToNum || isNumToLetter) {
        pattern += '[\\s\\-\\/]?';
      }
      pattern += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    try {
      return new RegExp(pattern, 'i').test(h);
    } catch {
      return false;
    }
  }

  /**
   * Puntúa qué tan bien coincide una descripción de producto con los tokens de búsqueda.
   * Retorna 0 si la cobertura no es suficiente.
   */
  _puntuarProducto(descripcion, tokensBusqueda) {
    const descNorm = this._normalizarTexto(descripcion);
    const palabrasDesc = descNorm.split(/[\s\-\/]+/).filter(t => t.length > 0);
    let tokensEncontrados = 0;
    let totalScore = 0;

    for (const token of tokensBusqueda) {
      if (!token) continue;
      const variaciones = this._variacionesGenero(token);
      let encontrado = false;
      let mejorScore = 0;

      for (const variacion of variaciones) {
        // 1. Flexible containment (T40 → T 40)
        if (this._coincideFlexible(descNorm, variacion)) {
          mejorScore = Math.max(mejorScore, variacion.length * 3);
          encontrado = true;
          break;
        }
        // 2. Prefix match on individual words (min 3 chars: "opc" → "OPACO")
        if (variacion.length >= 3) {
          for (const palabra of palabrasDesc) {
            if (palabra.startsWith(variacion)) {
              mejorScore = Math.max(mejorScore, variacion.length * 2);
              encontrado = true;
              break;
            }
          }
        }
        if (encontrado) break;
      }

      if (encontrado) {
        tokensEncontrados++;
        totalScore += mejorScore;
      }
    }

    const cobertura = tokensBusqueda.length > 0 ? tokensEncontrados / tokensBusqueda.length : 0;
    // Un solo token: exigir 100%. Varios tokens: aceptar ≥50%
    const minCobertura = tokensBusqueda.length === 1 ? 1.0 : 0.5;
    if (cobertura < minCobertura) return 0;

    let bonus = totalScore * cobertura;

    // Bonus: productos x10 tienen prioridad sobre x50/x100 cuando
    // no se especificó la presentación
    const descUp = descripcion.toUpperCase();
    const tienePresent = tokensBusqueda.some(t => /^X?\d+$/.test(t) && parseInt(t.replace('X','')) >= 10);
    if (!tienePresent) {
      if (/\bX\s*10\b/.test(descUp) || /\bX10\b/.test(descUp)) bonus += 5;
      else if (/\bX\s*50\b/.test(descUp) || /\bX50\b/.test(descUp)) bonus -= 2;
      else if (/\bX\s*100\b/.test(descUp) || /\bX100\b/.test(descUp)) bonus -= 3;
    }

    return bonus;
  }

  /**
   * Busca un producto por descripción usando fuzzy matching inteligente.
   * 1. Busca en caché scoring cada producto
   * 2. Si no hay resultados, busca en DB con variaciones de tokens
   */
  async _buscarProductoEnDB(descripcion) {
    try {
      const tokensBusqueda = this._normalizarTexto(descripcion)
        .split(/\s+/)
        .filter(t => t.length > 0);
      if (tokensBusqueda.length === 0) return [];

      // 1. Smart fuzzy search in cache (all products for better matching)
      const cache = this.todosProductosCache.length > 0
        ? this.todosProductosCache
        : this.productosCache;

      const resultados = [];
      for (const p of cache) {
        const score = this._puntuarProducto(p.DESCRIPCION, tokensBusqueda);
        if (score > 0) {
          resultados.push({ ...p, _score: score });
        }
      }

      resultados.sort((a, b) => b._score - a._score);
      if (resultados.length > 0) return resultados.slice(0, 6);

      // 2. Fallback: DB search with each token + gender/number variations
      const allDbResults = new Map();
      for (const token of tokensBusqueda) {
        const variaciones = this._variacionesGenero(token);
        for (const v of variaciones.slice(0, 3)) {
          try {
            const rows = await buscarProductos(v);
            for (const row of rows) {
              if (!allDbResults.has(row.CODIGO)) allDbResults.set(row.CODIGO, row);
            }
          } catch { /* ignore */ }
        }
      }

      // Score DB results with the same smart matching
      const dbScored = [];
      for (const p of allDbResults.values()) {
        const score = this._puntuarProducto(p.DESCRIPCION, tokensBusqueda);
        if (score > 0) dbScored.push({ ...p, _score: score });
      }
      dbScored.sort((a, b) => b._score - a._score);
      return dbScored.slice(0, 6);
    } catch {
      return [];
    }
  }

  async _mostrarSiguienteProducto(ctx) {
    const session = this._getSession(ctx.from.id);
    if (!session) return;

    const idx = session.producto_actual_idx;
    const pendientes = session.productos_pendientes;

    if (idx >= pendientes.length) {
      return this._mostrarResumenFinal(ctx);
    }

    const prod = pendientes[idx];
    const progreso = `(${idx + 1}/${pendientes.length})`;

    if (prod.coincidencias.length === 0) {
      const kb = new InlineKeyboard()
        .text('🔍 Buscar con otro nombre', `prod_retry:${idx}`)
        .row()
        .text('⏭️ Omitir este producto', `prod_skip:${idx}`)
        .row()
        .text('❌ Cancelar pedido', 'orden_cancelar');

      await ctx.reply(
        `${progreso} ❌ *No encontrado:* "${prod.original}" (×${prod.cantidad})\n\n` +
        `No se encontró en el inventario.\n` +
        `Puedes buscar con otro nombre, omitirlo o cancelar.`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
      return;
    }

    if (prod.coincidencias.length === 1) {
      const match = prod.coincidencias[0];
      const stock = Number(match.STOCK || 0);
      const precio = Number(match.PRECIO || 0);
      const stockOk = stock >= prod.cantidad;

      let msg = `${progreso} 📦 *"${prod.original}"* (×${prod.cantidad})\n\n`;
      msg += `Producto encontrado:\n`;
      msg += `*${match.DESCRIPCION}*\n`;
      msg += `Código: \`${match.CODIGO}\`\n`;
      msg += `Precio: *$${precio.toFixed(2)}*\n`;
      msg += `Stock: ${stockOk ? '✅' : '⚠️'} *${stock}* unidades\n`;

      if (!stockOk && stock > 0) {
        msg += `\n⚠️ _Stock insuficiente (pides ${prod.cantidad}, hay ${stock})_`;
      } else if (stock === 0) {
        msg += `\n❌ _Sin stock disponible_`;
      }

      msg += `\nSubtotal: *$${(precio * prod.cantidad).toFixed(2)}*`;

      const kb = new InlineKeyboard();
      if (stockOk) {
        kb.text(`✅ Confirmar — $${precio.toFixed(2)} c/u`, `prod_ok:${idx}:${match.CODIGO}`);
      } else if (stock > 0) {
        kb.text(`⚠️ Aceptar (stock limitado)`, `prod_ok:${idx}:${match.CODIGO}`);
      }
      kb.row();
      kb.text('⏭️ Omitir', `prod_skip:${idx}`);
      kb.text('✏️ Cambiar cantidad', `prod_edit_qty:${idx}`);
      kb.row();
      kb.text('🔍 Buscar otro nombre', `prod_retry:${idx}`);

      await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: kb });
      return;
    }

    // Multiple matches
    let msg = `${progreso} 📦 *"${prod.original}"* (×${prod.cantidad})\n\n`;
    msg += `Se encontraron *${prod.coincidencias.length}* coincidencias:\n\n`;

    const kb = new InlineKeyboard();
    for (const [i, match] of prod.coincidencias.entries()) {
      const stock = Number(match.STOCK || 0);
      const precio = Number(match.PRECIO || 0);
      const stockIcon = stock >= prod.cantidad ? '✅' : stock > 0 ? '⚠️' : '❌';

      msg += `${i + 1}. ${stockIcon} *${match.DESCRIPCION}*\n`;
      msg += `   \`${match.CODIGO}\` — Stock: ${stock} — $${precio.toFixed(2)}\n\n`;

      kb.text(`${i + 1}. ${match.DESCRIPCION.substring(0, 30)}`, `prod_sel:${idx}:${i}`).row();
    }

    kb.text('⏭️ Omitir', `prod_skip:${idx}`);
    kb.text('🔍 Buscar otro', `prod_retry:${idx}`);
    msg += '_Selecciona el producto correcto:_';

    await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: kb });
  }

  async _onProductoConfirmado(ctx, data) {
    const parts = data.split(':');
    const idx = parseInt(parts[1]);
    const codigo = parts.slice(2).join(':');

    const session = this._getSession(ctx.from.id);
    if (!session) return ctx.answerCallbackQuery({ text: 'Sesión expirada' });

    const prod = session.productos_pendientes[idx];
    const match = prod.coincidencias.find((p) => p.CODIGO === codigo) || prod.coincidencias[0];

    // Guardar producto pendiente de precio y preguntar tipo de precio
    session.producto_pendiente_precio = {
      codigo: match.CODIGO,
      descripcion: match.DESCRIPCION,
      cantidad: prod.cantidad,
      precioNormal: Number(match.PRECIO || 0),
      stock: Number(match.STOCK || 0),
      idx,
    };
    this._setSession(ctx.from.id, session);

    await ctx.answerCallbackQuery({ text: `✅ ${match.DESCRIPCION}` });
    await this._preguntarTipoPrecio(ctx, match, prod.cantidad, idx);
  }

  async _onProductoElegido(ctx, data) {
    const parts = data.split(':');
    const idx = parseInt(parts[1]);
    const matchIdx = parseInt(parts[2]);

    const session = this._getSession(ctx.from.id);
    if (!session) return ctx.answerCallbackQuery({ text: 'Sesión expirada' });

    const prod = session.productos_pendientes[idx];
    const match = prod.coincidencias[matchIdx];
    if (!match) return ctx.answerCallbackQuery({ text: 'Producto no válido' });

    const stock = Number(match.STOCK || 0);
    const precio = Number(match.PRECIO || 0);

    // Guardar producto pendiente de precio y preguntar tipo de precio
    session.producto_pendiente_precio = {
      codigo: match.CODIGO,
      descripcion: match.DESCRIPCION,
      cantidad: prod.cantidad,
      precioNormal: precio,
      stock,
      idx,
    };
    this._setSession(ctx.from.id, session);

    await ctx.answerCallbackQuery({ text: `✅ ${match.DESCRIPCION.substring(0, 40)}` });
    await this._preguntarTipoPrecio(ctx, match, prod.cantidad, idx);
  }

  // ═══════════════════════════════════════════
  //  PRECIO NORMAL vs ESPECIAL
  // ═══════════════════════════════════════════
  async _preguntarTipoPrecio(ctx, match, cantidad, idx) {
    const precio = Number(match.PRECIO || 0);
    const kb = new InlineKeyboard()
      .text(`💲 Normal — $${precio.toFixed(2)}`, `precio_normal:${idx}`)
      .row()
      .text('✏️ Precio Especial', `precio_especial:${idx}`);

    await ctx.reply(
      `💰 *${match.DESCRIPCION}* (×${cantidad})\n\n` +
      `Precio normal: *$${precio.toFixed(2)}*\n` +
      `Subtotal: *$${(precio * cantidad).toFixed(2)}*\n\n` +
      `_¿Facturar a precio normal o precio especial?_`,
      { parse_mode: 'Markdown', reply_markup: kb }
    );
  }

  async _onPrecioNormal(ctx, data) {
    const session = this._getSession(ctx.from.id);
    if (!session?.producto_pendiente_precio) return ctx.answerCallbackQuery({ text: 'Sesión expirada' });

    const pp = session.producto_pendiente_precio;

    session.productos_confirmados.push({
      codigo: pp.codigo,
      descripcion: pp.descripcion,
      cantidad: pp.cantidad,
      precio: pp.precioNormal,
      stock: pp.stock,
    });

    session.producto_actual_idx = pp.idx + 1;
    delete session.producto_pendiente_precio;
    this._setSession(ctx.from.id, session);

    await ctx.answerCallbackQuery({ text: '✅ Precio normal' });
    await ctx.editMessageText(
      `✅ *Confirmado:* ${pp.descripcion}\n` +
      `   ${pp.cantidad} × $${pp.precioNormal.toFixed(2)} = *$${(pp.cantidad * pp.precioNormal).toFixed(2)}*`,
      { parse_mode: 'Markdown' }
    );

    await this._mostrarSiguienteProducto(ctx);
  }

  async _onPrecioEspecialSolicitar(ctx, data) {
    const session = this._getSession(ctx.from.id);
    if (!session?.producto_pendiente_precio) return ctx.answerCallbackQuery({ text: 'Sesión expirada' });

    const pp = session.producto_pendiente_precio;
    session.paso = 'esperando_precio_especial';
    this._setSession(ctx.from.id, session);

    await ctx.answerCallbackQuery();
    await ctx.reply(
      `✏️ *Precio especial para:* ${pp.descripcion} (×${pp.cantidad})\n` +
      `Precio normal: $${pp.precioNormal.toFixed(2)}\n\n` +
      `Escribe el precio especial (solo el número):`,
      { parse_mode: 'Markdown' }
    );
  }

  async _recibirPrecioEspecial(ctx, texto) {
    const session = this._getSession(ctx.from.id);
    if (!session?.producto_pendiente_precio) return;

    const precio = parseFloat(texto.replace(/[,$]/g, ''));
    if (isNaN(precio) || precio <= 0) {
      return ctx.reply('⚠️ Escribe un precio válido (ejemplo: `85.50`)', { parse_mode: 'Markdown' });
    }

    const pp = session.producto_pendiente_precio;

    session.productos_confirmados.push({
      codigo: pp.codigo,
      descripcion: pp.descripcion,
      cantidad: pp.cantidad,
      precio,
      precioOriginal: pp.precioNormal,
      stock: pp.stock,
    });

    session.producto_actual_idx = pp.idx + 1;
    session.paso = 'verificando_stock';
    delete session.producto_pendiente_precio;
    this._setSession(ctx.from.id, session);

    const diff = precio - pp.precioNormal;
    const diffStr = diff >= 0 ? `+$${diff.toFixed(2)}` : `-$${Math.abs(diff).toFixed(2)}`;

    await ctx.reply(
      `✅ *Precio especial aplicado:* ${pp.descripcion}\n` +
      `   ${pp.cantidad} × $${precio.toFixed(2)} = *$${(pp.cantidad * precio).toFixed(2)}*\n` +
      `   _Normal: $${pp.precioNormal.toFixed(2)} (${diffStr})_`,
      { parse_mode: 'Markdown' }
    );

    await this._mostrarSiguienteProducto(ctx);
  }

  async _onProductoOmitido(ctx, data) {
    const idx = parseInt(data.split(':')[1]);

    const session = this._getSession(ctx.from.id);
    if (!session) return ctx.answerCallbackQuery({ text: 'Sesión expirada' });

    const prod = session.productos_pendientes[idx];
    session.producto_actual_idx = idx + 1;
    this._setSession(ctx.from.id, session);

    await ctx.answerCallbackQuery({ text: 'Producto omitido' });
    await ctx.editMessageText(
      `⏭️ _Omitido: "${prod.original}" (×${prod.cantidad})_`,
      { parse_mode: 'Markdown' }
    );

    await this._mostrarSiguienteProducto(ctx);
  }

  async _onEditarCantidad(ctx, data) {
    const idx = parseInt(data.split(':')[1]);

    const session = this._getSession(ctx.from.id);
    if (!session) return ctx.answerCallbackQuery({ text: 'Sesión expirada' });

    session.paso = 'esperando_cantidad';
    session.editando_idx = idx;
    this._setSession(ctx.from.id, session);

    const prod = session.productos_pendientes[idx];
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `✏️ *Editar cantidad para:* "${prod.original}"\n` +
      `Cantidad actual: ${prod.cantidad}\n\nEscribe la nueva cantidad:`,
      { parse_mode: 'Markdown' }
    );
  }

  async _recibirNuevaCantidad(ctx, texto) {
    const session = this._getSession(ctx.from.id);
    if (!session) return;

    const cantidad = parseInt(texto);
    if (isNaN(cantidad) || cantidad < 1) {
      return ctx.reply('⚠️ Escribe un número válido (mínimo 1):');
    }

    const idx = session.editando_idx;
    session.productos_pendientes[idx].cantidad = cantidad;
    session.paso = 'verificando_stock';
    this._setSession(ctx.from.id, session);

    await ctx.reply(`✅ Cantidad actualizada a *${cantidad}*`, { parse_mode: 'Markdown' });
    await this._mostrarSiguienteProducto(ctx);
  }

  async _onReintentarProducto(ctx, data) {
    const idx = parseInt(data.split(':')[1]);

    const session = this._getSession(ctx.from.id);
    if (!session) return ctx.answerCallbackQuery({ text: 'Sesión expirada' });

    const prod = session.productos_pendientes[idx];
    session.paso = 'reintentando_producto';
    session.reintentando_idx = idx;
    this._setSession(ctx.from.id, session);

    await ctx.answerCallbackQuery();
    await ctx.reply(
      `🔍 *Buscando de nuevo:* "${prod.original}" (×${prod.cantidad})\n\n` +
      `Escribe otro nombre o descripción para buscar este producto:`,
      { parse_mode: 'Markdown' }
    );
  }

  async _reintentarBusquedaProducto(ctx, texto) {
    const session = this._getSession(ctx.from.id);
    if (!session) return;

    const idx = session.reintentando_idx;
    const prod = session.productos_pendientes[idx];

    // Buscar con el nuevo texto
    const coincidencias = await this._buscarProductoEnDB(texto);
    prod.coincidencias = coincidencias;
    prod.original = texto; // Actualizar nombre para que se muestre el nuevo

    session.paso = 'verificando_stock';
    // No cambiar producto_actual_idx, seguimos en el mismo
    this._setSession(ctx.from.id, session);

    await this._mostrarSiguienteProducto(ctx);
  }

  async _onAgregarMasProductos(ctx) {
    const session = this._getSession(ctx.from.id);
    if (!session) return ctx.answerCallbackQuery({ text: 'Sesión expirada' });

    session.paso = 'agregando_productos';
    this._setSession(ctx.from.id, session);

    await ctx.answerCallbackQuery();

    const productosYa = session.productos_confirmados.length;
    await ctx.reply(
      `➕ *Agregar más productos*\n\n` +
      `Ya tienes *${productosYa}* producto(s) confirmados para *${session.cliente}*.\n` +
      `Escribe los nuevos productos con cantidad:\n\n` +
      '```\n10 8x12 negra\n5 t40 blanca\n```\n\n' +
      `_Los nuevos se agregarán a los existentes._`,
      { parse_mode: 'Markdown' }
    );
  }

  async _onQuitarProducto(ctx, data) {
    const idx = parseInt(data.split(':')[1]);

    const session = this._getSession(ctx.from.id);
    if (!session) return ctx.answerCallbackQuery({ text: 'Sesión expirada' });

    const removed = session.productos_confirmados.splice(idx, 1);
    this._setSession(ctx.from.id, session);

    await ctx.answerCallbackQuery({ text: `Eliminado: ${removed[0]?.descripcion}` });
    await this._mostrarResumenFinal(ctx);
  }

  // ════════════════════════════════════════════════
  //  PASO 3: RESUMEN FINAL — CONFIRMAR PRECIOS
  // ════════════════════════════════════════════════
  async _mostrarResumenFinal(ctx) {
    const session = this._getSession(ctx.from.id);
    if (!session) return;

    const productos = session.productos_confirmados;

    if (!productos.length) {
      const kb = new InlineKeyboard()
        .text('📝 Escribir productos de nuevo', 'nuevo_pedido')
        .row()
        .text('❌ Cancelar', 'orden_cancelar');
      return ctx.reply(
        '⚠️ No hay productos confirmados en el pedido.\nTodos fueron omitidos.',
        { reply_markup: kb }
      );
    }

    session.paso = 'confirmar_precios';
    this._setSession(ctx.from.id, session);

    const total = productos.reduce((s, p) => s + p.cantidad * p.precio, 0);

    let msg = `📋 *RESUMEN DEL PEDIDO*\n\n`;
    msg += `👤 *Cliente:* ${session.cliente}\n`;
    msg += `${'─'.repeat(28)}\n`;
    msg += `📦 *Productos:*\n\n`;

    for (const [i, p] of productos.entries()) {
      const stockIcon = p.stock >= p.cantidad ? '✅' : '⚠️';
      msg += `${i + 1}. ${stockIcon} *${p.descripcion}*\n`;
      msg += `   ${p.cantidad} × $${p.precio.toFixed(2)} = *$${(p.cantidad * p.precio).toFixed(2)}*\n`;
      if (p.precioOriginal && p.precioOriginal !== p.precio) {
        msg += `   _💲 Precio especial (normal: $${p.precioOriginal.toFixed(2)})_\n`;
      }
      if (p.stock < p.cantidad) msg += `   _⚠️ Stock: ${p.stock}_\n`;
      msg += `\n`;
    }

    msg += `${'─'.repeat(28)}\n`;
    msg += `💰 *TOTAL: $${total.toFixed(2)}*\n\n`;
    msg += `_¿Confirmar para crear la orden?_`;

    const kb = new InlineKeyboard()
      .text('✅ Confirmar Pedido', 'orden_confirmar')
      .row()
      .text('➕ Agregar más productos', 'agregar_mas_productos')
      .row();

    for (const [i, p] of productos.entries()) {
      kb.text(`🗑️ Quitar: ${p.descripcion.substring(0, 22)}`, `prod_remove:${i}`).row();
    }

    kb.text('❌ Cancelar Pedido', 'orden_cancelar');

    await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: kb });
  }

  // ════════════════════════════════════════════════
  //  PASO 4: PEDIR NOTA (OPCIONAL)
  // ════════════════════════════════════════════════
  async _pedirNota(ctx) {
    const session = this._getSession(ctx.from.id);
    if (!session) return ctx.answerCallbackQuery({ text: 'Sesión expirada' });

    session.paso = 'esperando_nota';
    this._setSession(ctx.from.id, session);

    await ctx.answerCallbackQuery();

    const kb = new InlineKeyboard()
      .text('⏭️ Sin nota — Crear orden directamente', 'orden_sin_nota');

    await ctx.reply(
      `📝 *¿Deseas agregar una nota al pedido?*\n\n` +
      `Puedes escribir observaciones, cambios, o cualquier novedad.\n` +
      `Ejemplo: _"Mandar cambio de $500"_, _"Entregar después de las 3pm"_\n\n` +
      `Escribe la nota o presiona el botón para continuar sin nota:`,
      { parse_mode: 'Markdown', reply_markup: kb }
    );
  }

  // ════════════════════════════════════════════════
  //  PASO 5: CREAR ORDEN
  // ════════════════════════════════════════════════
  async _onOrdenConfirmada(ctx, nota = '') {
    const session = this._getSession(ctx.from.id);
    if (!session) {
      // Puede ser callback o mensaje
      if (ctx.callbackQuery) return ctx.answerCallbackQuery({ text: 'Sesión expirada' });
      return ctx.reply('⚠️ Sesión expirada. Inicia un nuevo pedido.');
    }

    const productos = session.productos_confirmados;
    const total = productos.reduce((s, p) => s + p.cantidad * p.precio, 0);
    const notaFinal = (nota || '').trim();

    const ordenId = crearOrden({
      telegram_user_id: ctx.from.id,
      telegram_username: ctx.from.username || '',
      telegram_nombre: `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim(),
      mensaje_original: session.productos_texto || '',
      cliente: session.cliente,
      productos: productos.map((p) => `${p.cantidad} ${p.descripcion}`).join('\n'),
      productos_json: JSON.stringify(productos),
      notas: notaFinal,
      total,
      subtotal: total,
    });

    this._clearSession(ctx.from.id);

    let msg = `🎉 *¡Orden #${ordenId} creada exitosamente!*\n\n`;
    msg += `👤 *Cliente:* ${session.cliente}\n`;
    msg += `📦 *Productos:*\n`;
    for (const p of productos) {
      msg += `  • ${p.cantidad}× ${p.descripcion} — $${(p.cantidad * p.precio).toFixed(2)}\n`;
    }
    if (notaFinal) msg += `\n📝 *Nota:* ${notaFinal}\n`;
    msg += `\n💰 *Total:* $${total.toFixed(2)}\n`;
    msg += `⏳ *Estado:* Pendiente`;

    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: `✅ Orden #${ordenId} creada` });
      await ctx.editMessageText(msg, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    }

    const { obtenerOrdenPorId } = await import('../db/sqlite.js');
    const ordenCompleta = obtenerOrdenPorId(ordenId);
    emitNuevaOrden(ordenCompleta);
  }

  // ════════════════════════════════════════════════
  //  HELPERS
  // ════════════════════════════════════════════════
  _parsearProductos(texto) {
    const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
    const productos = [];
    for (const linea of lineas) {
      let match = linea.match(/^(\d+)\s*[xX]?\s+(.+)$/);
      if (match) {
        productos.push({ cantidad: parseInt(match[1]), descripcion: match[2].trim() });
        continue;
      }
      match = linea.match(/^(.+?)\s*[xX]\s*(\d+)$/);
      if (match) {
        productos.push({ cantidad: parseInt(match[2]), descripcion: match[1].trim() });
        continue;
      }
      productos.push({ cantidad: 1, descripcion: linea });
    }
    return productos;
  }

  async _enviarAyuda(ctx) {
    await ctx.reply(
      `📖 *Comandos Disponibles*\n\n` +
      `🛒 *Crear Pedido (flujo interactivo):*\n` +
      `  Escribe el nombre del cliente y sigue las instrucciones\n` +
      `  /pedido o /p — Iniciar nuevo pedido\n` +
      `  /cancelar — Cancelar pedido en proceso\n\n` +
      `🔍 *Búsqueda:*\n` +
      `  /buscar o /b [texto] — Busca clientes y productos\n` +
      `  /cliente o /c [nombre] — Busca un cliente\n` +
      `  /stock o /s [producto] — Consulta inventario\n` +
      `  /productos — Lista productos con stock\n\n` +
      `📦 *Órdenes:*\n` +
      `  /ordenes o /o — Ver estado de órdenes\n\n` +
      `💡 *Flujo de pedido:*\n` +
      `  1️⃣ Escribe nombre del cliente\n` +
      `  2️⃣ Confirma el cliente correcto\n` +
      `  3️⃣ Escribe los productos con cantidades\n` +
      `  4️⃣ Verifica stock y precios\n` +
      `  5️⃣ Confirma y crea la orden`,
      { parse_mode: 'Markdown' }
    );
  }
}