import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { api } from '../lib/api.js';

const STATUS_MAP = {
  stopped: { icon: '⚫', text: 'Detenido', color: 'text-gray-500' },
  starting: { icon: '🟢', text: 'Iniciando...', color: 'text-yellow-500' },
  running: { icon: '🟢', text: 'Bot activo', color: 'text-green-600' },
  stopping: { icon: '🟡', text: 'Deteniendo...', color: 'text-yellow-500' },
  error: { icon: '🔴', text: 'Error', color: 'text-red-600' },
};

export default function BotConfig({ botStatus }) {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getToken().then(({ token: t }) => setToken(t || '')).catch(() => {});
  }, []);

  const handleGuardar = async () => {
    if (!token.trim()) return toast.error('Token vacío');
    try {
      await api.saveToken(token);
      toast.success('Token guardado');
    } catch {
      toast.error('Error al guardar');
    }
  };

  const handleIniciar = async () => {
    setLoading(true);
    try {
      const result = await api.startBot(token);
      if (!result.success) throw new Error(result.error);
      toast.success('Bot iniciado');
    } catch (err) {
      toast.error(err.message || 'Error al iniciar bot');
    }
    setLoading(false);
  };

  const handleDetener = async () => {
    setLoading(true);
    try {
      const result = await api.stopBot();
      if (!result.success) throw new Error(result.error);
      toast.success('Bot detenido');
    } catch (err) {
      toast.error(err.message || 'Error al detener bot');
    }
    setLoading(false);
  };

  const status = STATUS_MAP[botStatus] || STATUS_MAP.stopped;
  const isRunning = botStatus === 'running';

  return (
    <div className="bg-white border-b shadow-sm px-6 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-gray-600">🤖 Bot Config</span>

        {/* Token Input */}
        <div className="flex items-center gap-1">
          <label className="text-sm text-gray-500">Token:</label>
          <input
            type={showToken ? 'text' : 'password'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-[340px] font-mono"
            placeholder="Bot token..."
          />
          <button
            className="text-lg px-1 hover:bg-gray-100 rounded"
            onClick={() => setShowToken(!showToken)}
            title={showToken ? 'Ocultar' : 'Mostrar'}
          >
            {showToken ? '🙈' : '👁️'}
          </button>
          <button
            className="text-sm px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
            onClick={handleGuardar}
          >
            💾 Guardar
          </button>
        </div>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Start/Stop */}
        <button
          className="btn-success text-sm py-1"
          onClick={handleIniciar}
          disabled={loading || isRunning || !token}
        >
          ▶️ Iniciar Bot
        </button>
        <button
          className="btn-danger text-sm py-1"
          onClick={handleDetener}
          disabled={loading || !isRunning}
        >
          ⏹️ Detener Bot
        </button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Status */}
        <span className="text-sm text-gray-500">Estado:</span>
        <span className={`text-sm font-semibold ${status.color}`}>
          {status.icon} {status.text}
        </span>
      </div>
    </div>
  );
}
