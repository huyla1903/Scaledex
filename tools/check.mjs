/*
@title        Scaledex - pre-deploy check
@version      0.1.0
@author       La Gia Huy
@since        2026-11-16
@updated      2026-11-16
@engine       Node.js 18+ (no npm packages)
@target       Windows / any OS; GitHub Actions (runs before the Pages deploy)
@about        Fails (exit 1) when something would break the live site:
                - a JS source file has a syntax error
                - data/scaledex.json doesn't parse, is missing a list, has an
                  empty list, duplicate ids or links to ids that don't exist
              Usage: node tools/check.mjs
*/
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const fail = (msg) => errors.push(msg);

// 1. Syntax of every JS source file
for (const f of ["app/dex.js", "obsidian-plugin/main.src.js", "pwa/sw.js", "tools/build.mjs"]) {
  try {
    execFileSync(process.execPath, ["--check", path.join(root, f)], { stdio: "pipe" });
  } catch (e) {
    fail(f + ": syntax error\n" + String(e.stderr || e.message).trim());
  }
}

// 2. Data file
let d = null;
try {
  d = JSON.parse(fs.readFileSync(path.join(root, "data/scaledex.json"), "utf8"));
} catch (e) {
  fail("data/scaledex.json: " + e.message);
}

if (d) {
  const ids = {};
  for (const k of ["regions", "characters", "figures", "products"]) {
    if (!Array.isArray(d[k]) || d[k].length === 0) { fail(k + ": missing or empty"); ids[k] = new Set(); continue; }
    const seen = new Set();
    for (const x of d[k]) {
      if (!x || !x.id) fail(k + ": entry without id");
      else if (seen.has(x.id)) fail(k + ": duplicate id " + x.id);
      else seen.add(x.id);
    }
    ids[k] = seen;
  }
  const ref = (where, set, id, what) => { if (!set.has(id)) fail(where + ": unknown " + what + " " + id); };
  for (const c of d.characters || []) {
    for (const f of c.figures || []) ref("character " + c.id, ids.figures, f, "figure");
  }
  for (const f of d.figures || []) {
    ref("figure " + f.id, ids.characters, f.characterId, "character");
    for (const p of f.productIds || []) ref("figure " + f.id, ids.products, p, "product");
    for (const r of f.regions || []) ref("figure " + f.id, ids.regions, r, "region");
  }
}

if (errors.length) {
  console.error(errors.length + " problem(s):\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log("OK: " + (d.figures.length) + " figures, " + d.characters.length + " characters, " + d.products.length + " products");
