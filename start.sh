#!/bin/bash

echo "🚀 Iniciando Telegram VentasBot..."
echo ""

# Verificar que exista .env
if [ ! -f .env ]; then
    echo "❌ Archivo .env no encontrado"
    echo "   Ejecuta './setup.sh' primero"
    exit 1
fi

# Verificar que node_modules existe
if [ ! -d node_modules ]; then
    echo "❌ Dependencias no instaladas"
    echo "   Ejecuta './setup.sh' primero"
    exit 1
fi

echo "✅ Iniciando servidor y cliente..."
echo ""
echo "📍 Servidor: http://localhost:3000"
echo "📍 Cliente: http://localhost:5173"
echo ""
echo "Presiona Ctrl+C para detener"
echo ""

npm run dev
