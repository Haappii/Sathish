const fs = require("fs");
const path = require("path");

function findNewestExe(distDir) {
  const entries = fs.readdirSync(distDir, { withFileTypes: true });
  const exeFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".exe"))
    .map((e) => path.join(distDir, e.name))
    .map((fullPath) => ({
      fullPath,
      mtimeMs: fs.statSync(fullPath).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return exeFiles.length ? exeFiles[0].fullPath : null;
}

function main() {
  const here = __dirname;
  const desktopAppDir = path.resolve(here, "..");
  const distDir = path.join(desktopAppDir, "dist");
  const repoRoot = path.resolve(desktopAppDir, "..");
  const downloadsDir = path.join(repoRoot, "downloads");
  const targetPath = path.join(downloadsDir, "poss-desktop-setup.exe");

  if (!fs.existsSync(distDir)) {
    console.error(`dist folder not found: ${distDir}`);
    process.exitCode = 1;
    return;
  }

  const newestExe = findNewestExe(distDir);
  if (!newestExe) {
    console.error(`No .exe found under: ${distDir}`);
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(downloadsDir, { recursive: true });
  fs.copyFileSync(newestExe, targetPath);
  console.log(`Copied installer:\n- from: ${newestExe}\n- to:   ${targetPath}`);
}

main();

