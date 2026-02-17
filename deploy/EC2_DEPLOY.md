# EC2 deployment (recommended)

Goal: expose the app on **port 80** (no `:5173` / `:8000`), and keep Postgres private.

## 1) Security Group

- Allow **80** to the world: `0.0.0.0/0`
- Allow **22** only from your IP: `<your-ip>/32`
- Remove public access to **5173**, **8000**, **5432**

## 2) Build frontend

```bash
cd ~/POSS/frontend
npm install
npm run build
```

## 3) Run backend as a service (localhost only)

```bash
cd ~/POSS
sudo cp deploy/pos-backend.service /etc/systemd/system/pos-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now pos-backend
sudo systemctl status pos-backend --no-pager
```

Health check:
```bash
curl -I http://127.0.0.1:8000/api/health
```

## 4) Nginx (serve frontend + proxy /api)

```bash
sudo apt-get update
sudo apt-get install -y nginx
sudo cp ~/POSS/deploy/nginx-pos.conf /etc/nginx/sites-available/pos
sudo ln -sf /etc/nginx/sites-available/pos /etc/nginx/sites-enabled/pos
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

Open in browser:
```text
http://13.60.186.234/
```

