const STATUS_ICONS = {
  pendiente: '⏳',
  aprobado: '✅',
  empacado: '📦',
  despachado: '🚚',
  cancelado: '❌',
};

const ESTADO_TRANSITIONS = {
  pendiente: ['aprobado', 'cancelado'],
  aprobado: ['empacado', 'cancelado'],
  empacado: ['despachado', 'cancelado'],
  despachado: [],
  cancelado: [],
};

export default function OrdenDetalle({ orden, onCambiarEstado }) {
  if (!orden) {
    return (
      <div className="bg-white rounded-lg shadow h-full flex items-center justify-center text-gray-400 p-6">
        <div className="text-center">
          <p className="text-3xl mb-2">📝</p>
          <p>Selecciona una orden para ver sus detalles</p>
        </div>
      </div>
    );
  }

  let productos = [];
  try {
    productos = JSON.parse(orden.productos_json || '[]');
  } catch {
    productos = [];
  }

  const nextStates = ESTADO_TRANSITIONS[orden.estado] || [];

  return (
    <div className="bg-white rounded-lg shadow h-full overflow-auto">
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white px-4 py-3 rounded-t-lg">
        <h2 className="font-bold">📝 Detalle de Orden #{orden.id}</h2>
      </div>

      <div className="p-4 space-y-4">
        {/* Mensaje original */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase">
            Mensaje original:
          </label>
          <div className="bg-gray-50 rounded p-2 mt-1 text-sm font-mono whitespace-pre-wrap border max-h-32 overflow-auto">
            {orden.mensaje_original || '—'}
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-1 gap-2 text-sm">
          <div>
            <span className="text-gray-500">Vendedor:</span>{' '}
            <span className="font-bold">
              {orden.telegram_nombre || 'Desconocido'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Usuario TG:</span>{' '}
            <span className="text-blue-600">
              @{orden.telegram_username || '—'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Cliente:</span>{' '}
            <span className="font-bold">{orden.cliente || '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Fecha:</span>{' '}
            {orden.fecha_creacion
              ? new Date(orden.fecha_creacion).toLocaleString('es-MX')
              : orden.fecha}
          </div>
          <div>
            <span className="text-gray-500">Estado:</span>{' '}
            <span className="font-semibold">
              {STATUS_ICONS[orden.estado]} {orden.estado}
            </span>
          </div>
        </div>

        {/* Productos */}
        {productos.length > 0 && (
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">
              Productos:
            </label>
            <div className="mt-1 border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-2 py-1 text-left">Producto</th>
                    <th className="px-2 py-1 text-right">Cant</th>
                    <th className="px-2 py-1 text-right">Precio</th>
                    <th className="px-2 py-1 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map((p, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1">
                        <div className="font-medium">{p.descripcion}</div>
                        {p.codigo && (
                          <div className="text-xs text-gray-400">{p.codigo}</div>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right">{p.cantidad}</td>
                      <td className="px-2 py-1 text-right">
                        ${Number(p.precio || 0).toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-right font-medium">
                        ${(p.cantidad * (p.precio || 0)).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Total */}
        {orden.total > 0 && (
          <div className="text-right text-lg font-bold text-green-700 border-t pt-2">
            💰 Total: ${Number(orden.total).toFixed(2)}
          </div>
        )}

        {/* Folio info */}
        {orden.folio && (
          <div className="bg-green-50 rounded p-2 text-sm border border-green-200">
            🧾 Folio Eleventa: <strong>#{orden.folio}</strong>
          </div>
        )}

        {/* Estado transitions */}
        {nextStates.length > 0 && (
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">
              Cambiar estado:
            </label>
            <div className="flex gap-2 mt-1">
              {nextStates.map((estado) => (
                <button
                  key={estado}
                  className={
                    estado === 'cancelado' ? 'btn-danger text-sm py-1' : 'btn-success text-sm py-1'
                  }
                  onClick={() => onCambiarEstado(estado)}
                >
                  {STATUS_ICONS[estado]} {estado.charAt(0).toUpperCase() + estado.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Audit trail */}
        <div className="text-xs text-gray-400 space-y-0.5 border-t pt-2">
          {orden.aprobado_por && (
            <p>
              ✅ Aprobado por {orden.aprobado_por} — {orden.aprobado_en}
            </p>
          )}
          {orden.empacado_por && (
            <p>
              📦 Empacado por {orden.empacado_por} — {orden.empacado_en}
            </p>
          )}
          {orden.despachado_por && (
            <p>
              🚚 Despachado por {orden.despachado_por} — {orden.despachado_en}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
