# 🚀 Guía de Despliegue - SIEPA

## Arquitectura del Servidor

```
┌──────────────────────────────────────────────────┐
│              Servidor Clouding.io                 │
│              IP: 187.33.148.149                   │
│                                                   │
│  ┌─────────────────┐  ┌───────────────────────┐  │
│  │     Nginx        │  │   PM2 (Node.js)       │  │
│  │  :80 / :443      │  │   siepa-backend       │  │
│  │                  │  │   :5000               │  │
│  │  /var/www/html/  │  │                       │  │
│  │  (Frontend)      │  │   PostgreSQL :5432    │  │
│  └────────┬─────────┘  └───────────┬───────────┘  │
│           │                        │               │
│           └──────── API ──────────┘               │
└──────────────────────────────────────────────────┘
```

## Requisitos del Servidor

- Ubuntu 22.04+ (o similar)
- Node.js >= 20.x
- PostgreSQL 14+
- Nginx
- PM2 (`npm install -g pm2`)
- Git

## Configuración Inicial (Primera Vez)

### 1. Clonar el repositorio

```bash
cd /root
git clone https://github.com/TU_USUARIO/siepa-ap.git
cd siepa-ap
```

### 2. Configurar PostgreSQL

```bash
# Instalar PostgreSQL si no está instalado
apt update && apt install -y postgresql postgresql-contrib

# Crear base de datos y usuario
sudo -u postgres psql -c "CREATE DATABASE siepa;"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'tu_password_segura';"
```

### 3. Configurar variables de entorno

```bash
cd /root/siepa-ap/backend
cp .env.example .env
nano .env  # Editar con los valores reales
```

Variables mínimas requeridas:
```env
NODE_ENV=production
PORT=5000
JWT_SECRET=tu_secreto_jwt_generado
CORS_ORIGIN=http://187.33.148.149,https://TU_DOMINIO
DATABASE_URL=postgresql://postgres:tu_password@localhost:5432/siepa
```

### 4. Ejecutar migraciones

```bash
cd /root/siepa-ap/backend
npx prisma migrate deploy
npx prisma generate
```

### 5. Instalar dependencias y construir frontend

```bash
# Backend
cd /root/siepa-ap/backend
npm install --production

# Frontend
cd /root/siepa-ap/frontend
npm install
npx vite build
```

### 6. Configurar Nginx

Crear archivo de configuración `/etc/nginx/sites-available/siepa`:

```nginx
server {
    listen 80;
    server_name 187.33.148.149 TU_DOMINIO;

    root /var/www/html;
    index index.html;

    # Frontend estático
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API backend
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Archivos subidos (uploads)
    location /uploads/ {
        proxy_pass http://localhost:5000/uploads/;
        proxy_set_header Host $host;
    }

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
    gzip_min_length 1000;
}
```

Activar el sitio:
```bash
ln -s /etc/nginx/sites-available/siepa /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default  # Eliminar default si existe
nginx -t
systemctl restart nginx
```

### 7. Copiar frontend a /var/www/html

```bash
cp -r /root/siepa-ap/frontend/dist/* /var/www/html/
```

### 8. Iniciar backend con PM2

```bash
cd /root/siepa-ap/backend
pm2 start src/app.js --name siepa-backend
pm2 save
pm2 startup  # Para que PM2 inicie con el sistema
```

### 9. Verificar que todo funcione

```bash
# Health check del backend
curl http://localhost:5000/
# {"status":"ok","service":"SIEPA Backend"...}

curl http://localhost:5000/health
# {"status":"healthy"...}

# Frontend a través de Nginx
curl http://localhost/
# Debe devolver el HTML del frontend
```

---

## 🔄 Despliegue Continuo (CI/CD con GitHub Webhooks)

### Configurar Webhook en GitHub

1. Ve a tu repositorio en GitHub → **Settings** → **Webhooks**
2. Clic en **Add webhook**
3. Configura:
   - **Payload URL**: `http://187.33.148.149:9000/hooks/deploy` (o la URL de tu webhook)
   - **Content type**: `application/json`
   - **Secret**: (genera uno con `openssl rand -hex 32`)
   - **Events**: `Just the push event`
4. Clic en **Add webhook**

### Configurar Webhook Receiver en el Servidor

Opción A — Script simple con Node.js (recomendado):

```bash
# Instalar webhook receiver simple
cd /root
mkdir webhook && cd webhook
npm init -y
npm install github-webhook-handler
```

Crear `webhook.js`:
```javascript
const http = require('http');
const { exec } = require('child_process');
const createHandler = require('github-webhook-handler');

const handler = createHandler({
  path: '/hooks/deploy',
  secret: 'TU_SECRETO_DEL_WEBHOOK'
});

http.createServer((req, res) => {
  handler(req, res, () => {
    res.statusCode = 404;
    res.end('Not found');
  });
}).listen(9000);

handler.on('push', (event) => {
  const branch = event.payload.ref;
  if (branch === 'refs/heads/master') {
    console.log('🚀 Despliegue iniciado para master...');
    exec('/root/siepa-ap/deploy.sh', (err, stdout, stderr) => {
      if (err) {
        console.error('❌ Error:', err);
        return;
      }
      console.log(stdout);
      console.log('✅ Despliegue completado.');
    });
  }
});

console.log('Webhook listener en puerto 9000');
```

Iniciar con PM2:
```bash
cd /root/webhook
pm2 start webhook.js --name siepa-webhook
pm2 save
```

---

## 📋 Despliegue Manual (Emergencia)

Si el webhook falla o necesitas desplegar manualmente:

```bash
cd /root/siepa-ap
./deploy.sh
```

O paso a paso:
```bash
cd /root/siepa-ap
git pull origin master
cd backend && npm install --production && npx prisma generate
cd ../frontend && npm install && npm run build
rm -rf /var/www/html/*
cp -r dist/* /var/www/html/
pm2 restart siepa-backend
systemctl restart nginx
```

---

## 🔧 Mantenimiento

### Logs

```bash
# Logs del backend
pm2 logs siepa-backend

# Logs de Nginx
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### Reiniciar servicios

```bash
pm2 restart siepa-backend
systemctl restart nginx
systemctl restart postgresql
```

### Backup de la base de datos

```bash
pg_dump -U postgres siepa > /root/backups/siepa_$(date +%Y%m%d_%H%M%S).sql
```

---

## 🔒 Seguridad

- El archivo `.env` **nunca** se sube a GitHub (está en `.gitignore`).
- Usa contraseñas seguras para PostgreSQL y JWT_SECRET.
- Configura HTTPS con Let's Encrypt cuando tengas un dominio.
- Mantén el firewall (UFW) habilitado:
  ```bash
  ufw allow 22    # SSH
  ufw allow 80    # HTTP
  ufw allow 443   # HTTPS
  ufw enable
  ```
