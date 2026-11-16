#!/usr/bin/env node
/**
 * Language coverage check.
 *  1. Every static t("ns:key") used in the source exists in English.
 *  2. French and Kinyarwanda contain every English key (and no extra keys),
 *     except keys explicitly listed as English fallbacks in src/locales/review.json.
 *  3. Interpolation variables ({{name}}) match between languages.
 * Exits with code 1 when something is missing, so it can run in CI.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = path.join(root, "src", "locales");
const NAMESPACES = ["common", "properties", "maintenance", "inspections", "finances"];
const LANGS = ["en", "rw", "fr"];
const review = JSON.parse(fs.readFileSync(path.join(localesDir, "review.json"), "utf8"));
const allowedFallback = new Set(review.englishFallback ?? []);

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = String(v);
  }
  return out;
}

const PLURAL = /_(zero|one|two|few|many|other)$/;
const base = (k) => k.replace(PLURAL, "");
const data = {};
for (const lang of LANGS) {
  data[lang] = {};
  for (const ns of NAMESPACES) {
    const file = path.join(localesDir, lang, `${ns}.json`);
    data[lang][ns] = flatten(JSON.parse(fs.readFileSync(file, "utf8")));
  }
}

let problems = 0;
const report = (msg) => {
  problems++;
  console.error(`  ✗ ${msg}`);
};

// 1. Keys used in code.
function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, files);
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.includes(".test.")) files.push(p);
  }
  return files;
}
console.log("Checking keys used in the code exist in English…");
const used = new Set();
for (const file of walk(path.join(root, "src"))) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/\bt\(\s*["']([a-z]+):([A-Za-z0-9_.]+)["']/g)) used.add(`${m[1]}:${m[2]}`);
}
for (const full of used) {
  const [ns, key] = full.split(":");
  const en = data.en[ns];
  if (!en) { report(`unknown namespace in ${full}`); continue; }
  const exists = key in en || Object.keys(en).some((k) => base(k) === key || k.startsWith(`${key}.`));
  if (!exists) report(`missing in en: ${full}`);
}

// 2 + 3. Other languages match English.
for (const lang of LANGS.filter((l) => l !== "en")) {
  console.log(`Checking ${lang} against en…`);
  for (const ns of NAMESPACES) {
    const en = data.en[ns];
    const other = data[lang][ns];
    const enBases = new Set(Object.keys(en).map(base));
    const otherBases = new Set(Object.keys(other).map(base));
    for (const k of enBases) {
      if (!otherBases.has(k) && !allowedFallback.has(`${lang}:${ns}:${k}`)) report(`${lang} missing ${ns}:${k}`);
    }
    for (const k of otherBases) if (!enBases.has(k)) report(`${lang} has extra key ${ns}:${k}`);
    for (const [k, v] of Object.entries(en)) {
      const counterpart = other[k] ?? other[`${base(k)}_other`] ?? other[base(k)];
      if (counterpart === undefined) continue;
      const vars = (s) => [...s.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).filter((x) => x !== "count").sort().join(",");
      if (vars(v) !== vars(counterpart)) report(`${lang} ${ns}:${k} has different variables (${vars(counterpart)} vs ${vars(v)})`);
    }
  }
}

const reviewCount = (review.needsNativeReview ?? []).length;
console.log(`\n${used.size} keys used in code. Kinyarwanda strings flagged for native review: ${reviewCount}.`);
if (problems) {
  console.error(`\n${problems} problem(s) found.`);
  process.exit(1);
}
console.log("All languages complete. ✓");
