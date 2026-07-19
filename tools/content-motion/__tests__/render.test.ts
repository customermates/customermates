import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildCompositionHtml } from "../render";
import { compositionSchema } from "../schema";

const productRef = "681d2d59bf67c283cb30835aa1ec3a5f727c4226";
const productRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const catalog = JSON.parse(
  readFileSync(
    resolve(productRoot, "tools/content-motion/catalog.json"),
    "utf8",
  ),
);
const valid = {
  meta: {
    width: 1080,
    height: 1080,
    duration: 3,
    fps: 60,
    productRef,
    title: "Motion kit test",
  },
  theme: "dark",
  assets: {
    brand: {
      root: "product",
      path: "public/images/dark/customermates-square.svg",
      mediaType: "image/svg+xml",
    },
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
        {
          id: "provider",
          type: "providerTile",
          asset: "brand",
          label: "Customermates",
          size: "hero",
        },
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
                contact: {
                  kind: "person",
                  primary: "Maya Chen",
                  secondary: "Northstar",
                },
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
        {
          id: "records-focus",
          type: "focus",
          target: "maya",
          variant: "primary",
          inset: 4,
          radius: 10,
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
  actions: [
    { type: "updateTable", target: "records", start: 1, end: 2, total: 1 },
  ],
};

const sceneComposition = {
  meta: {
    width: 1080,
    height: 1350,
    duration: 4,
    fps: 60,
    productRef,
    title: "Reusable scene system",
  },
  theme: "dark",
  assets: {},
  defaultScene: "customer-context",
  scenes: [
    {
      id: "customer-context",
      name: "Customer context field",
      category: "pattern",
      density: {
        maxNodes: 16,
        maxTextLeaves: 8,
        maxCharacters: 120,
        maxPrimaryRegions: 1,
      },
      nodes: [
        {
          id: "context-card",
          type: "card",
          layout: { x: 120, y: 340, width: 840, height: 360 },
          qa: { critical: true, minPhonePx: 7 },
          children: [
            {
              id: "context-content",
              type: "cardContent",
              layout: { display: "flex", direction: "column", gap: "md" },
              children: [
                {
                  id: "context-label",
                  type: "text",
                  role: "label",
                  text: "Customer context",
                },
                {
                  id: "context-input",
                  type: "inputControl",
                  value: "Renewal risk",
                  qa: { insetParent: "context-content", inset: "lg" },
                },
              ],
            },
          ],
        },
      ],
      motions: [
        {
          target: "context-card",
          start: 0,
          end: 0.8,
          from: { y: 24, opacity: 0 },
          to: { y: 0, opacity: 1 },
          easing: "easeOut",
        },
      ],
      actions: [
        {
          type: "typeText",
          target: "context-label",
          start: 0.2,
          end: 1.2,
          text: "Customer context",
        },
        {
          type: "typeValue",
          target: "context-input",
          start: 1.2,
          end: 2.4,
          value: "Renewal risk",
        },
      ],
    },
    {
      id: "integration-health",
      name: "Integration health row",
      category: "pattern",
      density: {
        maxNodes: 24,
        maxTextLeaves: 12,
        maxCharacters: 180,
        maxPrimaryRegions: 1,
      },
      nodes: [
        {
          id: "health-table",
          type: "dataTable",
          presentation: "social-hero",
          layout: { x: 90, y: 420, width: 900 },
          children: [
            {
              id: "health-body",
              type: "tableBody",
              children: [
                {
                  id: "health-row",
                  type: "tableRow",
                  qa: { critical: true, minPhonePx: 7 },
                  children: [
                    {
                      id: "health-name-cell",
                      type: "tableCell",
                      children: [
                        {
                          id: "health-name",
                          type: "inline",
                          layout: { gap: "sm" },
                          children: [
                            {
                              id: "health-avatar",
                              type: "avatar",
                              name: "HubSpot",
                              size: "xl",
                              presentation: "social",
                            },
                            {
                              id: "health-copy",
                              type: "text",
                              role: "body",
                              text: "HubSpot sync",
                            },
                          ],
                        },
                      ],
                    },
                    {
                      id: "health-status-cell",
                      type: "tableCell",
                      children: [
                        {
                          id: "health-status",
                          type: "statusSwap",
                          initial: { text: "Checking", variant: "secondary" },
                          updated: { text: "Healthy", variant: "success" },
                          size: "social",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      motions: [],
      actions: [
        { type: "swapState", target: "health-status", start: 1, end: 2 },
      ],
    },
    {
      id: "empty-state",
      name: "Empty state",
      category: "molecule",
      density: {
        maxNodes: 12,
        maxTextLeaves: 6,
        maxCharacters: 100,
        maxPrimaryRegions: 1,
      },
      nodes: [
        {
          id: "empty-card",
          type: "card",
          layout: { x: 190, y: 420, width: 700 },
          children: [
            {
              id: "empty-content",
              type: "cardContent",
              layout: {
                display: "flex",
                direction: "column",
                gap: "md",
                align: "center",
              },
              children: [
                {
                  id: "empty-title",
                  type: "text",
                  role: "title",
                  text: "Nothing needs attention",
                },
                {
                  id: "empty-body",
                  type: "text",
                  role: "muted",
                  text: "Every customer signal is resolved.",
                },
                {
                  id: "empty-action",
                  type: "button",
                  text: "View activity",
                  variant: "outline",
                  size: "default",
                },
              ],
            },
          ],
        },
      ],
      motions: [],
      actions: [],
    },
  ],
};

describe("content motion kit", () => {
  it("publishes one layered reusable component, motion, action, and QA catalog", () => {
    expect(catalog.version).toBe(3);
    expect(catalog.schemaVersion).toBe(3);
    expect(catalog.components.length).toBeGreaterThanOrEqual(36);
    expect(
      new Set(
        catalog.components.map((component: { id: string }) => component.id),
      ).size,
    ).toBe(catalog.components.length);
    expect(catalog.layout.spaceTokens.lg).toBe(24);
    expect(
      catalog.sceneRecipes.map((recipe: { id: string }) => recipe.id),
    ).toEqual(
      expect.arrayContaining([
        "channel-convergence",
        "persistent-customer-action",
        "progressive-form",
        "data-density-switch",
        "tabbed-detail",
      ]),
    );
    expect(
      catalog.sceneRecipes.find(
        (recipe: { id: string }) =>
          recipe.id === "persistent-customer-action",
      ).continuity,
    ).toContain("remains mounted");
    expect(catalog.motions.map((motion: { id: string }) => motion.id)).toEqual(
      expect.arrayContaining([
        "fade",
        "slide",
        "zoom",
        "blur-reveal",
        "directional-wipe",
        "tilt",
      ]),
    );
    expect(catalog.actions).toEqual(
      expect.arrayContaining([
        "typeText",
        "typeValue",
        "selectValue",
        "toggleBoolean",
        "swapState",
        "countTo",
      ]),
    );
    expect(catalog.qa).toEqual(
      expect.arrayContaining([
        "text-paint-clipping",
        "declared-insets",
        "scene-density-budget",
      ]),
    );
  });

  it("renders reusable form, tabs, card, and table variants", async () => {
    const expanded = {
      meta: {
        width: 1080,
        height: 1350,
        duration: 12,
        fps: 60,
        productRef,
        title: "Cross-format component variants",
      },
      theme: "dark",
      assets: {},
      defaultScene: "form-pattern",
      scenes: [
        {
          id: "form-pattern",
          name: "Configurable product form",
          category: "pattern",
          nodes: [
            {
              id: "form-card",
              type: "card",
              presentation: "hero",
              layout: { x: 90, y: 140, width: 900, height: 1040 },
              children: [
                {
                  id: "form-header",
                  type: "cardHeader",
                  children: [
                    {
                      id: "form-title",
                      type: "text",
                      role: "title",
                      text: "Automation settings",
                    },
                  ],
                },
                {
                  id: "form-content",
                  type: "cardContent",
                  layout: { display: "flex", direction: "column", gap: "lg" },
                  children: [
                    {
                      id: "form-tabs",
                      type: "tabs",
                      value: "rules",
                      children: [
                        {
                          id: "form-tabs-list",
                          type: "tabsList",
                          variant: "line",
                          children: [
                            {
                              id: "rules-tab",
                              type: "tabTrigger",
                              value: "rules",
                              text: "Rules",
                            },
                            {
                              id: "delivery-tab",
                              type: "tabTrigger",
                              value: "delivery",
                              text: "Delivery",
                            },
                          ],
                        },
                        {
                          id: "rules-content",
                          type: "tabsContent",
                          value: "rules",
                          children: [
                            {
                              id: "form-stack",
                              type: "stack",
                              layout: { gap: "md" },
                              children: [
                                {
                                  id: "name-field",
                                  type: "field",
                                  children: [
                                    {
                                      id: "name-label",
                                      type: "text",
                                      role: "label",
                                      text: "Automation name",
                                    },
                                    {
                                      id: "name-control",
                                      type: "inputControl",
                                      value: "Priority routing",
                                    },
                                  ],
                                },
                                {
                                  id: "channel-field",
                                  type: "field",
                                  children: [
                                    {
                                      id: "channel-label",
                                      type: "text",
                                      role: "label",
                                      text: "Channel",
                                    },
                                    {
                                      id: "channel-control",
                                      type: "selectControl",
                                      placeholder: "Choose channel",
                                    },
                                  ],
                                },
                                {
                                  id: "instruction-field",
                                  type: "field",
                                  children: [
                                    {
                                      id: "instruction-label",
                                      type: "text",
                                      role: "label",
                                      text: "Instruction",
                                    },
                                    {
                                      id: "instruction-control",
                                      type: "textareaControl",
                                      rows: 4,
                                      placeholder: "Describe the desired action",
                                    },
                                  ],
                                },
                                {
                                  id: "enabled-field",
                                  type: "field",
                                  children: [
                                    {
                                      id: "enabled-inline",
                                      type: "inline",
                                      children: [
                                        {
                                          id: "enabled-control",
                                          type: "switchControl",
                                          checked: false,
                                        },
                                        {
                                          id: "enabled-label",
                                          type: "text",
                                          role: "label",
                                          text: "Enable automation",
                                        },
                                        {
                                          id: "review-control",
                                          type: "checkboxControl",
                                          checked: true,
                                        },
                                        {
                                          id: "review-label",
                                          type: "text",
                                          role: "label",
                                          text: "Require review",
                                        },
                                      ],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                        {
                          id: "delivery-content",
                          type: "tabsContent",
                          value: "delivery",
                          children: [],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
          motions: [],
          actions: [
            {
              type: "selectValue",
              target: "channel-control",
              start: 1,
              end: 1.4,
              value: "LinkedIn",
            },
            {
              type: "typeValue",
              target: "instruction-control",
              start: 1.5,
              end: 3,
              value: "Route priority replies to the owner.",
            },
            {
              type: "toggleBoolean",
              target: "enabled-control",
              start: 3.1,
              end: 3.5,
              value: true,
            },
          ],
        },
        {
          id: "table-pattern",
          name: "Compact selected table",
          category: "pattern",
          nodes: [
            {
              id: "compact-table",
              type: "dataTable",
              presentation: "compact",
              layout: { x: 100, y: 300, width: 880, height: 420 },
              children: [
                {
                  id: "compact-head",
                  type: "tableHeader",
                  children: [
                    {
                      id: "compact-heading-row",
                      type: "tableRow",
                      children: [
                        {
                          id: "account-heading",
                          type: "tableHead",
                          text: "Account",
                        },
                        {
                          id: "state-heading",
                          type: "tableHead",
                          text: "State",
                          align: "right",
                          width: "standard",
                        },
                      ],
                    },
                  ],
                },
                {
                  id: "compact-body",
                  type: "tableBody",
                  children: [
                    {
                      id: "selected-row",
                      type: "tableRow",
                      state: "selected",
                      children: [
                        {
                          id: "account-cell",
                          type: "tableCell",
                          children: [
                            {
                              id: "account-name",
                              type: "text",
                              role: "body",
                              text: "Northstar",
                            },
                          ],
                        },
                        {
                          id: "state-cell",
                          type: "tableCell",
                          align: "right",
                          width: "standard",
                          children: [
                            {
                              id: "state-badge",
                              type: "badge",
                              variant: "success",
                              text: "Ready",
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
          motions: [],
          actions: [],
        },
      ],
    };
    const parsed = compositionSchema.parse(expanded);
    expect(parsed.scenes).toHaveLength(2);
    const html = await buildCompositionHtml(expanded, { product: productRoot });
    expect(html).toContain('data-slot="textarea"');
    expect(html).toContain('data-slot="select-trigger"');
    expect(html).toContain('data-slot="checkbox"');
    expect(html).toContain('data-slot="switch"');
    expect(html).toContain('data-slot="tabs"');
    expect(html).toContain('data-variant="line"');
    expect(html).toContain('data-state="selected"');
    expect(html).toContain("text-right");
    expect(html).toContain("action.type==='selectValue'");
    expect(html).toContain("action.type==='toggleBoolean'");
  }, 30_000);

  it("renders actual product component slots and deterministic output", async () => {
    const first = await buildCompositionHtml(valid, { product: productRoot });
    const second = await buildCompositionHtml(valid, { product: productRoot });
    expect(first).toBe(second);
    expect(first).toContain('data-slot="card"');
    expect(first).toContain('data-slot="button"');
    expect(first).toContain("size-24 rounded-xl p-5");
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

  it("composes reusable product scenes from granular slots and tokenized layout", async () => {
    expect(() => compositionSchema.parse(sceneComposition)).not.toThrow();
    const html = await buildCompositionHtml(sceneComposition, {
      product: productRoot,
    });
    expect(html).toContain('data-cm-scene-id="customer-context"');
    expect(html).toContain('data-cm-scene-id="integration-health"');
    expect(html).toContain('data-cm-scene-id="empty-state"');
    expect(html).toContain('data-slot="card-content"');
    expect(html).toContain('data-slot="table-body"');
    expect(html).toContain('data-slot="table-cell"');
    expect(html).toContain('data-cm-inset-token="lg"');
    expect(html).toContain("window.renderScene");
    expect(html).toContain("data-input-target");
    expect(html).toContain("window.getProductScenes");
    expect(html).toContain("text-paint-clipped");
    expect(html).toContain("clipsX&&element.scrollWidth");
    expect(html).toContain("h-9 px-3 py-1.5 text-[22px] leading-none");
    expect(html).toContain("text-[23px]");
    expect(html).toContain("data-slot=table-cell]]:px-0");
    expect(html).toContain("absolute inset-0 flex items-center justify-end");
    expect(html).toContain("const switched=value>=.5");
    expect(html).toContain("const hasDepth=Math.abs(state.rotateX)>.001");
    expect(html).toContain('"layoutSystem":"tokenized-compound-scenes"');
  }, 30_000);

  it("enforces per-scene density budgets across unrelated content contexts", () => {
    const boundedStream: any = structuredClone(sceneComposition);
    boundedStream.scenes[0].density.maxNodes = 320;
    boundedStream.scenes[0].density.maxTextLeaves = 160;
    expect(() => compositionSchema.parse(boundedStream)).not.toThrow();

    const unboundedStream: any = structuredClone(sceneComposition);
    unboundedStream.scenes[0].density.maxNodes = 321;
    expect(() => compositionSchema.parse(unboundedStream)).toThrow();

    const excessiveTextStream: any = structuredClone(sceneComposition);
    excessiveTextStream.scenes[0].density.maxTextLeaves = 161;
    expect(() => compositionSchema.parse(excessiveTextStream)).toThrow();

    const overloaded: any = structuredClone(sceneComposition);
    overloaded.scenes[2].density.maxCharacters = 10;
    expect(() => compositionSchema.parse(overloaded)).toThrow(
      /empty-state exceeds maxCharacters/,
    );

    const tooManyRegions: any = structuredClone(sceneComposition);
    tooManyRegions.scenes[2].nodes.push({
      id: "second-region",
      type: "text",
      role: "body",
      text: "Extra",
    });
    expect(() => compositionSchema.parse(tooManyRegions)).toThrow(
      /empty-state exceeds maxPrimaryRegions/,
    );
  });

  it("keeps scene targets local and rejects free-positioned token dimensions", () => {
    const crossScene: any = structuredClone(sceneComposition);
    crossScene.scenes[0].actions[0].target = "health-status";
    expect(() => compositionSchema.parse(crossScene)).toThrow(
      /scene customer-context unknown target/,
    );

    const invalidAbsolute: any = structuredClone(sceneComposition);
    invalidAbsolute.scenes[0].nodes[0].layout.width = "full";
    expect(() => compositionSchema.parse(invalidAbsolute)).toThrow(
      /absolute layouts require numeric width and height/,
    );

    const nestedAbsolute: any = structuredClone(sceneComposition);
    nestedAbsolute.scenes[0].nodes[0].children[0].children[0].layout = {
      x: 12,
      y: 8,
    };
    expect(() => compositionSchema.parse(nestedAbsolute)).toThrow(
      /nested node context-label cannot use x\/y/,
    );

    const mixedSlots: any = structuredClone(sceneComposition);
    mixedSlots.scenes[0].nodes[0].children.push({
      id: "unslotted",
      type: "text",
      role: "body",
      text: "No",
    });
    expect(() => compositionSchema.parse(mixedSlots)).toThrow(
      /explicit card slots cannot mix/,
    );
  });

  it("rejects unsupported components and variants", () => {
    expect(() =>
      compositionSchema.parse({
        ...valid,
        nodes: [{ id: "fake", type: "glassCard", style: { borderRadius: 99 } }],
      }),
    ).toThrow();
    expect(() =>
      compositionSchema.parse({
        ...valid,
        nodes: [{ id: "badge", type: "badge", variant: "neon", text: "No" }],
      }),
    ).toThrow();
  });

  it("rejects visual overrides", () => {
    const overridden = {
      ...valid,
      nodes: [
        {
          ...valid.nodes[0],
          style: { borderRadius: 24, boxShadow: "0 40px 80px black" },
        },
      ],
    };
    expect(() => compositionSchema.parse(overridden)).toThrow();
  });

  it("requires anchor-derived overlay geometry", () => {
    const unknown: any = structuredClone(valid);
    unknown.nodes[0].children.push({
      id: "bad-focus",
      type: "focus",
      target: "missing",
      variant: "primary",
    });
    expect(() => compositionSchema.parse(unknown)).toThrow(
      /unknown anchor target/,
    );

    const positioned: any = structuredClone(valid);
    positioned.nodes[0].children.push({
      id: "positioned-focus",
      type: "focus",
      target: "maya",
      variant: "primary",
      layout: { x: 20, y: 20 },
    });
    expect(() => compositionSchema.parse(positioned)).toThrow(
      /focus geometry is derived/,
    );

    const attached: any = structuredClone(valid);
    attached.nodes[0].children.push({
      id: "attached-badge",
      type: "badge",
      variant: "success",
      text: "Done",
      layout: {
        attach: {
          target: "records",
          targetAnchor: "top-right",
          selfAnchor: "bottom-right",
        },
      },
    });
    expect(() => compositionSchema.parse(attached)).not.toThrow();
    attached.nodes[0].children.at(-1)!.layout.x = 10;
    expect(() => compositionSchema.parse(attached)).toThrow(
      /attached layout cannot set x or y/,
    );
  });

  it("offers one bounded social-scale table presentation without arbitrary classes", async () => {
    const social: any = structuredClone(valid);
    social.nodes[0].children.find(
      (child: any) => child.id === "records",
    ).presentation = "social";
    const html = await buildCompositionHtml(social, { product: productRoot });
    expect(html).toContain(
      'class="w-max min-w-full caption-bottom text-[22px]"',
    );
    expect(html).toContain("current=current.parentElement");
    social.nodes[0].children.find(
      (child: any) => child.id === "records",
    ).presentation = "billboard";
    expect(() => compositionSchema.parse(social)).toThrow();
  }, 30_000);

  it("allows a product-owned viewport to clip a moving compound table", async () => {
    const viewport: any = structuredClone(valid);
    viewport.nodes[0].layout.overflow = "hidden";
    viewport.nodes[0].qa = { allowClipping: true };
    const html = await buildCompositionHtml(viewport, {
      product: productRoot,
    });
    expect(html).toContain("overflow:hidden");
    expect(html).toContain('data-cm-allow-clipping="true"');
    expect(html).toContain(
      "element.closest('[data-cm-allow-clipping=\"true\"]')",
    );
    expect(html).toContain("leaf.closest('[data-cm-allow-clipping=\"true\"]')");
    expect(html).toContain("action.type==='countTo'&&time>=action.start");
    viewport.nodes[0].layout.overflow = "scroll";
    expect(() => compositionSchema.parse(viewport)).toThrow();
  }, 30_000);

  it("renders a bounded progress counter with deterministic completion copy", async () => {
    const progress: any = structuredClone(valid);
    progress.nodes[0].children.unshift({
      id: "sync-progress",
      type: "counter",
      value: 0,
      total: 16,
      variant: "outline",
      size: "social",
      presentation: "progress",
      label: "Updating",
      completeLabel: "All synced",
    });
    progress.actions = [
      {
        type: "countTo",
        target: "sync-progress",
        start: 1,
        end: 2,
        value: 16,
      },
    ];
    const html = await buildCompositionHtml(progress, { product: productRoot });
    expect(html).toContain('data-count-progress="sync-progress"');
    expect(html).toContain('data-count-status="sync-progress"');
    expect(html).toContain(
      "count>=action.value?status.dataset.countCompleteLabel",
    );

    delete progress.nodes[0].children[0].completeLabel;
    expect(() => compositionSchema.parse(progress)).toThrow(
      /progress counter requires label and completeLabel/,
    );
  }, 30_000);

  it("supports bounded deterministic reveal, blur, and camera tilt primitives", async () => {
    const cinematic = {
      ...structuredClone(valid),
      motions: [
        {
          target: "proof-card",
          start: 0,
          end: 0.8,
          from: {
            x: 48,
            opacity: 0,
            blur: 12,
            clipLeft: 100,
            rotateY: 6,
            originX: 100,
            originY: 50,
          },
          to: {
            x: 0,
            opacity: 1,
            blur: 0,
            clipLeft: 0,
            rotateY: 0,
            originX: 50,
            originY: 50,
          },
          easing: "easeOut",
        },
      ],
    };
    const html = await buildCompositionHtml(cinematic, {
      product: productRoot,
    });
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

  it("supports a monotonic accelerating ease-in motion", async () => {
    const accelerating = {
      ...structuredClone(valid),
      motions: [
        {
          target: "proof-card",
          start: 0,
          end: 1,
          from: { y: 0 },
          to: { y: -720 },
          easing: "easeIn",
        },
      ],
    };
    const html = await buildCompositionHtml(accelerating, {
      product: productRoot,
    });
    expect(html).toContain("if(name==='easeIn')return value*value*value");
    expect(html).toContain('"easing":"easeIn"');
  }, 30_000);

  it("supports a strongly end-weighted accelerating motion", async () => {
    const accelerating = {
      ...structuredClone(valid),
      motions: [
        {
          target: "proof-card",
          start: 0,
          end: 1,
          from: { y: 0 },
          to: { y: -1440 },
          easing: "easeInStrong",
        },
      ],
    };
    const html = await buildCompositionHtml(accelerating, {
      product: productRoot,
    });
    expect(html).toContain(
      "if(name==='easeInStrong')return value*value*value*value*value",
    );
    expect(html).toContain('"easing":"easeInStrong"');
  }, 30_000);

  it("rejects missing assets and fonts", async () => {
    const missingAsset = structuredClone(valid);
    missingAsset.assets.brand.path = "public/images/dark/missing.svg";
    await expect(
      buildCompositionHtml(missingAsset, { product: productRoot }),
    ).rejects.toThrow();
    const empty = mkdtempSync(resolve(tmpdir(), "cm-motion-empty-"));
    expect(() =>
      readFileSync(
        resolve(empty, "node_modules/@fontsource/inter/latin-400.css"),
      ),
    ).toThrow();
  });
});
