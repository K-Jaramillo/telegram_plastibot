#!/bin/bash

echo "🔄 Instalando Firebird 2.5 (compatible con Eleventa)..."
echo ""

echo "⚠️  IMPORTANTE:"
echo "   Esto reemplazará Firebird 3.0 con Firebird 2.5"
echo "   para ser compatible con Eleventa"
echo ""
read -p "¿Continuar? (s/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[SsYy]$ ]]; then
    echo "❌ Cancelado"
    exit 1
fi

echo "1️⃣ Deteniendo Firebird 3.0..."
sudo systemctl stop firebird3.0

echo ""
echo "2️⃣ Descargando Firebird 2.5..."
cd /tmp

# Descargar desde SourceForge
wget -O firebird-2.5.9.tar.gz "https://sourceforge.net/projects/firebird/files/firebird-linux-amd64/2.5.9-Release/Firebird-2.5.9.27139-0.amd64.tar.gz/download"

if [ ! -f firebird-2.5.9.tar.gz ]; then
    echo "❌ Error al descargar. Descarga manualmente desde:"
    echo "   https://firebirdsql.org/en/firebird-2-5-9/"
    exit 1
fi

echo ""
echo "3️⃣ Extrayendo..."
tar -xzf firebird-2.5.9.tar.gz
cd Firebird-2.5.9.27139-0.amd64

echo ""
echo "4️⃣ Instalando..."
echo ""
echo "   Cuando pregunte:"
echo "   - Press Enter to continue: [Enter]"
echo "   - SYSDBA password: masterkey"
echo ""
sudo ./install.sh

echo ""
echo "5️⃣ Iniciando Firebird 2.5..."
sudo systemctl restart firebird || sudo service firebird restart

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Firebird 2.5 instalado"
echo ""
echo "🔧 Actualiza tu .env con:"
echo "   FIREBIRD_PORT=3050"
echo "   FIREBIRD_USER=SYSDBA"
echo "   FIREBIRD_PASSWORD=masterkey"
echo ""
echo "🚀 Ejecuta: ./start.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
