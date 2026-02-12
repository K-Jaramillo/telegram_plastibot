#!/bin/bash

echo "🔄 Actualizando base de datos Firebird 2.5 → 3.0..."
echo ""

DB_PATH="/home/skullh4ck/Downloads/AbarrotesPDV/db/PDVDATA.FDB"
BACKUP_PATH="/home/skullh4ck/Downloads/AbarrotesPDV/db/PDVDATA_BACKUP_$(date +%Y%m%d_%H%M%S).fbk"
NEW_DB_PATH="/home/skullh4ck/Downloads/AbarrotesPDV/db/PDVDATA_NEW.FDB"

if [ ! -f "$DB_PATH" ]; then
    echo "❌ No se encontró: $DB_PATH"
    exit 1
fi

echo "📁 Base de datos original: $DB_PATH"
echo "💾 Backup temporal: $BACKUP_PATH"
echo "🆕 Base de datos nueva: $NEW_DB_PATH"
echo ""

# Verificar que gbak existe
if ! command -v gbak &> /dev/null; then
    echo "❌ gbak no encontrado. Instala Firebird tools:"
    echo "   sudo apt install firebird-dev"
    exit 1
fi

echo "1️⃣ Haciendo backup de la BD antigua..."
gbak -b -user SYSDBA -password masterkey "$DB_PATH" "$BACKUP_PATH"

if [ $? -ne 0 ]; then
    echo "❌ Error al hacer backup"
    exit 1
fi

echo "✅ Backup creado"
echo ""

echo "2️⃣ Restaurando en formato Firebird 3.0..."
gbak -c -user SYSDBA -password masterkey "$BACKUP_PATH" "$NEW_DB_PATH"

if [ $? -ne 0 ]; then
    echo "❌ Error al restaurar"
    echo "El backup se guardó en: $BACKUP_PATH"
    exit 1
fi

echo "✅ BD restaurada en nuevo formato"
echo ""

echo "3️⃣ Reemplazando archivo antiguo..."
mv "$DB_PATH" "${DB_PATH}.old"
mv "$NEW_DB_PATH" "$DB_PATH"

echo "✅ Base de datos actualizada"
echo ""

echo "4️⃣ Configurando permisos..."
sudo chown $USER:firebird "$DB_PATH"
sudo chmod 660 "$DB_PATH"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ ¡Proceso completado!"
echo ""
echo "📦 Archivos guardados:"
echo "   - Backup: $BACKUP_PATH"
echo "   - BD antigua: ${DB_PATH}.old"
echo "   - BD nueva: $DB_PATH"
echo ""
echo "🚀 Ahora ejecuta: ./start.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
