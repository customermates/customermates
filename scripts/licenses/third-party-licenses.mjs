// Writes THIRD_PARTY_LICENSES.md from yarn.lock and the installed packages, and fails on any dependency whose
// licence is not a valid SPDX expression. `--check` only validates; `--out FILE` writes elsewhere. The release
// workflow runs both before it publishes. A package whose real licence is known but whose manifest has no valid
// SPDX expression is listed in overrides.json with the reason; nothing else passes.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const SPDX = JSON.parse(readFileSync(join(HERE, "spdx-identifiers.json"), "utf8"));
const LICENSE_IDS = new Map(SPDX.licenses.map((id) => [id.toLowerCase(), id]));
const EXCEPTION_IDS = new Map(SPDX.exceptions.map((id) => [id.toLowerCase(), id]));
const LICENSE_FILE = /^(?:licen[cs]e|copying|notice|unlicense)(?:[-_.][a-z0-9._-]*)?$/i;
const MAX_TEXT_BYTES = 200_000;
const ID_STRING = /^[A-Za-z0-9.-]+$/;
const UNDECLARED = "LicenseRef-no-license-declared";

function packageOfSpec(spec) {
  const at = spec.indexOf("@", 1);
  if (at < 0) return null;
  const name = spec.slice(0, at);
  const range = spec.slice(at + 1);
  if (/^(?:link|file|portal):/.test(range)) return null;
  if (range.startsWith("npm:")) {
    const target = range.slice(4);
    const targetAt = target.indexOf("@", 1);
    return targetAt < 0 ? target : target.slice(0, targetAt);
  }
  return name;
}

export function parseLockfile(text) {
  const entries = new Map();
  let names = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("#") || line.trim() === "") continue;
    if (!line.startsWith(" ")) {
      names = line
        .replace(/:$/, "")
        .split(",")
        .map((spec) => packageOfSpec(spec.trim().replace(/^"|"$/g, "")))
        .filter(Boolean);
      continue;
    }
    const match = /^ {2}version "([^"]+)"$/.exec(line);
    if (match && names) for (const name of new Set(names)) entries.set(`${name}@${match[1]}`, { name, version: match[1] });
  }
  return [...entries.values()].sort((a, b) => compare(`${a.name}@${a.version}`, `${b.name}@${b.version}`));
}

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function tokens(expression) {
  return expression.match(/\(|\)|[^\s()]+/g) ?? [];
}

export function validateSpdx(expression) {
  if (typeof expression !== "string" || expression.trim() === "") return { valid: false, reason: "empty" };
  const list = tokens(expression);
  let index = 0;
  let reason = "";
  const fail = (message) => {
    if (!reason) reason = message;
    return false;
  };
  const term = () => {
    const token = list[index];
    if (token === undefined) return fail("unexpected end");
    if (token === "(") {
      index += 1;
      if (!expr()) return false;
      if (list[index] !== ")") return fail("missing )");
      index += 1;
      return true;
    }
    let id = token;
    const orLater = id.endsWith("+");
    if (orLater) id = id.slice(0, -1);
    const known = LICENSE_IDS.has(id.toLowerCase());
    const reference = /^(?:DocumentRef-[A-Za-z0-9.-]+:)?LicenseRef-[A-Za-z0-9.-]+$/.test(id);
    if (!known && !reference) return fail(`unknown identifier ${token}`);
    if (reference && orLater) return fail(`${token} cannot take +`);
    index += 1;
    if (list[index] === "WITH") {
      index += 1;
      const exception = list[index];
      if (exception === undefined || !EXCEPTION_IDS.has(exception.toLowerCase()) || !ID_STRING.test(exception))
        return fail(`unknown exception ${exception ?? "(none)"}`);
      index += 1;
    }
    return true;
  };
  const expr = () => {
    if (!term()) return false;
    while (list[index] === "AND" || list[index] === "OR") {
      index += 1;
      if (!term()) return false;
    }
    return true;
  };
  const ok = expr() && index === list.length;
  if (ok) return { valid: true, normalized: normalize(list) };
  return { valid: false, reason: reason || `unexpected ${list[index] ?? "end"}` };
}

