import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { api } from '../lib/api.js';
import { FaDatabase, FaFolderOpen, FaSave, FaChevronDown, FaChevronUp } from 'react-icons/fa';

export default function DatabaseConfig() {
  const [firebirdPath, setFirebirdPath] = useState('');
  const [sqlitePath, setSqlitePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    loadPaths();
  }, []);

  const loadPaths = async () => {
    try {
      const config = await api.getDatabasePaths();
      setFirebirdPath(config.firebird || '');
      setSqlitePath(config.sqlite || '');
    } catch (err) {
      console.error('Error cargando rutas:', err);
    }
  };

  const handleSave = async () => {
    if (!firebirdPath.trim() && !sqlitePath.trim()) {
      toast.error('Ingresa al menos una ruta de base de datos');
      return;
    }

    setLoading(true);
    try {
      await api.saveDatabasePaths({
        firebird: firebirdPath.trim(),
        sqlite: sqlitePath.trim(),
      });
      toast.success('Rutas guardadas exitosamente');
    } catch (err) {
      toast.error('Error al guardar rutas: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async (dbType) => {
    setTestingConnection(dbType);
    try {
      const result = await api.testDatabaseConnection(dbType);
      if (result.success) {
        toast.success(`✅ Conexión exitosa a ${dbType === 'firebird' ? 'Firebird' : 'SQLite'}`);
      } else {
        toast.error(`❌ Error: ${result.error}`);
      }
    } catch (err) {
      toast.error(`Error probando conexión: ${err.message}`);
    } finally {
      setTestingConnection(null);
    }
  };

  const handleFileSelect = (dbType) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = dbType === 'firebird' ? '.fdb,.gdb' : '.db,.sqlite,.sqlite3';
    
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const fullPath = file.path || file.name;
        if (dbType === 'firebird') {
          setFirebirdPath(fullPath);
        } else {
          setSqlitePath(fullPath);
        }
        toast.success(`Archivo seleccionado: ${file.name}`);
      }
    };
    
    input.click();
  };

  return (
    <div className="bg-white border-b shadow-sm">
      {/* Header - Always Visible */}
      <div 
        className="px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <FaDatabase className="text-indigo-600 text-sm" />
          <h3 className="text-xs font-semibold text-gray-700">Configuración de Bases de Datos</h3>
          {(firebirdPath || sqlitePath) && (
            <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              Configurado
            </span>
          )}
        </div>
        {isExpanded ? <FaChevronUp className="text-gray-400 text-xs" /> : <FaChevronDown className="text-gray-400 text-xs" />}
      </div>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="px-4 pb-3 pt-1 bg-gray-50 border-t">
          <div className="grid lg:grid-cols-2 gap-3">
            {/* Firebird Database */}
            <div className="flex items-center gap-2">
              <span className="text-lg flex-shrink-0">🔥</span>
              <div className="flex-1 min-w-0">
                <label className="text-[10px] font-semibold text-gray-600 block mb-1">
                  Firebird (Eleventa)
                </label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={firebirdPath}
                    onChange={(e) => setFirebirdPath(e.target.value)}
                    className="flex-1 border rounded px-2 py-1 text-xs font-mono focus:ring-1 focus:ring-orange-400 focus:border-orange-400 min-w-0"
                    placeholder="D:\Eleventa\PDVDATA.FDB"
                  />
                  <button
                    className="px-2 py-1 bg-orange-500 text-white rounded hover:bg-orange-600 transition text-xs flex-shrink-0"
                    onClick={() => handleFileSelect('firebird')}
                    title="Seleccionar archivo"
                  >
                    <FaFolderOpen className="text-xs" />
                  </button>
                  <button
                    className="text-[10px] px-2 py-1 bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition disabled:opacity-50 whitespace-nowrap flex-shrink-0"
                    onClick={() => handleTestConnection('firebird')}
                    disabled={!firebirdPath || testingConnection === 'firebird'}
                  >
                    {testingConnection === 'firebird' ? '⏳' : '🔌'}
                  </button>
                </div>
              </div>
            </div>

            {/* SQLite Database */}
            <div className="flex items-center gap-2">
              <span className="text-lg flex-shrink-0">💾</span>
              <div className="flex-1 min-w-0">
                <label className="text-[10px] font-semibold text-gray-600 block mb-1">
                  SQLite (Órdenes)
                </label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={sqlitePath}
                    onChange={(e) => setSqlitePath(e.target.value)}
                    className="flex-1 border rounded px-2 py-1 text-xs font-mono focus:ring-1 focus:ring-blue-400 focus:border-blue-400 min-w-0"
                    placeholder="liquidador_data.db"
                  />
                  <button
                    className="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition text-xs flex-shrink-0"
                    onClick={() => handleFileSelect('sqlite')}
                    title="Seleccionar archivo"
                  >
                    <FaFolderOpen className="text-xs" />
                  </button>
                  <button
                    className="text-[10px] px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition disabled:opacity-50 whitespace-nowrap flex-shrink-0"
                    onClick={() => handleTestConnection('sqlite')}
                    disabled={!sqlitePath || testingConnection === 'sqlite'}
                  >
                    {testingConnection === 'sqlite' ? '⏳' : '🔌'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] text-gray-500">
              💡 Usa 📁 para seleccionar archivos o escribe la ruta completa
            </span>
            <button
              className="flex items-center gap-1 px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="animate-spin text-xs">⏳</span>
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <FaSave className="text-xs" />
                  <span>Guardar</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
