import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

const DIRECTORY = join(process.cwd(), "prisma", "seeds", "solutions", "assets", "brands");
const SIZE = 256;
const OVERSAMPLING = 4;
const SVG_DENSITY = 72;

const sources = (await readdir(DIRECTORY)).filter((name) => name.endsWith(".svg")).sort();
if (!sources.length) throw new Error(`No SVG sources in ${DIRECTORY}`);

for (const source of sources) {
  const svg = await readFile(join(DIRECTORY, source));
  const png = await sharp(svg, { density: SVG_DENSITY * OVERSAMPLING })
    .resize(SIZE, SIZE, { kernel: "lanczos3" })
    .png({ compressionLevel: 9, effort: 10, palette: true, colours: 64 })
    .toBuffer();
  const target = source.replace(/\.svg$/u, ".png");
  await writeFile(join(DIRECTORY, target), png);
  process.stdout.write(`${target} ${png.length} bytes\n`);
}
