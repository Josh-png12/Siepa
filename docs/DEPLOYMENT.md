# Guía de Deployment — SIEPA

Despliegue en un VPS Ubuntu con Nginx + PM2 + PostgreSQL.

---

## Servidor actual

- **Proveedor:** Clouding.io
- **OS:** Ubuntu 22.04
- **IP:** `187.33.148.149`
- **Usuario:** `root`

---

## Configuración inicial del VPS (primera vez)

### 1. Instalar Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version  # debe ser >= 20
```

### 2. Instalar PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib

# Crear base de datos
sudo -u postgres psql -c "CREATE DATABASE siepa;"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'tu_password_segura';"
```

### 3. Instalar Nginx

```bash
sudo apt install -y nginx
```

### 4. Instalar PM2

```bash
npm install -g pm2
```

### 5. Instalar Python 3 y pip (para OCR service)

```bash
sudo apt install -y python3 python3-pip
pip3 install fastapi uvicorn opencv-python numpy pyzbar python-multipart Pillow
```

---

## Clonar el proyecto

```bash
cd /root
git clone https://github.com/TU_USUARIO/siepa-ap.git
cd siepa-ap
```

---

## Configurar variables de entorno

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://postgres:tu_password@localhost:5432/siepa
JWT_SECRET=<generar con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
CORS_ORIGIN=http://187.33.148.149
DEEPSEEK_API_KEY=sk-...
REPLICATE_API_TOKEN=r8_...
OCR_SERVICE_URL=http://localhost:8001
```

---

## Instalar dependencias y migrar

```bash
# Backend
cd /root/siepa-ap/backend
npm install --production
npx prisma generate
npx prisma migrate deploy

# Frontend
cd /root/siepa-ap/frontend
npm install
```

---

## Build del frontend

```bash
cd /root/siepa-ap/frontend

# Crear .env.production
echo "VITE_API_URL=http://187.33.148.149/api" > .env.production

npm run build

# Copiar a directorio de Nginx
cp -r dist/* /var/www/html/
```

---

## Configurar Nginx

Crear `/etc/nginx/sites-available/siepa`:

```nginx
server {
    listen 80;
    server_name 187.33.148.149;

    root /var/www/html;
    index index.html;

    # Frontend (SPA — todas las rutas van a index.html)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy a la API del backend
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Archivos subidos (servidos directamente por Node.js)
    location /uploads/ {
        proxy_pass http://localhost:5000/uploads/;
        proxy_read_timeout 60s;
    }

    # Límite de tamaño de upload (debe coincidir con el backend)
    client_max_body_size 50M;
}
```

Activar:

```bash
ln -s /etc/nginx/sites-available/siepa /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t           # Verificar configuración
systemctl restart nginx
systemctl enable nginx
```

---

## Iniciar servicios con PM2

```bash
# Backend
cd /root/siepa-ap/backend
pm2 start src/app.js --name siepa-backend

# OCR Service
cd /root/siepa-ap/ocr-service
pm2 start "uvicorn main:app --host 0.0.0.0 --port 8001" --name siepa-ocr

# Guardar configuración de PM2 para que sobreviva reboots
pm2 save
pm2 startup   # Sigue las instrucciones del output

# Verificar que ambos servicios corren
pm2 list
```

---

## Verificación post-deploy

```bash
# Backend health
curl http://localhost:5000/
curl http://localhost:5000/health

# OCR service
curl http://localhost:8001/health

# Frontend (via Nginx)
curl http://localhost/

# Desde el exterior
curl http://187.33.148.149/
curl http://187.33.148.149/api/
```

---

## Deploy manual (actualizar código existente)

```bash
# En el servidor
cd /root/siepa-ap
./deploy.sh
```

El script `deploy.sh` hace automáticamente:
1. `git pull origin master`
2. `npm install` en backend
3. `npx prisma generate`
4. `npm install && npm run build` en frontend
5. Copia `dist/` a `/var/www/html/`
6. `pm2 restart siepa-backend`
7. `systemctl restart nginx`

---

## Deploy desde máquina local

```bash
# En tu máquina local: push a master dispara el deploy
git push origin master

# Si el servidor tiene configurado un webhook de GitHub → automatico
# Si no, conectarse por SSH y correr deploy.sh manualmente:
ssh root@187.33.148.149 "cd /root/siepa-ap && ./deploy.sh"
```

---

## Rollback si algo falla

```bash
# Ver el commit anterior
git log --oneline -5

# Volver al commit anterior
git checkout <commit-hash>

# Rebuild y redeploy
cd frontend && npm run build && cp -r dist/* /var/www/html/
cd ../backend && pm2 restart siepa-backend
```

O con el stash de Docker si existe backup:
```bash
# Restaurar el backup de /var/www/html que deploy.sh crea automáticamente
ls /var/www/html_backup_*
cp -r /var/www/html_backup_YYYYMMDD_HHMMSS/* /var/www/html/
```

---

## Variables de entorno de producción

| Variable | Descripción |
|----------|-------------|
| `NODE_ENV` | `production` |
| `PORT` | `5000` |
| `DATABASE_URL` | URL completa de PostgreSQL local |
| `JWT_SECRET` | Secreto largo generado con crypto.randomBytes |
| `CORS_ORIGIN` | IP o dominio del frontend |
| `DEEPSEEK_API_KEY` | API key de DeepSeek AI |
| `REPLICATE_API_TOKEN` | Token de Replicate |
| `OCR_SERVICE_URL` | `http://localhost:8001` |

---

## Comandos útiles de mantenimiento

```bash
# Ver logs del backend en tiempo real
pm2 logs siepa-backend

# Ver logs del OCR service
pm2 logs siepa-ocr

# Monitoreo en tiempo real
pm2 monit

# Logs de Nginx
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# Estado de PostgreSQL
sudo systemctl status postgresql
sudo -u postgres psql -c "\l"   # Listar bases de datos

# Migraciones pendientes en producción
cd /root/siepa-ap/backend
npx prisma migrate status

# Liberar espacio de uploads viejos (si es necesario)
find /root/siepa-ap/backend/uploads/tmp -mtime +7 -delete
```

---

## Migraciones de base de datos en producción

```bash
cd /root/siepa-ap/backend

# Aplicar migraciones pendientes (sin borrar datos)
npx prisma migrate deploy

# NUNCA usar en producción:
# npx prisma migrate reset  ← Borra todos los datos
# npx prisma db push        ← Sin historial de migraciones
```

---

## Checklist de deploy

- [ ] `git pull` exitoso
- [ ] `npm install` sin errores
- [ ] `npx prisma migrate deploy` sin migraciones pendientes fallidas
- [ ] `npm run build` del frontend exitoso
- [ ] Archivos copiados a `/var/www/html/`
- [ ] `pm2 restart siepa-backend` exitoso
- [ ] `curl http://localhost:5000/health` responde `healthy`
- [ ] `curl http://localhost:8001/health` responde `ok`
- [ ] `curl http://localhost/` devuelve el HTML del frontend
- [ ] Login funciona desde el navegador
