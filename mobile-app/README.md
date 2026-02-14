# Haappii Billing Mobile (v2.0.0 - Phase 1)

Phase 1 features implemented:
- Login
- Home (role + permission aware menu)
- Create Bill
- Sales History (with invoice detail view)

## 1) Install

```bash
cd mobile-app
npm install
```

## 2) Configure API

Create `.env` from `.env.example` and set backend URL:

```bash
EXPO_PUBLIC_API_BASE=http://YOUR_LAN_IP:8000
```

Examples:
- Android emulator (same laptop backend): `http://10.0.2.2:8000`
- Physical phone + laptop backend: `http://<your-laptop-lan-ip>:8000`

## 3) Run locally

```bash
npm run start
```

Then in Expo terminal:
- Press `a` to open Android emulator
- Press `w` to open web preview
- Or scan QR in Expo Go app on your phone

## 4) Check mobile UI on laptop

Option A (recommended): Android Studio emulator
1. Open Android Studio -> Device Manager -> start an emulator
2. Run `npm run android`
3. Validate layouts in emulator (closest to real mobile UI)

Option B: Expo web
1. Run `npm run web`
2. In browser DevTools, toggle device toolbar (mobile width)
3. Good for quick checks, but emulator is more accurate
