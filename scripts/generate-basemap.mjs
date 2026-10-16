import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { gzipSync } from "node:zlib";

import mapshaper from "mapshaper";

const ROOT = process.cwd();
const OUTPUT_DIRECTORY = join(ROOT, "public", "maps", "v1");
const LOCALES_DIRECTORY = join(ROOT, "i18n", "locales");
const NATURAL_EARTH_VERSION = "5.1.2";
const SOURCE_URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v${NATURAL_EARTH_VERSION}/geojson`;
const SOURCES = {
  worldCountries: {
    file: "ne_50m_admin_0_countries_lakes.geojson",
    sha256: "b4c14911c7eec4a5d920b90294de6c16fdb078425b2caa6974a38a0b261f9667",
  },
  countries: {
    file: "ne_10m_admin_0_countries_lakes.geojson",
    sha256: "4caf607838c3cfd211a52edda259e315513390a717a11067c5eb280f766cfb78",
  },
  states: {
    file: "ne_10m_admin_1_states_provinces_lines.geojson",
    sha256: "1a1f30ccaaf4cc9c4bde34266f0b8cbb955d3a4cf254b756912255f2ec7c75b6",
  },
  places: {
    file: "ne_10m_populated_places.geojson",
    sha256: "9b8e3de09048ef00dfc70357dbb9fa324493f214b5e0ae4daf1aa79a8d10116b",
  },
};
const MAX_LATITUDE = 85.0511287798;
const WORLD = { simplifyMeters: 5000, quantization: 50000, placeMaxZoom: 5 };
const DETAIL = {
  simplifyMeters: 1000,
  stateSimplifyMeters: 1500,
  stateMaxZoom: 9,
  stateClasses: ["Admin-1 boundary", "Admin-1 region boundary", "Admin-1 statistical boundary"],
  quantizationStepMeters: 120,
  firstZoom: 1,
  maxZoom: 8,
  maxGzipBytes: 150_000,
  landMargin: 0.01,
};
const EQUATOR_METERS = 40_075_016.686;
const BUDGET = { worldGzipBytes: 150_000, regionGzipBytes: 200_000, totalBytes: 5_000_000 };

function cacheDirectory() {
  const flag = process.argv.indexOf("--cache");
  if (flag !== -1 && process.argv[flag + 1]) return process.argv[flag + 1];
  return join(tmpdir(), `customermates-natural-earth-${NATURAL_EARTH_VERSION}`);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function download({ file, sha256: expected }, directory) {
  const path = join(directory, file);
  if (existsSync(path)) {
    const cached = await readFile(path);
    if (sha256(cached) === expected) return cached.toString("utf8");
  }
  const url = `${SOURCE_URL}/${file}`;
  console.log(`Downloading ${url}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const actual = sha256(buffer);
  if (actual !== expected) throw new Error(`${file}: SHA-256 ${actual} does not match the pinned ${expected}`);
  await writeFile(path, buffer);
  return buffer.toString("utf8");
}

async function labelLanguages() {
  const files = await readdir(LOCALES_DIRECTORY);
  return files
    .filter((file) => file.endsWith(".json"))
    .map((file) => basename(file, ".json"))
    .sort();
}

function roundedZoom(value) {
  return Math.round(Number(value) * 10) / 10;
}

function placeCollection(source, languages) {
  const features = JSON.parse(source)
    .features.map(({ properties, geometry }) => {
      const name = properties.NAME_EN || properties.NAME;
      const shaped = { n: name, z: roundedZoom(properties.MIN_ZOOM) };
      for (const language of languages) {
        const localized = properties[`NAME_${language.toUpperCase()}`];
        if (localized && localized !== name) shaped[language] = localized;
      }
      return { type: "Feature", properties: shaped, geometry };
    })
    .filter(({ properties, geometry }) => properties.n && Math.abs(geometry.coordinates[1]) < MAX_LATITUDE)
    .sort((left, right) => left.properties.z - right.properties.z || left.properties.n.localeCompare(right.properties.n, "en"));
  return JSON.stringify({ type: "FeatureCollection", features });
}

async function run(commands, input) {
  return mapshaper.applyCommands(commands, input);
}

function polygonLayers(simplifyMeters) {
  return [
    "-filter-fields",
    `-simplify interval=${simplifyMeters} keep-shapes`,
    "-innerlines target=land + name=borders",
    "-lines where='!B' target=land + name=coast",
    "-dissolve target=borders",
    "-dissolve target=coast",
    "-dissolve target=land",
  ].join(" ");
}

