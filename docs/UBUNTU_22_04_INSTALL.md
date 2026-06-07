# J-Mart Production Install on Ubuntu 22.04

This guide installs J-Mart with Docker Compose, SQLite, and host Nginx.

Architecture:

```text
Browser
  -> Nginx :80/:443
    -> Docker container 127.0.0.1:3000
      -> SQLite file /opt/jmart/data/jmart.sqlite
```

## 1. Prepare Server

Use Ubuntu 22.04 LTS.

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg git nginx sqlite3 ufw
```

## 2. Install Docker Engine

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable docker
sudo systemctl start docker
```

Optional: allow your current user to run Docker without `sudo`.

```bash
sudo usermod -aG docker $USER
newgrp docker
```

## 3. Upload J-Mart Project

Create the app folder:

```bash
sudo mkdir -p /opt/jmart
sudo chown -R $USER:$USER /opt/jmart
```

Copy the project files into:

```text
/opt/jmart
```

Example using `rsync` from your local machine:

```bash
rsync -av --exclude node_modules --exclude .git ./J-Mart/ your-user@your-server:/opt/jmart/
```

On the server:

```bash
cd /opt/jmart
mkdir -p data backups
```

## 4. Create Environment File

```bash
cd /opt/jmart
cp .env.example .env
nano .env
```

Set a strong secret:

```env
NODE_ENV=production
PORT=3000
DATABASE_FILE=/data/jmart.sqlite
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=12h
```

Generate a random secret:

```bash
openssl rand -base64 48
```

Paste the generated value into `JWT_SECRET`.

## 5. Build and Start J-Mart

```bash
cd /opt/jmart
docker compose up -d --build
docker compose ps
```

Check logs:

```bash
docker compose logs -f jmart
```

Health check:

```bash
curl http://127.0.0.1:3000/api/health
```

Expected output:

```json
{"ok":true}
```

## 6. Configure Nginx

Copy the example config:

```bash
sudo cp /opt/jmart/deploy/nginx-jmart.conf /etc/nginx/sites-available/jmart
sudo nano /etc/nginx/sites-available/jmart
```

Change:

```nginx
server_name jmart.example.com;
```

to your real domain or server IP.

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/jmart /etc/nginx/sites-enabled/jmart
sudo nginx -t
sudo systemctl reload nginx
```

Open in browser:

```text
http://your-domain-or-server-ip
```

## 7. Configure Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Docker binds J-Mart only to `127.0.0.1:3000`, so users cannot bypass Nginx from outside the server.

## 8. Enable HTTPS

If you have a domain pointing to this server:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d jmart.example.com
```

Test auto-renew:

```bash
sudo certbot renew --dry-run
```

## 9. Backup SQLite

Create backup folders:

```bash
sudo mkdir -p /opt/jmart/backups
sudo chmod +x /opt/jmart/scripts/backup-sqlite.sh
```

Test backup:

```bash
DATABASE_FILE=/opt/jmart/data/jmart.sqlite BACKUP_DIR=/opt/jmart/backups /opt/jmart/scripts/backup-sqlite.sh
ls -lh /opt/jmart/backups
```

Add daily cron backup:

```bash
sudo crontab -e
```

Add:

```cron
0 2 * * * DATABASE_FILE=/opt/jmart/data/jmart.sqlite BACKUP_DIR=/opt/jmart/backups /opt/jmart/scripts/backup-sqlite.sh >> /var/log/jmart-backup.log 2>&1
```

Backups older than 30 days are deleted automatically.

## 10. First Login Checklist

Open J-Mart and sign in:

- Admin password: `admin123`
- Member Somchai PIN: `1111`

Immediately change:

1. Admin password from `Account`
2. Member passwords/PINs from `Members`
3. Product/category seed data to your real data

## 11. Common Operations

Restart:

```bash
cd /opt/jmart
docker compose restart
```

Stop:

```bash
cd /opt/jmart
docker compose down
```

Update after copying new code:

```bash
cd /opt/jmart
docker compose up -d --build
```

View logs:

```bash
cd /opt/jmart
docker compose logs -f jmart
```

Open SQLite manually:

```bash
sqlite3 /opt/jmart/data/jmart.sqlite
```

## 12. Restore From Backup

Stop app:

```bash
cd /opt/jmart
docker compose down
```

Restore:

```bash
cp /opt/jmart/backups/jmart-YYYYMMDD-HHMMSS.sqlite /opt/jmart/data/jmart.sqlite
```

Start app:

```bash
docker compose up -d
```

## 13. Security Notes

- Keep `.env` private.
- Use HTTPS for production.
- Change default passwords immediately.
- Keep Ubuntu and Docker updated.
- Keep SQLite backups outside the container.
- Do not expose port `3000` publicly; Nginx should be the only public entry point.
