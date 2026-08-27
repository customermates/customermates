import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import { APPROVED_NATIVE_VISUAL_ASSETS } from "../../components/marketing/visuals/native-fixtures";

const REVIEW_FONTS = [
  {
    family: "Customermates Review Sans",
    path: resolve(
      "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
    ),
    variable: "--font-sans",
    weight: "400 700",
  },
  {
    family: "Customermates Review Mono",
    path: resolve(
      "node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
    ),
    variable: "--font-mono",
    weight: "400 500",
  },
] as const;

async function reviewDataUri(asset: string) {
  const path = resolve("public", asset.slice(1));
  const extension = extname(asset);
  const source = await readFile(path);
  const mimeType = extension === ".svg" ? "image/svg+xml" : "image/png";

  return `data:${mimeType};base64,${source.toString("base64")}`;
}

export async function inlineApprovedVisualAssets(markup: string) {
  let inlined = markup;

  for (const asset of APPROVED_NATIVE_VISUAL_ASSETS) {
    if (!inlined.includes(asset)) continue;
    inlined = inlined.replaceAll(asset, await reviewDataUri(asset));
  }

  return inlined;
}

export async function inlineReviewFonts(stylesheet: string) {
  const faces = await Promise.all(
    REVIEW_FONTS.map(async (font) => {
      const body = await readFile(font.path);
      return `@font-face{font-family:"${font.family}";src:url("data:font/woff2;base64,${body.toString("base64")}") format("woff2");font-style:normal;font-weight:${font.weight};font-display:swap;}`;
    }),
  );
  const variables = REVIEW_FONTS.map(
    (font) => `${font.variable}:"${font.family}"`,
  ).join(";");

  return `${faces.join("")}\n:root{${variables}}\n${stylesheet}`;
}
