import StickyNote from './StickyNote.jsx';

export default function OrdenesBoard({ ordenes, selectedId, onSelect }) {
  if (ordenes.length === 0) {
    return (
      <div className="flex-1 bg-cork rounded-b-lg flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="text-4xl mb-2">📋</p>
          <p className="text-lg font-medium">No hay órdenes</p>
          <p className="text-sm">Las órdenes de Telegram aparecerán aquí</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-cork rounded-b-lg overflow-auto p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {ordenes.map((orden) => (
          <StickyNote
            key={orden.id}
            orden={orden}
            selected={orden.id === selectedId}
            onClick={() => onSelect(orden)}
          />
        ))}
      </div>
    </div>
  );
}
