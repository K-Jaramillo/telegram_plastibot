const comandos = [
  {
    comando: '/pedido o /p [cliente] - [productos]',
    descripcion: 'Crea una orden de venta',
    ejemplo: '/p Las Granjas - 10 bolsa 8x12 negra',
  },
  {
    comando: '/buscar o /b [texto]',
    descripcion: 'Busca clientes Y productos',
    ejemplo: '/b granjas',
  },
  {
    comando: '/stock o /s [producto]',
    descripcion: 'Consulta inventario de un producto',
    ejemplo: '/s bolsa 8x12',
  },
  {
    comando: '/cliente o /c [nombre]',
    descripcion: 'Busca un cliente',
    ejemplo: '/c Las Granjas',
  },
  {
    comando: '/productos',
    descripcion: 'Lista productos con stock disponible',
    ejemplo: '/productos',
  },
  {
    comando: '/ordenes o /o',
    descripcion: 'Ver estado de las órdenes',
    ejemplo: '/o',
  },
];

export default function ComandosRef() {
  return (
    <div className="bg-white border-t shadow-inner px-6 py-3">
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-gray-600 select-none">
          📖 Comandos del Bot
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="px-3 py-1 text-gray-500">Comando</th>
                <th className="px-3 py-1 text-gray-500">Descripción</th>
                <th className="px-3 py-1 text-gray-500">Ejemplo</th>
              </tr>
            </thead>
            <tbody>
              {comandos.map((c, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-3 py-1.5 font-mono text-blue-700 text-xs">
                    {c.comando}
                  </td>
                  <td className="px-3 py-1.5">{c.descripcion}</td>
                  <td className="px-3 py-1.5 font-mono text-gray-400 text-xs">
                    {c.ejemplo}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