async function buildWorld(sources) {
  const output = await run(
    [
      "-i countries.geojson name=land",
      `-clip bbox=-180,${-MAX_LATITUDE},180,${MAX_LATITUDE}`,
      polygonLayers(WORLD.simplifyMeters),
      `-i places.geojson name=places`,
      `-filter 'z <= ${WORLD.placeMaxZoom}' target=places`,
      `-o world.json format=topojson quantization=${WORLD.quantization} target=land,coast,borders,places`,
    ].join(" "),
    { "countries.geojson": sources.worldCountries, "places.geojson": sources.places },
  );
  return JSON.parse(output["world.json"]);
}

async function buildDetailBase(sources) {
  const classes = DETAIL.stateClasses.map((name) => `FEATURECLA == '${name}'`).join(" || ");
  const output = await run(
    [
      "-i countries.geojson name=land",
      polygonLayers(DETAIL.simplifyMeters),
      "-i states.geojson name=states",
      `-filter "(${classes}) && MIN_ZOOM <= ${DETAIL.stateMaxZoom}"`,
      "-each 'z=Math.round(MIN_ZOOM)'",
      "-filter-fields z",
      `-simplify interval=${DETAIL.stateSimplifyMeters}`,
      "-dissolve z",
      "-i places.geojson name=places",
      `-filter 'z > ${WORLD.placeMaxZoom}' target=places`,
      "-o base.json format=topojson no-quantization target=land,coast,borders,states,places",
    ].join(" "),
    { "countries.geojson": sources.countries, "states.geojson": sources.states, "places.geojson": sources.places },
  );
  return output["base.json"];
}

function tileLongitude(x, zoom) {
  return (x / 2 ** zoom) * 360 - 180;
}

function tileLatitude(y, zoom) {
  return (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** zoom))) * 180) / Math.PI;
}

function tileBounds(zoom, x, y) {
  return { west: tileLongitude(x, zoom), south: tileLatitude(y + 1, zoom), east: tileLongitude(x + 1, zoom), north: tileLatitude(y, zoom) };
}

function bboxOption({ west, south, east, north }) {
  return [west, south, east, north].map((value) => Number(value.toFixed(7))).join(",");
}

function expanded(bounds, margin) {
  const width = (bounds.east - bounds.west) * margin;
  const height = (bounds.north - bounds.south) * margin;
  return {
    west: Math.max(-180, bounds.west - width),
    south: Math.max(-MAX_LATITUDE, bounds.south - height),
    east: Math.min(180, bounds.east + width),
    north: Math.min(MAX_LATITUDE, bounds.north + height),
  };
}

function quantizationFor(zoom) {
  return Math.min(100_000, Math.max(4_000, Math.round(EQUATOR_METERS / 2 ** zoom / DETAIL.quantizationStepMeters)));
}

function isEmpty(topology) {
  return Object.values(topology.objects).every((object) => !object.geometries || object.geometries.length === 0);
}

async function buildTile(base, zoom, x, y) {
  const bounds = tileBounds(zoom, x, y);
  const { west, south, east, north } = bounds;
  const placeFilter = `this.x >= ${west} && this.x < ${east} && this.y > ${south} && this.y <= ${north}`;
  const output = await run(
    [
      "-i base.json",
      `-clip bbox=${bboxOption(expanded(bounds, DETAIL.landMargin))} remove-slivers target=land`,
      `-clip bbox=${bboxOption(bounds)} target=coast,borders,states`,
      `-filter '${placeFilter}' target=places`,
      `-o tile.json format=topojson quantization=${quantizationFor(zoom)} target=land,coast,borders,states,places`,
    ].join(" "),
    { "base.json": base },
  );
  return JSON.parse(output["tile.json"]);
}

async function buildRegions(base) {
  const regions = [];
  const visit = async (zoom, x, y) => {
    const topology = await buildTile(base, zoom, x, y);
    if (isEmpty(topology)) return;
    const text = JSON.stringify(topology);
    if (gzipSync(text, { level: 9 }).length > DETAIL.maxGzipBytes && zoom < DETAIL.maxZoom) {
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ])
        await visit(zoom + 1, 2 * x + dx, 2 * y + dy);
      return;
    }
    regions.push({ id: `${zoom}/${x}/${y}`, file: `region-${zoom}-${x}-${y}.json`, text });
  };
  const count = 2 ** DETAIL.firstZoom;
  for (let x = 0; x < count; x += 1) for (let y = 0; y < count; y += 1) await visit(DETAIL.firstZoom, x, y);
  return regions.sort((left, right) => left.file.localeCompare(right.file, "en"));
}

function sizes(text) {
  return { raw: Buffer.byteLength(text), gzip: gzipSync(text, { level: 9 }).length };
}

function kilobytes(bytes) {
  return `${(bytes / 1000).toFixed(1)} KB`;
}

