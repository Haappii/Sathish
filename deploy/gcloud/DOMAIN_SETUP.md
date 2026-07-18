# Domain Setup — haappiibilling.in → Cloud Run

## Architecture (Updated)

```
User → haappiibilling.in
         ↓ (Cloudflare Free CDN + SSL proxy)
       Cloud Run (asia-south1)
         ↓
       Cloud SQL PostgreSQL
```

Cloud Run domain mappings are not supported in `asia-south1` (Mumbai).
**Cloudflare free tier** is used as a reverse proxy — gives SSL, CDN, and custom domain for $0.

---

## Step 1 — Create Free Cloudflare Account

1. Go to https://cloudflare.com → Sign up free
2. Click **"Add a site"** → enter `haappiibilling.in`
3. Select **Free plan**
4. Cloudflare will scan your GoDaddy DNS records

---

## Step 2 — Add DNS Records in Cloudflare

After Cloudflare scans, **delete any old A records** and add these:

| Type  | Name | Target                                                              | Proxy   |
|-------|------|---------------------------------------------------------------------|---------|
| CNAME | @    | `shop-billing-backend-316182685030.asia-south1.run.app`             | Proxied |
| CNAME | www  | `shop-billing-backend-316182685030.asia-south1.run.app`             | Proxied |

> The orange cloud icon = **Proxied** (Cloudflare routes traffic through its network)
> This enables free SSL + CDN for haappiibilling.in

---

## Step 3 — Set Cloudflare SSL Mode

In Cloudflare → **SSL/TLS** → set mode to **Full** (not Full Strict)

This tells Cloudflare to:
- Present its own SSL cert to visitors (https://haappiibilling.in ✓)
- Connect to Cloud Run using Cloud Run's `*.run.app` SSL cert

---

## Step 4 — Change Nameservers in GoDaddy

Cloudflare will give you 2 nameservers like:
```
alice.ns.cloudflare.com
bob.ns.cloudflare.com
```

In **GoDaddy → My Domains → haappiibilling.in → DNS → Nameservers**:
- Click **"Change nameservers"**
- Select **"I'll use my own nameservers"**
- Enter Cloudflare's nameservers
- Save

GoDaddy nameserver change takes **1–48 hours** to propagate.

---

## Step 5 — Verify

Once DNS propagates, test:
```
https://haappiibilling.in          ← should show the login page
https://haappiibilling.in/api/health  ← should return {"status":"ok"}
https://haappiibilling.in/docs     ← API documentation
```

---

## Current Live URL (before domain setup)

The app is already accessible at:
```
https://shop-billing-backend-316182685030.asia-south1.run.app
```

You can use this URL immediately to test the application while waiting for DNS to propagate.

---

## Default Login Credentials

```
Username: admin
Password: admin123
```

⚠️ Change this password immediately after first login.
