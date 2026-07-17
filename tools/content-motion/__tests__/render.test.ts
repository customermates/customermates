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
          id: "context-field",
          type: "input",
          label: "Customer context",
          value: "Renewal risk",
          description: "Attached to the current record",
          qa: { critical: true, checkPadding: true, minPhonePx: 7 },
        },
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
        { id: "records-focus", type: "focus", target: "maya", variant: "primary", inset: 4, radius: 10 },
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
    expect(first).toContain('data-slot="input"');
    expect(first).toContain('data-cm-id="records-focus"');
    expect(first).toContain('data-cm-focus-target="maya"');
    expect(first).toContain("window.cmAuditLayout");
    expect(first).toContain("@font-face");
    expect(first).toContain("if(time<motion.start&&existing)continue");
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

  it("requires anchor-derived overlay geometry", () => {
    const unknown: any = structuredClone(valid);
    unknown.nodes[0].children.push({ id: "bad-focus", type: "focus", target: "missing", variant: "primary" });
    expect(() => compositionSchema.parse(unknown)).toThrow(/unknown anchor target/);

    const positioned: any = structuredClone(valid);
    positioned.nodes[0].children.push({
      id: "positioned-focus",
      type: "focus",
      target: "maya",
      variant: "primary",
      layout: { x: 20, y: 20 },
    });
    expect(() => compositionSchema.parse(positioned)).toThrow(/focus geometry is derived/);

    const attached: any = structuredClone(valid);
    attached.nodes[0].children.push({
      id: "attached-badge",
      type: "badge",
      variant: "success",
      text: "Done",
      layout: { attach: { target: "records", targetAnchor: "top-right", selfAnchor: "bottom-right" } },
    });
    expect(() => compositionSchema.parse(attached)).not.toThrow();
    attached.nodes[0].children.at(-1)!.layout.x = 10;
    expect(() => compositionSchema.parse(attached)).toThrow(/attached layout cannot set x or y/);
  });

  it("offers one bounded social-scale table presentation without arbitrary classes", async () => {
    const social: any = structuredClone(valid);
    social.nodes[0].children.find((child: any) => child.id === "records").presentation = "social";
    const html = await buildCompositionHtml(social, { product: productRoot });
    expect(html).toContain('class="w-max min-w-full caption-bottom text-[22px]"');
    expect(html).toContain("current=current.parentElement");
    social.nodes[0].children.find((child: any) => child.id === "records").presentation = "billboard";
    expect(() => compositionSchema.parse(social)).toThrow();
  }, 30_000);

  it("supports bounded deterministic reveal, blur, and camera tilt primitives", async () => {
    const cinematic = {
      ...structuredClone(valid),
      motions: [
        {
          target: "proof-card",
          start: 0,
          end: 0.8,
          from: { x: 48, opacity: 0, blur: 12, clipLeft: 100, rotateY: 6, originX: 100, originY: 50 },
          to: { x: 0, opacity: 1, blur: 0, clipLeft: 0, rotateY: 0, originX: 50, originY: 50 },
          easing: "easeOut",
        },
      ],
    };
    const html = await buildCompositionHtml(cinematic, { product: productRoot });
    expect(html).toContain("perspective(1400px)");
    expect(html).toContain("element.style.clipPath");
    expect(html).toContain('"blur":12');
    expect(html).toContain('"clipLeft":100');

    const unsafe = structuredClone(cinematic);
    unsafe.motions[0].from.blur = 25;
    expect(() => compositionSchema.parse(unsafe)).toThrow();
    unsafe.motions[0].from.blur = 12;
    unsafe.motions[0].from.rotateY = 13;
    expect(() => compositionSchema.parse(unsafe)).toThrow();
  }, 30_000);

  it("rejects missing assets and fonts", async () => {
    const missingAsset = structuredClone(valid);
    missingAsset.assets.brand.path = "public/images/dark/missing.svg";
    await expect(buildCompositionHtml(missingAsset, { product: productRoot })).rejects.toThrow();
    const empty = mkdtempSync(resolve(tmpdir(), "cm-motion-empty-"));
    expect(() => readFileSync(resolve(empty, "node_modules/@fontsource/inter/latin-400.css"))).toThrow();
  });
});
