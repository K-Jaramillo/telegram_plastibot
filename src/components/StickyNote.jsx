const STATUS_ICONS = {
  pendiente: '⏳ Pendiente',
  aprobado: '✅ Aprobado',
  empacado: '📦 Empacado',
  despachado: '🚚 Despachado',
  cancelado: '❌ Cancelado',
};

function getStatusClass(orden) {
  if (orden.procesada) return 'procesada';
  if (orden.verificada) return 'verificada';
  return orden.estado || 'pendiente';
}

export default function StickyNote({ orden, selected, onClick }) {
  const statusClass = getStatusClass(orden);
  const hora = orden.fecha_creacion
    ? new Date(orden.fecha_creacion).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  // Parse products for display
  let productos = [];
  try {
    productos = JSON.parse(orden.productos_json || '[]');
  } catch {
    productos = [];
  }

  const productosTexto = orden.productos || '';
  const productosLineas = productosTexto.split('\n').filter(Boolean);

  const displayProducts =
    productos.length > 0
      ? productos.slice(0, 4).map((p) => `${p.cantidad}x ${p.descripcion}`)
      : productosLineas.slice(0, 4);

  const moreCount =
    (productos.length > 0 ? productos.length : productosLineas.length) - 4;

  return (
    <div
      className={`sticky-note ${statusClass} ${selected ? 'selected' : ''}`}
      onClick={onClick}
    >
      {/* Header */}
      <div className="sticky-header rounded-t-lg px-3 py-2 flex justify-between items-center text-sm font-bold">
        <span>📋 #{orden.id}</span>
        <span>🕐 {hora}</span>
      </div>

      {/* Body */}
      <div className="px-3 py-2 space-y-1.5">
        {/* Vendor */}
        <div className="flex items-center gap-1">
          <span>👤</span>
          <span className="font-bold text-sm truncate">
            {orden.telegram_nombre || orden.telegram_username || 'Desconocido'}
          </span>
        </div>

        <hr className="border-black/10" />

        {/* Client */}
        <div className="flex items-center gap-1">
          <span>🏪</span>
          <span className="text-sm truncate">
            {orden.cliente || 'Sin cliente'}
          </span>
        </div>

        <hr className="border-black/10" />

        {/* Products */}
        <div>
          <p className="text-xs font-semibold">📦 Productos:</p>
          {displayProducts.map((p, i) => (
            <p key={i} className="text-xs ml-2">
              • {p}
            </p>
          ))}
          {moreCount > 0 && (
            <p className="text-xs ml-2 italic opacity-70">
              (+{moreCount} más...)
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 text-center text-xs font-semibold border-t border-black/10">
        {STATUS_ICONS[orden.estado] || '⏳ Pendiente'}
        {orden.total > 0 && (
          <span className="ml-2">💰 ${Number(orden.total).toFixed(2)}</span>
        )}
      </div>
    </div>
  );
}
