#!/bin/bash

echo "🔍 Diagnóstico de Firebird..."
echo ""

echo "1️⃣ Procesos de Firebird:"
ps aux | grep -i firebird | grep -v grep
echo ""

echo "2️⃣ Estado del servicio:"
sudo systemctl status firebird3.0 2>&1 | head -15 || sudo systemctl status firebird 2>&1 | head -15 || echo "No se pudo obtener estado del servicio"
echo ""

echo "3️⃣ Conexiones al puerto 3050:"
sudo netstat -tulpn 2>/dev/null | grep 3050 || sudo ss -tulpn 2>/dev/null | grep 3050 || echo "No se pudo verificar puerto"
echo ""

echo "4️⃣ Logs de Firebird (últimas 20 líneas):"
sudo tail -20 /var/log/firebird3.0/firebird.log 2>/dev/null || sudo tail -20 /var/log/firebird/firebird.log 2>/dev/null || echo "No se encontraron logs"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 Solución: Reiniciar el servicio Firebird"
echo "   Ejecuta: sudo systemctl restart firebird3.0"
echo "   o:       sudo systemctl restart firebird"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
