/*
@title        Scaledex - build
@version      0.1.0
@author       La Gia Huy
@since        2026-11-14
@updated      2026-11-14
@engine       Node.js 18+ (no npm packages)
@target       Windows / any OS
@about        Assembles dist/ from the shared core (app/), the data (data/) and the
              two wrappers (pwa/, obsidian-plugin/):
                dist/pwa/            static web app; host it on any HTTPS static host
                dist/scaledex/ Obsidian plugin folder (main.js, manifest.json, styles.css)
              Options:
                --vault "<path>"     also install the plugin into <path>/.obsidian/plugins/
                --vault-images       with --vault: copy images to <vault>/Scaledex/
*/
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = (...a) => path.join(ROOT, ...a);
const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

const read = (f) => fs.readFileSync(f, "utf8");
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
function copyDir(src, dst) {
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) n += copyDir(s, d);
    else if (!fs.existsSync(d) || fs.statSync(d).size !== fs.statSync(s).size) { fs.copyFileSync(s, d); n++; }
  }
  return n;
}

// remove files in dst that no longer exist in src (stale images after a data rebuild)
function prune(src, dst) {
  if (!fs.existsSync(dst)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(dst, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (!fs.existsSync(s)) { fs.rmSync(d, { recursive: true, force: true }); n++; }
    else if (e.isDirectory()) n += prune(s, d);
  }
  return n;
}

const dataFile = p("data", "scaledex.json");
if (!fs.existsSync(dataFile)) { console.error("Missing data/scaledex.json - run scraper/build_data.py first."); process.exit(1); }
const dataRaw = read(dataFile);
const data = JSON.parse(dataRaw);
const core = read(p("app", "dex.js"));
const css = read(p("app", "dex.css"));
const hash = crypto.createHash("sha1").update(core + css + dataRaw).digest("hex").slice(0, 8);

// ---------- Obsidian plugin
const pluginDir = p("dist", "scaledex");
const compactData = JSON.stringify(data);
let main = read(p("obsidian-plugin", "main.src.js"))
  .replace("/*__DEX_CORE__*/", () => core)
  .replace("/*__DEX_DATA__*/ null", () => compactData);
write(path.join(pluginDir, "main.js"), main);
fs.copyFileSync(p("obsidian-plugin", "manifest.json"), path.join(pluginDir, "manifest.json"));
const hostCss = `
/* Obsidian host */
.workspace-leaf-content[data-type="scaledex"] .view-content.swdex-host { padding: 0; overflow: hidden; position: relative; }
.swdex-host > .swdex { position: absolute; inset: 0; }
`;
write(path.join(pluginDir, "styles.css"), css + hostCss);

// ---------- PWA
const pwa = p("dist", "pwa");
fs.mkdirSync(pwa, { recursive: true });
for (const f of ["index.html", "manifest.webmanifest"]) fs.copyFileSync(p("pwa", f), path.join(pwa, f));
write(path.join(pwa, "sw.js"), read(p("pwa", "sw.js")).replace(/swdex-shell-v1/g, "swdex-shell-" + hash));
fs.copyFileSync(p("app", "dex.js"), path.join(pwa, "dex.js"));
fs.copyFileSync(p("app", "dex.css"), path.join(pwa, "dex.css"));
copyDir(p("pwa", "icons"), path.join(pwa, "icons"));
write(path.join(pwa, "data", "scaledex.json"), compactData);
const nImg = copyDir(p("data", "images"), path.join(pwa, "data", "images"));
prune(p("data", "images"), path.join(pwa, "data", "images"));

console.log(`Built ${hash}: ${data.characters.length} characters, ${data.figures.length} figures, ${data.products.length} releases`);
console.log("  dist/scaledex/  main.js " + Math.round(main.length / 1024) + " KB");
console.log("  dist/pwa/             (" + nImg + " images copied/updated)");

// ---------- install into a vault
const vault = argVal("--vault");
if (vault) {
  const target = path.join(vault, ".obsidian", "plugins", "scaledex");
  fs.mkdirSync(target, { recursive: true });
  for (const f of ["main.js", "manifest.json", "styles.css"]) fs.copyFileSync(path.join(pluginDir, f), path.join(target, f));
  console.log("Installed plugin into " + target);
  if (args.includes("--vault-images")) {
    const n = copyDir(p("data", "images"), path.join(vault, "Scaledex", "images"));
    console.log("Copied " + n + " images into " + path.join(vault, "Scaledex", "images"));
  }
}
