# EC2 deployment (recommended)

Goal: expose the app on **port 80** (no `:5173` / `:8000`), and keep Postgres private.

## 1) Security Group

- Allow **80** to the world: `0.0.0.0/0`
- Allow **22** only from your IP: `<your-ip>/32`
- Remove public access to **5173**, **8000**, **5432**

## 2) Install runtime prerequisites

```bash
sudo apt-get update
sudo apt-get install -y python3 python3-venv nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## 3) Pull latest code

```bash
cd ~/Sathish
git pull origin main
```

## 4) Run the production installer

```bash
bash deploy/install_production.sh
```

This script will:

- create/fix `backend/venv`
- install backend requirements
- build the frontend with `VITE_API_BASE=/api`
- install the backend systemd service
- install the Nginx site on port `80`

## 5) Verify

Health check:

```bash
curl -I http://127.0.0.1:8000/api/health
systemctl status pos-backend --no-pager
systemctl status nginx --no-pager
```

Open in browser:
```text
http://51.21.224.224/
```
