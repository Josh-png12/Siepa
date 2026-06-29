#!/bin/bash
# ============================================================
# SIEPA - Script de Despliegue Automático
# ============================================================
# Este script se ejecuta cuando GitHub envía un webhook al
# servidor (o manualmente para despliegues de emergencia).
#
# Uso:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Requisitos en el servidor:
#   - Node.js >= 20
#   - PM2 instalado globalmente (npm i -g pm2)
#   - Nginx instalado y configurado
#   - PostgreSQL corriendo en localhost
#   - Git configurado con acceso al repositorio
# ============================================================

set -e  # Detener en caso de error

echo "============================================="
echo "  SIEPA - Iniciando despliegue"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================="

# Configuración
PROJECT_DIR="/root/siepa-ap"            # Directorio del proyecto
FRONTEND_BUILD_DIR="$PROJECT_DIR/frontend/dist"  # Build del frontend
WEB_ROOT="/var/www/html"                # Directorio público de Nginx
BACKEND_DIR="$PROJECT_DIR/backend"      # Directorio del backend
PM2_APP_NAME="siepa-backend"            # Nombre de la app en PM2

# 1. Ir al directorio del proyecto y hacer git pull
echo ""
echo "[1/5] Actualizando código desde GitHub..."
cd "$PROJECT_DIR"
git pull origin master
echo "✅ Código actualizado."

# 2. Instalar dependencias del backend y aplicar migraciones
echo ""
echo "[2/5] Instalando dependencias del backend..."
cd "$BACKEND_DIR"
npm install --production
npx prisma generate
npx prisma migrate deploy
echo "✅ Dependencias del backend instaladas y migraciones aplicadas."

# 3. Construir el frontend
echo ""
echo "[3/5] Construyendo frontend..."
cd "$PROJECT_DIR/frontend"
npm install
npm run build
echo "✅ Frontend construido."

# 4. Copiar archivos del frontend a /var/www/html
echo ""
echo "[4/5] Desplegando archivos estáticos..."
# Respaldar el contenido anterior (opcional)
if [ -d "$WEB_ROOT" ] && [ "$(ls -A $WEB_ROOT 2>/dev/null)" ]; then
  BACKUP_DIR="/var/www/html_backup_$(date '+%Y%m%d_%H%M%S')"
  echo "  Creando respaldo en $BACKUP_DIR..."
  cp -r "$WEB_ROOT" "$BACKUP_DIR"
fi
# Limpiar y copiar nuevo build
rm -rf "$WEB_ROOT"/*
cp -r "$FRONTEND_BUILD_DIR"/* "$WEB_ROOT"/
echo "✅ Archivos estáticos desplegados en $WEB_ROOT."

# 5. Reiniciar el backend con PM2
echo ""
echo "[5/5] Reiniciando servicios..."
if pm2 list | grep -q "$PM2_APP_NAME"; then
  pm2 restart "$PM2_APP_NAME"
  echo "✅ Backend reiniciado (PM2 restart)."
else
  echo "⚠️  PM2 app '$PM2_APP_NAME' no encontrada. Iniciando por primera vez..."
  cd "$BACKEND_DIR"
  pm2 start src/app.js --name "$PM2_APP_NAME"
  pm2 save
  echo "✅ Backend iniciado con PM2."
fi

# Reiniciar Nginx
systemctl restart nginx
echo "✅ Nginx reiniciado."

echo ""
echo "============================================="
echo "  ✅ Despliegue completado exitosamente"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================="
echo ""
echo "Verificación:"
echo "  Backend:  curl http://localhost:5000/"
echo "  Frontend: curl http://localhost/"
