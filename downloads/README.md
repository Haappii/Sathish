This folder is served by the backend as static files at `/downloads/*`.

Use it to host installable app files that users can download from the About page.

Examples:
- `haappii-billing.apk` (Android APK)
- `poss-desktop-setup.exe` (Windows desktop installer)

Notes:
- Do not commit real production installers if your repo policy forbids binaries.
- For deployment, copy the built installer into this folder on the server.