function normalize(list) {
  return list
    .map((token) => {
      if (["(", ")", "AND", "OR", "WITH"].includes(token)) return token;
      const orLater = token.endsWith("+");
      const id = orLater ? token.slice(0, -1) : token;
      const canonical = LICENSE_IDS.get(id.toLowerCase()) ?? EXCEPTION_IDS.get(id.toLowerCase()) ?? id;
      return orLater ? `${canonical}+` : canonical;
    })
    .join(" ")
    .replace(/\( /g, "(")
    .replace(/ \)/g, ")");
}

export function licenseField(manifest) {
  const { license, licenses } = manifest;
  if (typeof license === "string") return license;
  if (license && typeof license === "object" && typeof license.type === "string") return license.type;
  if (Array.isArray(licenses)) {
    const types = licenses.map((entry) => (typeof entry === "string" ? entry : entry?.type)).filter(Boolean);
    if (types.length === 1) return types[0];
    if (types.length > 1) return `(${types.join(" OR ")})`;
  }
  return null;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function installedPackages(root = ROOT) {
  const found = new Map();
  const visit = (modulesDir) => {
    let names;
    try {
      names = readdirSync(modulesDir);
    } catch {
      return;
    }
    for (const entry of names.sort()) {
      if (entry.startsWith(".")) continue;
      const dirs = entry.startsWith("@")
        ? readdirSync(join(modulesDir, entry))
            .sort()
            .map((child) => join(modulesDir, entry, child))
        : [join(modulesDir, entry)];
      for (const dir of dirs) {
        const manifest = readJson(join(dir, "package.json"));
        if (manifest?.name && manifest.version) {
          const key = `${manifest.name}@${String(manifest.version).replace(/^v/, "")}`;
          if (!found.has(key)) found.set(key, { dir, manifest });
        }
        visit(join(dir, "node_modules"));
      }
    }
  };
  visit(join(root, "node_modules"));
  return found;
}

function readTexts(dir) {
  let names = [];
  try {
    names = readdirSync(dir).sort();
  } catch {
    return [];
  }
  const texts = [];
  for (const name of names) {
    if (!LICENSE_FILE.test(name)) continue;
    const path = join(dir, name);
    try {
      if (!statSync(path).isFile() || statSync(path).size > MAX_TEXT_BYTES) continue;
      const text = readFileSync(path, "utf8").replace(/\r\n?/g, "\n").trim();
      if (text) texts.push(text);
    } catch {
      continue;
    }
  }
  return texts;
}

function sourceUrl(manifest) {
  const repository = typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url;
  const raw = repository || manifest.homepage || "";
  const cleaned = raw
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/^github:/, "https://github.com/")
    .replace(/\.git(?=$|#)/, "")
    .replace(/#.*$/, "");
  if (/^https?:\/\//.test(cleaned)) return cleaned;
  if (/^[\w.-]+\/[\w.-]+$/.test(cleaned)) return `https://github.com/${cleaned}`;
  return `https://www.npmjs.com/package/${manifest.name}/v/${manifest.version}`;
}

export function loadOverrides(path = join(HERE, "overrides.json")) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}

export function collect({ root = ROOT, overrides = loadOverrides() } = {}) {
  const lockfile = parseLockfile(readFileSync(join(root, "yarn.lock"), "utf8"));
  const found = installedPackages(root);
  const packages = [];
  const problems = [];
  const notInstalled = [];
  for (const { name, version } of lockfile) {
    const key = `${name}@${version}`;
    const installed = found.get(key);
    if (!installed) {
      notInstalled.push(key);
      continue;
    }
    const declared = licenseField(installed.manifest);
    const override = overrides[key];
    if (override && !String(override.reason ?? "").trim()) {
      problems.push(`overrides.json: ${key} needs a reason`);
      continue;
    }
    const expression = override?.license ?? declared;
    const result = validateSpdx(expression);
    if (!result.valid) {
      problems.push(
        `${key}: ${declared === null ? "no license field" : `"${declared}"`} is not a valid SPDX expression (${result.reason})`,
      );
      continue;
    }
    packages.push({
      name,
      version,
      license: result.normalized,
      overridden: Boolean(override?.license),
      url: sourceUrl(installed.manifest),
      texts: readTexts(installed.dir),
    });
  }
  const unusedOverrides = Object.keys(overrides).filter(
    (key) => !lockfile.some((entry) => `${entry.name}@${entry.version}` === key),
  );
  for (const key of unusedOverrides) problems.push(`overrides.json: ${key} is not in yarn.lock any more; remove it`);
  return { packages, problems, notInstalled };
}

function fence(text) {
  let marks = "~~~~";
  while (text.includes(marks)) marks += "~";
  return `${marks}text\n${text}\n${marks}`;
}

export function render({ packages, notInstalled }, platform = `${process.platform}-${process.arch}`) {
  const byLicense = new Map();
  for (const entry of packages) byLicense.set(entry.license, (byLicense.get(entry.license) ?? 0) + 1);
  const groups = new Map();
  const withoutText = [];
  for (const entry of packages) {
    if (entry.texts.length === 0) {
      withoutText.push(entry);
      continue;
    }
    const text = entry.texts.join("\n\n");
    const hash = createHash("sha256").update(text).digest("hex");
    if (!groups.has(hash)) groups.set(hash, { text, members: [] });
    groups.get(hash).members.push(`${entry.name}@${entry.version}`);
  }
  const lines = [
    "# Third-party licenses",
    "",
    "This file lists the third-party packages that Customermates installs from `yarn.lock`, with their licenses and license texts. It is generated by `yarn licenses:generate`; do not edit it. The release workflow generates it again for every release and attaches it to the GitHub release.",
    "",
    `Packages listed: ${packages.length}, installed for ${platform}. Lockfile packages that are not installed for this platform are named at the end.`,
    "",
    "## Licenses in use",
    "",
    "| License | Packages |",
    "| --- | ---: |",
    ...[...byLicense.entries()].sort((a, b) => b[1] - a[1] || compare(a[0], b[0])).map(([license, count]) => `| ${license} | ${count} |`),
    "",
    "## Packages",
    "",
    "| Package | Version | License | Source |",
    "| --- | --- | --- | --- |",
    ...packages.map(
      (entry) =>
        `| ${entry.name} | ${entry.version} | ${entry.license}${entry.overridden ? " (verified by hand)" : ""} | ${entry.url} |`,
    ),
    "",
    "## License texts",
    "",
  ];
  const ordered = [...groups.values()].sort((a, b) => compare(a.members[0], b.members[0]));
  ordered.forEach((group, index) => {
    lines.push(`### Text ${index + 1}`, "", `Used by: ${group.members.join(", ")}`, "", fence(group.text), "");
  });
  if (withoutText.length) {
    lines.push(
      "### Packages without a license file",
      "",
      "These packages carry no license file. Their package.json states the license listed above.",
      "",
      ...withoutText.map((entry) => `- ${entry.name}@${entry.version} (${entry.license})`),
      "",
    );
  }
  if (notInstalled.length)
    lines.push(
      "## Packages not installed for this platform",
      "",
      "These packages are in `yarn.lock` but `yarn install` does not put them in `node_modules` for the platform above: optional binaries for other operating systems and processors, their WebAssembly fallbacks, and entries that only a resolution keeps. Run the generator on the matching platform to list their licenses.",
      "",
      ...notInstalled.map((key) => `- ${key}`),
      "",
    );
  return `${lines.join("\n")}\n`;
}

export function main(argv = process.argv.slice(2), defaultRoot = ROOT, overrides = loadOverrides()) {
  const checkOnly = argv.includes("--check");
  const optionValue = (flag) => (argv.indexOf(flag) >= 0 ? resolve(argv[argv.indexOf(flag) + 1] ?? "") : null);
  const root = optionValue("--root") ?? defaultRoot;
  const out = optionValue("--out") ?? join(root, "THIRD_PARTY_LICENSES.md");
  const result = collect({ root, overrides });
  if (result.packages.length === 0) result.problems.push("no installed packages found; run yarn install --frozen-lockfile");
  if (result.problems.length) {
    console.error(`${result.problems.length} dependency license problem(s):`);
    for (const problem of result.problems) console.error(`  ${problem}`);
    return 1;
  }
  const undeclared = result.packages.filter((entry) => entry.license.includes(UNDECLARED));
  for (const entry of undeclared)
    console.warn(`Warning: ${entry.name}@${entry.version} declares no license anywhere; recorded in overrides.json.`);
  if (checkOnly) {
    console.log(
      `All ${result.packages.length} installed dependencies have a valid SPDX license (${result.notInstalled.length} lockfile packages not installed for this platform).`,
    );
    return 0;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, render(result));
  console.log(`Wrote ${out} for ${result.packages.length} packages.`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exit(main());
