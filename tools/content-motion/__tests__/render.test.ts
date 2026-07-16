import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildCompositionHtml } from "../render";
import { compositionSchema } from "../schema";

const productRef = "681d2d59bf67c283cb30835aa1ec3a5f727c4226";
const productRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const valid = {
  meta: { width: 1080, height: 1080, duration: 3, fps: 60, productRef, title: "Motion kit test" },
  theme: "dark",
  assets: {
    brand: { root: "product", path: "public/images/dark/customermates-square.svg", mediaType: "image/svg+xml" },
  },
  nodes: [
    {
      id: "proof-card",
      type: "card",
      title: "Actual product card",
      description: "Compiled from the product component",
      headerBadge: { text: "Verified", variant: "success" },
      layout: { x: 80, y: 80, width: 600, height: 500 },
      children: [
        { id: "provider", type: "providerTile", asset: "brand", label: "Customermates", size: "icon-lg" },
        {
          id: "records",
          type: "table",
          columns: [
            { key: "contact", label: "Contact" },
            { key: "status", label: "Status" },
          ],
          rows: [
            {
              id: "maya",
              cells: {
                contact: { kind: "person", primary: "Maya Chen", secondary: "Northstar" },
                status: {
                  kind: "status",
                  initial: "Open",
                  updated: "Updated",
                  initialVariant: "secondary",
                  updatedVariant: "success",
                },
              },
            },
          ],
          countLabel: "1",
        },
      ],
    },
  ],
  motions: [
    {
      target: "proof-card",
      start: 0,
      end: 0.8,
      from: { y: 30, opacity: 0 },
      to: { y: 0, opacity: 1 },
      easing: "easeOut",
    },
  ],
  actions: [{ type: "updateTable", target: "records", start: 1, end: 2, total: 1 }],
};

describe("content motion kit", () => {
  it("renders actual product component slots and deterministic output", async () => {
    const first = await buildCompositionHtml(valid, { product: productRoot });
    const second = await buildCompositionHtml(valid, { product: productRoot });
    expect(first).toBe(second);
    expect(first).toContain('data-slot="card"');
    expect(first).toContain('data-slot="button"');
    expect(first).toContain('data-slot="badge"');
    expect(first).toContain('data-slot="table"');
    expect(first).toContain("@font-face");
    expect(first).toContain(productRef);
  }, 30_000);

  it("rejects unsupported components and variants", () => {
    expect(() =>
      compositionSchema.parse({ ...valid, nodes: [{ id: "fake", type: "glassCard", style: { borderRadius: 99 } }] }),
    ).toThrow();
    expect(() =>
      compositionSchema.parse({ ...valid, nodes: [{ id: "badge", type: "badge", variant: "neon", text: "No" }] }),
    ).toThrow();
  });

  it("rejects visual overrides", () => {
    const overridden = {
      ...valid,
      nodes: [{ ...valid.nodes[0], style: { borderRadius: 24, boxShadow: "0 40px 80px black" } }],
    };
    expect(() => compositionSchema.parse(overridden)).toThrow();
  });

  it("rejects missing assets and fonts", async () => {
    const missingAsset = structuredClone(valid);
    missingAsset.assets.brand.path = "public/images/dark/missing.svg";
    await expect(buildCompositionHtml(missingAsset, { product: productRoot })).rejects.toThrow();
    const empty = mkdtempSync(resolve(tmpdir(), "cm-motion-empty-"));
    expect(() => readFileSync(resolve(empty, "node_modules/@fontsource/inter/latin-400.css"))).toThrow();
  });
});
