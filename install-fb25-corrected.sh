#!/bin/bash

echo "🔄 Instalando Firebird 2.5 desde GitHub (oficial)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "1️⃣ Descargando Firebird 2.5.9..."
cd /tmp
wget -O FirebirdSS-2.5.9.tar.gz \
    "https://github.com/FirebirdSQL/firebird/releases/download/R2_5_9/FirebirdSS-2.5.9.27139-0.amd64.tar.gz"

if [ ! -f FirebirdSS-2.5.9.tar.gz ]; then
    echo "❌ Error al descargar"
    echo "Link: https://github.com/FirebirdSQL/firebird/releases/tag/R2_5_9"
    exit 1
fi

echo ""
echo "2️⃣ Extrayendo..."
tar -xzf FirebirdSS-2.5.9.tar.gz

echo ""
echo "3️⃣ Instalando..."
cd FirebirdSS-2.5.9.27139-0.amd64

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Durante la instalación:"
echo "  - Press Enter: [ENTER]"
echo "  - SYSDBA password: masterkey"
echo "  - Start at boot: Yes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

sudo ./install.sh

echo ""
echo "4️⃣ Iniciando Firebird..."
sudo systemctl restart firebird 2>/dev/null || sudo /etc/init.d/firebird restart

sleep 2

echo ""
echo "✅ Verificando instalación..."
ps aux | grep firebird | grep -v grep

echo ""
echo "🧪 Probando conexión..."
echo "quit;" | isql-fb -user SYSDBA -password masterkey /home/skullh4ck/Downloads/AbarrotesPDV/db/PDVDATA.FDB 2>&1 | head -5

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Instalación completada"
echo ""
echo "🚀 Ahora ejecuta: cd ~/telegram_ventasbot && ./start.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
