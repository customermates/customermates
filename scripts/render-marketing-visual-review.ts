import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

import tailwindcss from "@tailwindcss/postcss";
import postcss, { type AcceptedPlugin } from "postcss";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { getGoldenVisualBrief } from "../components/marketing/visuals/goldens";
import {
  GoldenBenchmarkReviewSheet,
  VisualBriefReferenceSheet,
} from "../components/marketing/visuals/visual-review-sheet";
import {
  type BrandIllustrationBrief,
  VISUAL_LOCALES,
  VISUAL_PATHWAYS,
  validateVisualBrief,
} from "../components/marketing/visuals/visual-contract";
import { inlineApprovedVisualAssets, inlineReviewFonts } from "./lib/inline-marketing-visual-assets";

const { values } = parseArgs({
  options: {
    golden: { type: "string" },
    input: { type: "string" },
    locale: { default: "en", type: "string" },
    output: { type: "string" },
  },
});

function oneOf<T extends string>(value: string, allowed: readonly T[], name: string): T {
  if (!allowed.includes(value as T)) throw new Error(`${name} must be one of ${allowed.join(", ")}`);
  return value as T;
}

type ReviewInput =
  | { brief: BrandIllustrationBrief; kind: "brief" }
  | { brief: ReturnType<typeof getGoldenVisualBrief>; kind: "golden" };

function loadReviewInput(): ReviewInput {
  if (Boolean(values.input) === Boolean(values.golden)) throw new Error("Choose exactly one of --input or --golden");

  if (values.input) {
    const inputPath = resolve(values.input);
    const brief = validateVisualBrief(JSON.parse(readFileSync(inputPath, "utf8")));
    if (brief.kind !== "brand-illustration") throw new Error("Review sheets render brand-illustration briefs only");
    return { brief, kind: "brief" };
  }

  const pathway = oneOf(values.golden ?? "", VISUAL_PATHWAYS, "--golden");
  const locale = oneOf(values.locale ?? "en", VISUAL_LOCALES, "--locale");
  return { brief: getGoldenVisualBrief(pathway, locale), kind: "golden" };
}

function outputPathFor(brief: BrandIllustrationBrief) {
  const fallback = join(tmpdir(), "customermates-visual-review", `${brief.id}-${brief.source.checksum}.html`);
  const target = resolve(values.output ?? fallback);
  const forbiddenRoots = [resolve("app"), resolve("public")];
  if (forbiddenRoots.some((root) => relative(root, target) === "" || !relative(root, target).startsWith(".."))) {
    throw new Error("Review sheets cannot be written inside app or public");
  }
  return target;
}

async function renderReview() {
  const review = loadReviewInput();
  const { brief } = review;
  const target = outputPathFor(brief);
  const stylesheetPath = resolve("styles/globals.css");
  const stylesheet = await postcss([tailwindcss() as AcceptedPlugin]).process(readFileSync(stylesheetPath, "utf8"), {
    from: stylesheetPath,
  });
  const markup = await inlineApprovedVisualAssets(
    renderToStaticMarkup(
      review.kind === "golden"
        ? createElement(GoldenBenchmarkReviewSheet, { brief: review.brief })
        : createElement(VisualBriefReferenceSheet, { brief: review.brief }),
    ),
  );
  const safeCss = (await inlineReviewFonts(stylesheet.css)).replaceAll("</style", "<\\/style");
  const html = `<!doctype html><html lang="${brief.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${brief.id} ${review.kind === "golden" ? "benchmark" : "brief reference"}</title><style>${safeCss}</style></head><body>${markup}</body></html>`;

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html, "utf8");
  process.stdout.write(`${target}\n`);
}

await renderReview();
