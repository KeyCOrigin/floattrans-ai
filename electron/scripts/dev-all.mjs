import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const vite = spawn("npx", ["vite"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

function tryStartElectron() {
  fetch("http://localhost:5173")
    .then(() => {
      const electron = spawn("npx", ["electron", "."], {
        cwd: root,
        stdio: "inherit",
        shell: true,
      });
      electron.on("exit", () => {
        vite.kill();
        process.exit(0);
      });
    })
    .catch(() => setTimeout(tryStartElectron, 500));
}

setTimeout(tryStartElectron, 1000);

process.on("SIGINT", () => { vite.kill(); process.exit(0); });
process.on("SIGTERM", () => { vite.kill(); process.exit(0); });
