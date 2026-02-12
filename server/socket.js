let ioInstance = null;

export function initSocket(io) {
  ioInstance = io;

  io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    socket.on('disconnect', () => {
      console.log('🔌 Client disconnected:', socket.id);
    });
  });
}

export function getIO() {
  return ioInstance;
}

export function emitOrdenActualizada(orden) {
  if (ioInstance) {
    ioInstance.emit('orden:actualizada', orden);
  }
}

export function emitNuevaOrden(orden) {
  if (ioInstance) {
    ioInstance.emit('orden:nueva', orden);
  }
}

export function emitOrdenEliminada(id) {
  if (ioInstance) {
    ioInstance.emit('orden:eliminada', { id });
  }
}

export function emitBotStatus(status) {
  if (ioInstance) {
    ioInstance.emit('bot:status', status);
  }
}
