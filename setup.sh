#!/bin/bash

echo "🚀 Configurando Telegram VentasBot..."
echo ""

# Verificar que Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado. Por favor, instala Node.js primero."
    exit 1
fi

echo "✅ Node.js $(node --version) detectado"
echo ""

# Instalar dependencias
echo "📦 Instalando dependencias..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Error al instalar dependencias"
    exit 1
fi

echo ""
echo "✅ Dependencias instaladas correctamente"
echo ""

# Configurar archivo .env
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "📝 Creando archivo .env desde .env.example..."
        cp .env.example .env
        echo "⚠️  IMPORTANTE: Edita el archivo .env con tus credenciales"
        echo ""
    else
        echo "⚠️  No se encontró .env.example. Crea manualmente tu archivo .env"
        echo ""
    fi
else
    echo "✅ Archivo .env ya existe"
    echo ""
fi

# Verificar base de datos
if [ ! -f liquidador_data.db ]; then
    echo "ℹ️  Base de datos SQLite será creada al iniciar el servidor"
    echo ""
fi

echo "✅ Setup completado exitosamente!"
echo ""
echo "📌 Próximos pasos:"
echo "   1. Edita el archivo .env con tus credenciales (BOT_TOKEN, etc.)"
echo "   2. Ejecuta './start.sh' para iniciar la aplicación"
echo ""