function readme(files, languages) {
  const rows = files.map(({ file, raw, gzip }) => `| \`${file}\` | ${kilobytes(raw)} | ${kilobytes(gzip)} |`);
  const total = files.reduce((sum, { raw }) => sum + raw, 0);
  return `# Basemap data (v1)

The map widget draws its basemap from these files. They ship with the application and are served from its own origin, so a map makes no request to a map, tile, font or geocoding provider.

## Source

[Natural Earth](https://www.naturalearthdata.com/) vector data, version ${NATURAL_EARTH_VERSION}, in the public domain ([terms of use](https://www.naturalearthdata.com/about/terms-of-use/)). The script downloads these files of the \`v${NATURAL_EARTH_VERSION}\` release from ${SOURCE_URL} and checks each against its pinned SHA-256:

${Object.values(SOURCES)
  .map(({ file, sha256: hash }) => `- \`${file}\` (\`${hash}\`)`)
  .join("\n")}

## Contents

- \`world.json\`: countries at 1:50m with lakes cut out, simplified to about ${WORLD.simplifyMeters / 1000} km, as \`land\` polygons, \`coast\` and \`borders\` lines, and the populated places with a minimum zoom up to ${WORLD.placeMaxZoom} as \`places\`. Its \`regions\` member lists the detail files by Web Mercator tile (\`zoom/x/y\`).
- \`region-<zoom>-<x>-<y>.json\`: one Web Mercator tile at 1:10m with the same layers plus \`states\` (first-order administrative boundaries up to Natural Earth minimum zoom ${DETAIL.stateMaxZoom}, merged per rounded minimum zoom \`z\`) and the remaining populated places. Land is simplified to about ${DETAIL.simplifyMeters / 1000} km, boundaries to ${DETAIL.stateSimplifyMeters / 1000} km. A tile is split into four while its gzipped size exceeds ${kilobytes(DETAIL.maxGzipBytes)}.
- Places keep only the name \`n\` (English), the Natural Earth minimum zoom \`z\` and the names in the application languages (${languages.join(", ")}) where they differ from the English one. Coordinates are TopoJSON quantized per file; nothing else of the source attributes is kept.

## Regenerate

\`\`\`sh
yarn basemap:generate [--cache <directory>]
\`\`\`

The script downloads only when it runs, never in CI or at run time; \`--cache\` keeps the verified downloads between runs. It rewrites this directory. A new data version belongs in a new \`public/maps/v<n>/\` directory, because the files are served with an immutable cache header.

## Files

| File | Size | Gzipped |
| --- | --- | --- |
${rows.join("\n")}

Total on disk: ${kilobytes(total)}.
`;
}

async function main() {
  const directory = cacheDirectory();
  await mkdir(directory, { recursive: true });
  const languages = await labelLanguages();
  const [worldCountries, countries, states, places] = await Promise.all([
    download(SOURCES.worldCountries, directory),
    download(SOURCES.countries, directory),
    download(SOURCES.states, directory),
    download(SOURCES.places, directory),
  ]);
  const sources = { worldCountries, countries, states, places: placeCollection(places, languages) };
  console.log("Building the world file");
  const world = await buildWorld(sources);
  console.log("Building the region files");
  const regions = await buildRegions(await buildDetailBase(sources));
  world.regions = regions.map(({ id }) => id);
  const files = [{ file: "world.json", text: JSON.stringify(world) }, ...regions];
  const measured = files.map(({ file, text }) => ({ file, text, ...sizes(text) }));
  const [worldFile, ...regionFiles] = measured;
  const total = measured.reduce((sum, { raw }) => sum + raw, 0);
  if (worldFile.gzip > BUDGET.worldGzipBytes) throw new Error(`world.json is ${worldFile.gzip} bytes gzipped`);
  for (const { file, gzip } of regionFiles)
    if (gzip > BUDGET.regionGzipBytes) throw new Error(`${file} is ${gzip} bytes gzipped`);
  if (total > BUDGET.totalBytes) throw new Error(`The basemap files take ${total} bytes`);
  await rm(OUTPUT_DIRECTORY, { recursive: true, force: true });
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  for (const { file, text } of measured) await writeFile(join(OUTPUT_DIRECTORY, file), text);
  await writeFile(join(OUTPUT_DIRECTORY, "README.md"), readme(measured, languages));
  for (const { file, raw, gzip } of measured) console.log(`${file.padEnd(28)} ${kilobytes(raw).padStart(10)} ${kilobytes(gzip).padStart(10)} gzipped`);
  console.log(`${measured.length} files, ${kilobytes(total)} on disk`);
}

await main();
