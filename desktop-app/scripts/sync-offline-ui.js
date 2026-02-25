/**
 * Copy the built frontend (../frontend/dist) into desktop-app/offline-ui
 * so the Electron wrapper can load the UI when the network is down.
 *
 * Usage:
 *   cd desktop-app
 *   npm run sync-offline-ui
 *
 * Make sure you have already run `npm run build` inside ../frontend.
 */
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const sourceDir = path.join(repoRoot, "frontend", "dist");
const targetDir = path.resolve(__dirname, "..", "offline-ui");

function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function main() {
  if (!fs.existsSync(sourceDir)) {
    console.error(
      `Missing frontend build at ${sourceDir}\n` +
        "Run `npm run build` inside the frontend folder first."
    );
    process.exitCode = 1;
    return;
  }

  copyDir(sourceDir, targetDir);
  console.log(`Offline UI synced:\n- from: ${sourceDir}\n- to:   ${targetDir}`);
}

main();
