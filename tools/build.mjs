/*
@title        Scaledex - build
@version      0.1.5
@author       La Gia Huy
@since        2026-11-14
@updated      2026-11-26
@engine       Node.js 18+ (no npm packages)
@target       Windows / any OS
@about        Assembles dist/ from the shared core (app/), the data (data/) and the
              two wrappers (pwa/, obsidian-plugin/). The plugin's manifest.json lives
              at the repo root, where Obsidian's plugin directory looks for it:
                dist/pwa/            static web app; host it on any HTTPS static host
                dist/scaledex/ Obsidian plugin folder (main.js, manifest.json, styles.css)
              Options:
                --vault "<path>"     also install the plugin into <path>/.obsidian/plugins/
                --vault-images       with --vault: copy images to the plugin's cache
                                     (<vault>/.obsidian/plugins/scaledex/cache/images/)
                --remote-images      PWA loads pictures from bandai.co.jp and no
                                     images are copied (used for GitHub Pages)
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
// home-card landscapes: app/landscapes/<region>.jpg -> LANDSCAPES in the core
const landDir = p("app", "landscapes");
const lands = fs.existsSync(landDir) ? fs.readdirSync(landDir).filter((f) => /\.jpe?g$/i.test(f)).sort() : [];
const landMap = (url) => JSON.stringify(Object.fromEntries(lands.map((f) => [f.replace(/\.[^.]+$/, ""), url(f)])));
// menu donation QR: app/donate.jpg -> DONATE_QR in the core (absent = no section)
const donateFile = p("app", "donate.jpg");
const hasDonate = fs.existsSync(donateFile);
const withLands = (url, donate) => core.replace("/*__LANDSCAPES__*/ {}", () => landMap(url))
  .replace('/*__DONATE__*/ ""', () => JSON.stringify(hasDonate ? donate : ""));
const hash = crypto.createHash("sha1").update(core + css + dataRaw + lands.map((f) => f + fs.statSync(path.join(landDir, f)).size).join() + (hasDonate ? fs.statSync(donateFile).size : "")).digest("hex").slice(0, 8);

// ---------- Obsidian plugin
const pluginDir = p("dist", "scaledex");
const compactData = JSON.stringify(data);
let main = read(p("obsidian-plugin", "main.src.js"))
  .replace("/*__DEX_CORE__*/", () => withLands((f) => "data:image/jpeg;base64," + fs.readFileSync(path.join(landDir, f)).toString("base64"),
    hasDonate ? "data:image/jpeg;base64," + fs.readFileSync(donateFile).toString("base64") : ""))
  .replace("/*__DEX_DATA__*/ null", () => compactData);
write(path.join(pluginDir, "main.js"), main);
fs.copyFileSync(p("manifest.json"), path.join(pluginDir, "manifest.json"));
const hostCss = `
/* Obsidian host */
.workspace-leaf-content[data-type="scaledex"] .view-content.swdex-host { padding: 0; overflow: hidden; position: relative; }
.swdex-host > .swdex { position: absolute; inset: 0; }
`;
write(path.join(pluginDir, "styles.css"), css + hostCss);

// ---------- PWA
const pwa = p("dist", "pwa");
fs.mkdirSync(pwa, { recursive: true });
const remoteImages = args.includes("--remote-images");
let indexHtml = read(p("pwa", "index.html"));
if (remoteImages) indexHtml = indexHtml.replace("var LOCAL_IMAGES = true;", "var LOCAL_IMAGES = false;");
write(path.join(pwa, "index.html"), indexHtml);
fs.copyFileSync(p("pwa", "manifest.webmanifest"), path.join(pwa, "manifest.webmanifest"));
write(path.join(pwa, "sw.js"), read(p("pwa", "sw.js")).replace(/swdex-shell-v1/g, "swdex-shell-" + hash));
write(path.join(pwa, "dex.js"), withLands((f) => "landscapes/" + f, "donate.jpg"));
if (hasDonate) fs.copyFileSync(donateFile, path.join(pwa, "donate.jpg"));
copyDir(landDir, path.join(pwa, "landscapes"));
fs.copyFileSync(p("app", "dex.css"), path.join(pwa, "dex.css"));
copyDir(p("pwa", "icons"), path.join(pwa, "icons"));
write(path.join(pwa, "data", "scaledex.json"), compactData);
const nImg = remoteImages ? 0 : copyDir(p("data", "images"), path.join(pwa, "data", "images"));
if (!remoteImages) prune(p("data", "images"), path.join(pwa, "data", "images"));

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
    const dst = path.join(target, "cache", "images");
    const n = copyDir(p("data", "images"), dst);
    console.log("Copied " + n + " images into " + dst);
  }
}
