#!/bin/bash

echo "🔄 Downgrade: Firebird 3.0 → Firebird 2.5"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Obtener PIDs antes de detener
PIDS=$(ps aux | grep firebird | grep -v grep | awk '{print $2}')

echo "1️⃣ Deteniendo Firebird 3.0..."
sudo systemctl stop firebird3.0 2>/dev/null

# Matar procesos colgados
if [ -n "$PIDS" ]; then
    echo "   Matando procesos colgados: $PIDS"
    for pid in $PIDS; do
        sudo kill -9 $pid 2>/dev/null
    done
fi
sleep 2

echo ""
echo "2️⃣ Desinstalando Firebird 3.0..."
sudo apt remove -y firebird3.0-server firebird3.0-server-core firebird3.0-utils
sudo apt autoremove -y

echo ""
echo "3️⃣ Instalando Firebird 2.5..."

# Verificar si firebird2.5 está disponible en repos
if apt-cache search firebird2.5-super | grep -q firebird2.5; then
    sudo apt install -y firebird2.5-super firebird2.5-common
    
    echo ""
    echo "4️⃣ Configurando password..."
    # Configurar password SYSDBA
    echo "masterkey" | sudo tee /tmp/fb_password > /dev/null
    sudo dpkg-reconfigure -f noninteractive firebird2.5-super || {
        echo "Configurando manualmente..."
        sudo /usr/bin/gsec -user SYSDBA -password masterkey -modify SYSDBA -pw masterkey 2>/dev/null || true
    }
    rm -f /tmp/fb_password
    
    echo ""
    echo "5️⃣ Iniciando Firebird 2.5..."
    sudo systemctl start firebird2.5-super 2>/dev/null || sudo service firebird2.5-super start
    sleep 3
    
    echo ""
    echo "6️⃣ Verificando instalación..."
    sudo systemctl status firebird2.5-super --no-pager 2>&1 | head -10
    
else
    echo "⚠️  Firebird 2.5 no está en los repositorios de Ubuntu"
    echo ""
    echo "📦 Descargando desde SourceForge..."
    cd /tmp
    
    wget -O firebird-2.5.9.tar.gz \
        "https://sourceforge.net/projects/firebird/files/firebird-linux-amd64/2.5.9-Release/Firebird-2.5.9.27139-0.amd64.tar.gz/download" \
        || {
            echo "❌ No se pudo descargar automáticamente"
            echo ""
            echo "Descarga manualmente desde:"
            echo "https://firebirdsql.org/en/firebird-2-5-9/"
            exit 1
        }
    
    echo ""
    echo "📂 Extrayendo..."
    tar -xzf firebird-2.5.9.tar.gz
    cd Firebird-2.5.9.27139-0.amd64
    
    echo ""
    echo "⚙️  Instalando (requiere interacción)..."
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Cuando pregunte:"
    echo "  - Press Enter: [ENTER]"
    echo "  - SYSDBA password: masterkey"
    echo "  - Start at boot: Yes"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    sudo ./install.sh
    
    sleep 3
    sudo systemctl restart firebird 2>/dev/null || sudo service firebird restart
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Firebird 2.5 instalado"
echo ""
echo "🧪 Probando conexión..."
echo "quit;" | isql-fb -user SYSDBA -password masterkey /home/skullh4ck/Downloads/AbarrotesPDV/db/PDVDATA.FDB 2>&1 | head -3

echo ""
echo "🚀 Ahora ejecuta: ./start.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
