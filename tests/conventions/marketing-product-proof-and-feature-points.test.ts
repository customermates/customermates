import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  FeaturePoint,
  FeaturePoints,
} from "@/components/marketing/feature-points";
import {
  PRODUCT_DEMO_ROUTES,
  PRODUCT_DEMO_SELECTIONS,
  resolveProductDemoUrl,
} from "@/components/marketing/product-demo";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";
import { fixtureId } from "@/prisma/seeds/helpers";
import { threads } from "@/prisma/seeds/messaging/fixtures";

import { REPO_ROOT } from "./walk";

describe("feature-page product proof", () => {
  it("keeps generated review captures local and off public routes", () => {
    const captureScript = readFileSync(join(REPO_ROOT, "scripts", "capture-product-proof.mjs"), "utf8");

    expect(captureScript).toContain('const OUT_DIR = ".review/product-proof"');
    expect(captureScript).toContain("assertLocalCaptureUrl");
    expect(captureScript).not.toContain('const OUT_DIR = "public/');
  });

  it("allowlists one localized demo surface instead of accepting arbitrary iframe URLs", () => {
    expect(PRODUCT_DEMO_ROUTES).toEqual({ deals: "/deals", inbox: "/inbox" });
    expect(resolveProductDemoUrl("en", "inbox")).toBe(
      "https://demo.customermates.com/en/inbox",
    );
    expect(resolveProductDemoUrl("en", "inbox", "sophie-wagner")).toBe(
      "https://demo.customermates.com/en/inbox?threadId=17000000-0000-4000-8000-000000000006",
    );
    expect(resolveProductDemoUrl("de", "deals")).toBe(
      "https://demo.customermates.com/de/deals",
    );
    expect(() => resolveProductDemoUrl("en", "dashboard" as never)).toThrow(
      /Unsupported product demo surface/u,
    );
    expect(() =>
      resolveProductDemoUrl("en", "inbox", "unknown" as never),
    ).toThrow(/Unsupported product demo selection/u);
    expect(() => resolveProductDemoUrl("en", "deals", "sophie-wagner")).toThrow(
      /Unsupported product demo selection/u,
    );

    const sophieThreadIndex = threads.findIndex(
      (thread) =>
        thread.account === "whatsapp" &&
        thread.name === "Sophie Wagner" &&
        thread.latestMinutesAgo === 3 * 24 * 60,
    );
    expect(sophieThreadIndex).toBeGreaterThanOrEqual(0);
    expect(PRODUCT_DEMO_SELECTIONS["sophie-wagner"].threadId).toBe(
      fixtureId("17000000", sophieThreadIndex + 1),
    );

    const source = readFileSync(
      join(REPO_ROOT, "components", "marketing", "product-demo.tsx"),
      "utf8",
    );
    const frame = readFileSync(
      join(REPO_ROOT, "components", "marketing", "browser-frame.tsx"),
      "utf8",
    );
    const registry = readFileSync(
      join(REPO_ROOT, "core", "fumadocs", "mdx-components.tsx"),
      "utf8",
    );

    expect(registry).toMatch(/\n\s+ProductDemo,/u);
    expect(source).toContain("src={src}");
    expect(source).not.toContain("process.env.NODE_ENV");
    expect(source).not.toContain("/captures/");
    expect(source).not.toContain("next/image");
    expect(frame).not.toContain("poster");
    expect(frame).toContain('loading="lazy"');
    expect(frame).toContain("IntersectionObserver");
    expect(frame).toContain(
      'sandbox="allow-scripts allow-same-origin allow-popups allow-forms"',
    );
    expect(frame).toContain('target="_blank"');
    expect(frame).toContain("title={title}");
  });

  it("authors exactly one product-proof embed per localized pilot page", () => {
    for (const locale of CONTENT_LOCALES) {
      const email = readFileSync(
        join(
          REPO_ROOT,
          "content",
          "feature-pages",
          locale,
          "email-integration.mdx",
        ),
        "utf8",
      );
      const pipeline = readFileSync(
        join(REPO_ROOT, "content", "feature-pages", locale, "pipeline.mdx"),
        "utf8",
      );

      expect(email.match(/<ProductDemo\b/gu)).toHaveLength(1);
      expect(email).toContain('surface="inbox"');
      expect(email).toContain('selection="sophie-wagner"');
      expect(pipeline.match(/<ProductDemo\b/gu)).toHaveLength(1);
      expect(pipeline).toContain('surface="deals"');
      expect(`${email}\n${pipeline}`).not.toMatch(
        /<(?:iframe|embed|object)\b/iu,
      );
      expect(`${email}\n${pipeline}`).not.toMatch(/<ProductDemo[^>]+src=/u);
      expect(`${email}\n${pipeline}`).toMatch(
        /inspection-only|dient zum Ansehen/u,
      );
    }
  });
});

describe("authored feature-point cards", () => {
  it("renders a semantic list of token-native cards with approved icons", () => {
    const markup = renderToStaticMarkup(
      createElement(
        FeaturePoints,
        null,
        createElement(FeaturePoint, {
          children: "Read the source.",
          icon: "Code2",
          title: "Inspectable",
        }),
        createElement(FeaturePoint, {
          children: "Keep the claim precise.",
          icon: "ShieldCheck",
          title: "Bounded",
        }),
      ),
    );

    expect(markup).toContain("<ul");
    expect(markup.match(/<li\b/gu)).toHaveLength(2);
    expect(markup.match(/<article\b/gu)).toHaveLength(2);
    expect(markup).toContain('data-feature-points="true"');
    expect(markup.match(/data-feature-point="true"/gu)).toHaveLength(2);
    expect(markup).toContain("rounded-card border border-border bg-card");
    expect(markup).toContain("not-prose");
    expect(() =>
      renderToStaticMarkup(
        createElement(FeaturePoint, {
          children: "Never renders.",
          icon: "Unknown" as never,
          title: "Invalid",
        }),
      ),
    ).toThrow(/Unsupported feature-point icon/u);
  });

  it("uses five matching cards only for the authored pipeline reasons", () => {
    for (const locale of CONTENT_LOCALES) {
      const source = readFileSync(
        join(REPO_ROOT, "content", "feature-pages", locale, "pipeline.mdx"),
        "utf8",
      );

      expect(source.match(/<FeaturePoints>/gu)).toHaveLength(1);
      expect(source.match(/<FeaturePoint\b/gu)).toHaveLength(5);
      expect(source.match(/<\/FeaturePoint>/gu)).toHaveLength(5);
      expect(
        source.match(
          /id="pipeline-(?:open-source|eu-region|pricing|workflows|self-hosting)"/gu,
        ),
      ).toHaveLength(5);
    }
  });
});
