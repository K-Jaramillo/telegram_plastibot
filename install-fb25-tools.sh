#!/bin/bash

echo "🔄 Instalando Firebird 2.5 para migración..."
echo ""

# Instalar firebird2.5-super (contiene gbak compatible)
echo "📦 Descargando Firebird 2.5..."
cd /tmp

# Descargar gbak de Firebird 2.5
if [ ! -f "firebird_2.5-gbak" ]; then
    echo "Intentando descargar herramientas de Firebird 2.5..."
    wget -q http://archive.ubuntu.com/ubuntu/pool/universe/f/firebird2.5/firebird2.5-classic_2.5.9.27139.ds4-8build1_amd64.deb 2>/dev/null || {
        echo "❌ No se pudo descargar automáticamente"
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "📌 SOLUCIÓN MANUAL:"
        echo ""
        echo "1. Descarga Firebird 2.5 desde:"
        echo "   https://github.com/FirebirdSQL/firebird/releases/download/R2_5_9/Firebird-2.5.9.27139-0.amd64.tar.gz"
        echo ""
        echo "2. Extrae y usa su gbak:"
        echo "   tar -xzf Firebird-2.5.9*.tar.gz"
        echo "   cd Firebird-2.5.9*/bin"
        echo "   ./gbak -b -user SYSDBA -password masterkey \\"
        echo "     /home/skullh4ck/Downloads/AbarrotesPDV/db/PDVDATA.FDB \\"
        echo "     /tmp/backup.fbk"
        echo ""
        echo "3. Restaura con Firebird 3.0:"
        echo "   gbak -c -user SYSDBA -password masterkey \\"
        echo "     /tmp/backup.fbk \\"
        echo "     /home/skullh4ck/Downloads/AbarrotesPDV/db/PDVDATA_NEW.FDB"
        echo ""
        echo "4. Reemplaza la BD:"
        echo "   mv /home/skullh4ck/Downloads/AbarrotesPDV/db/PDVDATA.FDB \\"
        echo "      /home/skullh4ck/Downloads/AbarrotesPDV/db/PDVDATA.FDB.old"
        echo "   mv /home/skullh4ck/Downloads/AbarrotesPDV/db/PDVDATA_NEW.FDB \\"
        echo "      /home/skullh4ck/Downloads/AbarrotesPDV/db/PDVDATA.FDB"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        exit 1
    }
fi

echo ""
echo "✅ Proceso completado"
