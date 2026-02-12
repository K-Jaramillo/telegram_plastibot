#!/bin/bash

echo "🔧 Corrigiendo permisos de Firebird..."
echo ""

DB_PATH="/home/skullh4ck/Downloads/AbarrotesPDV/db/PDVDATA.FDB"

if [ ! -f "$DB_PATH" ]; then
    echo "❌ No se encontró el archivo: $DB_PATH"
    exit 1
fi

echo "📁 Archivo: $DB_PATH"
echo "📋 Permisos actuales:"
ls -lh "$DB_PATH"
echo ""

echo "🔐 Se requieren permisos de administrador..."
sudo chown $USER:firebird "$DB_PATH"
sudo chmod 660 "$DB_PATH"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Permisos corregidos:"
    ls -lh "$DB_PATH"
    echo ""
    echo "✅ ¡Listo! Ahora puedes iniciar el bot con ./start.sh"
else
    echo ""
    echo "❌ Error al cambiar permisos"
    exit 1
fi
