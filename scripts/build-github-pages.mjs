import { spawn } from "node:child_process";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
// GitHub Pages uses the repository name, which differs from the npm package name.
const githubPagesBase = "/sites.magical-game-night-gatherings/";
const child = spawn(
  process.execPath,
  [resolve(root, "apps/catalogue/scripts/build.mjs")],
  {
    cwd: root,
    env: { ...process.env, CATALOGUE_BASE: githubPagesBase },
    stdio: "inherit",
  },
);
child.once("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
