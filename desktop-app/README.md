# POSS Desktop (Electron)

This is a thin desktop wrapper around the existing POSS web app.

It does **not** bundle the Python backend. It simply opens the configured web URL in a native window.

## Dev

1. Start the frontend (`frontend`) and backend (`backend`) as usual.
2. Run:
   - `cd desktop-app`
   - `npm install`
   - `npm run dev`

## Build Windows installer

- `cd desktop-app`
- `npm install`
- (Optional) set runtime URL for local testing: `set APP_URL=https://your-web-app-domain` (or use PowerShell `$env:APP_URL="..."`)
- `npm run dist:win`

The installer will be created under `desktop-app/dist/`.

Copy the generated `*.exe` to `<repo_root>/downloads/poss-desktop-setup.exe` on your server so it can be downloaded via `/downloads/poss-desktop-setup.exe`.

## Open from web (protocol handler)

The installer registers the `poss://` protocol.

From the About page, clicking "Open Desktop App" will attempt to open `poss://open?path=/home`.

## Configure server URL (installed desktop app)

If the installed desktop app opens a blank page, it usually means it is trying to load `http://localhost:8000` (default).

Run it once with the server URL; it will be saved to `%APPDATA%` user config for future launches:

- `POSS.exe --url=http://YOUR_SERVER_IP:5180`

Example:
- `POSS.exe --url=http://13.60.186.234:5180`
