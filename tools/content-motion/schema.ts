import { z } from "zod";

const id = z.string().regex(/^[a-z][a-z0-9-]*$/);

const anchor = z.enum([
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
]);

const qa = z
  .object({
    critical: z.boolean().optional(),
    checkPadding: z.boolean().optional(),
    allowOverlapWith: z.array(id).max(12).optional(),
    alignmentGroup: id.optional(),
    alignment: z.enum(["left", "center", "right"]).optional(),
    minPhonePx: z.number().min(7).max(24).optional(),
  })
  .strict();

const layout = z
  .object({
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    z: z.number().int().min(0).max(100).optional(),
    display: z.enum(["block", "flex", "grid"]).optional(),
    direction: z.enum(["row", "column"]).optional(),
    gap: z.number().min(0).max(160).optional(),
    align: z.enum(["start", "center", "end", "stretch"]).optional(),
    justify: z.enum(["start", "center", "end", "between"]).optional(),
    textAlign: z.enum(["left", "center", "right"]).optional(),
    columns: z.number().int().min(1).max(12).optional(),
    padding: z.number().min(0).max(160).optional(),
    attach: z
      .object({
        target: id,
        targetAnchor: anchor,
        selfAnchor: anchor,
        offsetX: z.number().min(-240).max(240).default(0),
        offsetY: z.number().min(-240).max(240).default(0),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.attach && (value.x != null || value.y != null))
      context.addIssue({ code: "custom", message: "attached layout cannot set x or y" });
  });

const textNode = z
  .object({
    id,
    type: z.literal("text"),
    role: z.enum(["display", "title", "body", "muted", "eyebrow", "mono"]),
    text: z.string(),
    caret: z.boolean().optional(),
    layout: layout.optional(),
    qa: qa.optional(),
  })
  .strict();

const badgeNode = z
  .object({
    id,
    type: z.literal("badge"),
    variant: z.enum(["default", "secondary", "success", "warning", "info", "outline"]),
    text: z.string(),
    layout: layout.optional(),
    qa: qa.optional(),
  })
  .strict();

const chipNode = z
  .object({
    id,
    type: z.literal("chip"),
    variant: z.enum(["default", "secondary", "success", "warning", "info", "outline"]),
    size: z.enum(["sm", "md", "lg"]),
    text: z.string(),
    startAsset: id.optional(),
    layout: layout.optional(),
    qa: qa.optional(),
  })
  .strict();

const providerTileNode = z
  .object({
    id,
    type: z.literal("providerTile"),
    asset: id,
    label: z.string().min(1),
    size: z.enum(["icon-sm", "icon", "icon-lg"]).default("icon-lg"),
    layout: layout.optional(),
    qa: qa.optional(),
  })
  .strict();

const inputNode = z
  .object({
    id,
    type: z.literal("input"),
    label: z.string().min(1),
    value: z.string().optional(),
    placeholder: z.string().optional(),
    description: z.string().optional(),
    layout: layout.optional(),
    qa: qa.optional(),
  })
  .strict();

const alertNode = z
  .object({
    id,
    type: z.literal("alert"),
    variant: z.enum(["default", "destructive"]).default("default"),
    title: z.string().min(1),
    description: z.string().optional(),
    layout: layout.optional(),
    qa: qa.optional(),
  })
  .strict();

const separatorNode = z
  .object({
    id,
    type: z.literal("separator"),
    orientation: z.enum(["horizontal", "vertical"]).default("horizontal"),
    layout: layout.optional(),
    qa: qa.optional(),
  })
  .strict();

const logoNode = z
  .object({
    id,
    type: z.literal("logo"),
    asset: id,
    label: z.string(),
    layout: layout.optional(),
    qa: qa.optional(),
  })
  .strict();

const overlapStackNode = z
  .object({
    id,
    type: z.literal("overlapStack"),
    assets: z.array(id).min(1).max(8),
    labels: z.array(z.string()).min(1).max(8),
    size: z.enum(["default", "sm"]).default("default"),
    layout: layout.optional(),
    qa: qa.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.assets.length !== value.labels.length)
      context.addIssue({ code: "custom", message: "overlapStack assets and labels must have equal length" });
  });

const personCell = z.object({ kind: z.literal("person"), primary: z.string(), secondary: z.string() }).strict();
const textCell = z.object({ kind: z.literal("text"), text: z.string() }).strict();
const statusCell = z
  .object({
    kind: z.literal("status"),
    initial: z.string(),
    updated: z.string(),
    initialVariant: z.enum(["default", "secondary", "outline", "warning", "info"]).default("secondary"),
    updatedVariant: z.enum(["success", "default"]).default("success"),
  })
  .strict();

const tableNode = z
  .object({
    id,
    type: z.literal("table"),
    columns: z
      .array(z.object({ key: id, label: z.string() }).strict())
      .min(1)
      .max(5),
    rows: z
      .array(
        z
          .object({
            id,
            cells: z.record(id, z.discriminatedUnion("kind", [personCell, textCell, statusCell])),
          })
          .strict(),
      )
      .min(1)
      .max(24),
    countLabel: z.string().optional(),
    presentation: z.enum(["product", "social"]).default("product"),
    layout: layout.optional(),
    qa: qa.optional(),
  })
  .strict();

const focusNode = z
  .object({
    id,
    type: z.literal("focus"),
    target: id,
    variant: z.enum(["primary", "success", "warning"]).default("primary"),
    inset: z.number().min(0).max(32).default(6),
    radius: z.number().min(0).max(48).default(12),
    label: z.string().optional(),
    layout: layout.optional(),
    qa: qa.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.layout?.x != null || value.layout?.y != null || value.layout?.attach)
      context.addIssue({ code: "custom", message: "focus geometry is derived from its target" });
  });

const connectorNode = z
  .object({
    id,
    type: z.literal("connector"),
    from: z.object({ target: id, anchor }).strict(),
    to: z.object({ target: id, anchor }).strict(),
    variant: z.enum(["primary", "muted", "success"]).default("primary"),
    curve: z.enum(["horizontal", "vertical"]).default("horizontal"),
    layout: layout.optional(),
    qa: qa.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.layout?.x != null || value.layout?.y != null || value.layout?.attach)
      context.addIssue({ code: "custom", message: "connector geometry is derived from its endpoints" });
  });

type NodeInput =
  | z.infer<typeof textNode>
  | z.infer<typeof badgeNode>
  | z.infer<typeof chipNode>
  | z.infer<typeof providerTileNode>
  | z.infer<typeof inputNode>
  | z.infer<typeof alertNode>
  | z.infer<typeof separatorNode>
  | z.infer<typeof logoNode>
  | z.infer<typeof overlapStackNode>
  | z.infer<typeof tableNode>
  | z.infer<typeof focusNode>
  | z.infer<typeof connectorNode>
  | {
      id: string;
      type: "group";
      layout?: z.infer<typeof layout>;
      qa?: z.infer<typeof qa>;
      children: NodeInput[];
    }
  | {
      id: string;
      type: "card";
      title?: string;
      description?: string;
      headerBadge?: { text: string; variant: "default" | "secondary" | "success" | "outline" };
      layout?: z.infer<typeof layout>;
      qa?: z.infer<typeof qa>;
      children: NodeInput[];
    };

const node: z.ZodType<NodeInput> = z.lazy(() =>
  z.discriminatedUnion("type", [
    textNode,
    badgeNode,
    chipNode,
    providerTileNode,
    inputNode,
    alertNode,
    separatorNode,
    logoNode,
    overlapStackNode,
    tableNode,
    focusNode,
    connectorNode,
    z
      .object({ id, type: z.literal("group"), layout: layout.optional(), qa: qa.optional(), children: z.array(node).default([]) })
      .strict(),
    z
      .object({
        id,
        type: z.literal("card"),
        title: z.string().optional(),
        description: z.string().optional(),
        headerBadge: z
          .object({
            text: z.string(),
            variant: z.enum(["default", "secondary", "success", "outline"]),
          })
          .strict()
          .optional(),
        layout: layout.optional(),
        qa: qa.optional(),
        children: z.array(node).default([]),
      })
      .strict(),
  ]),
);

const motionValue = z
  .object({
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    scale: z.number().positive().max(4).optional(),
    opacity: z.number().min(0).max(1).optional(),
    rotate: z.number().min(-12).max(12).optional(),
    rotateX: z.number().min(-12).max(12).optional(),
    rotateY: z.number().min(-12).max(12).optional(),
    blur: z.number().min(0).max(24).optional(),
    clipTop: z.number().min(0).max(100).optional(),
    clipRight: z.number().min(0).max(100).optional(),
    clipBottom: z.number().min(0).max(100).optional(),
    clipLeft: z.number().min(0).max(100).optional(),
    originX: z.number().min(0).max(100).optional(),
    originY: z.number().min(0).max(100).optional(),
  })
  .strict();

const motion = z
  .object({
    target: id,
    start: z.number().min(0),
    end: z.number().positive(),
    from: motionValue,
    to: motionValue,
    easing: z.enum(["linear", "easeOut", "easeInOut"]),
  })
  .strict()
  .refine((value) => value.end > value.start, "motion end must be after start");

const action = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("typeText"),
      target: id,
      start: z.number().min(0),
      end: z.number().positive(),
      text: z.string(),
      caretMs: z.number().int().min(500).max(600).default(550),
    })
    .strict(),
  z
    .object({
      type: z.literal("updateTable"),
      target: id,
      start: z.number().min(0),
      end: z.number().positive(),
      total: z.number().int().positive(),
    })
    .strict(),
]);

export const compositionSchema = z
  .object({
    meta: z
      .object({
        width: z.number().int().min(64).max(2160),
        height: z.number().int().min(64).max(2160),
        duration: z.number().min(0.2).max(60),
        fps: z.number().int().min(1).max(60),
        productRef: z.string().regex(/^[0-9a-f]{40}$/),
        title: z.string().min(1),
      })
      .strict(),
    theme: z.literal("dark"),
    assets: z.record(
      id,
      z
        .object({
          root: id,
          path: z.string().min(1),
          mediaType: z.enum(["image/svg+xml", "image/png"]),
        })
        .strict(),
    ),
    nodes: z.array(node).min(1),
    motions: z.array(motion).default([]),
    actions: z.array(action).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    const nodeIds = new Set<string>();
    const attachedTargets: Array<{ source: string; target: string }> = [];
    const visit = (item: NodeInput) => {
      if (nodeIds.has(item.id)) context.addIssue({ code: "custom", message: `duplicate node id: ${item.id}` });
      nodeIds.add(item.id);
      if (item.type === "table") {
        for (const row of item.rows) {
          if (nodeIds.has(row.id)) context.addIssue({ code: "custom", message: `duplicate node id: ${row.id}` });
          nodeIds.add(row.id);
        }
      }
      if (item.layout?.attach) attachedTargets.push({ source: item.id, target: item.layout.attach.target });
      if (item.type === "focus") attachedTargets.push({ source: item.id, target: item.target });
      if (item.type === "connector") {
        attachedTargets.push({ source: item.id, target: item.from.target });
        attachedTargets.push({ source: item.id, target: item.to.target });
      }
      if (item.type === "group" || item.type === "card") item.children.forEach(visit);
    };
    value.nodes.forEach(visit);
    for (const item of [...value.motions, ...value.actions])
      if (!nodeIds.has(item.target)) context.addIssue({ code: "custom", message: `unknown target: ${item.target}` });
    for (const item of attachedTargets) {
      if (item.source === item.target)
        context.addIssue({ code: "custom", message: `node cannot attach to itself: ${item.source}` });
      else if (!nodeIds.has(item.target))
        context.addIssue({ code: "custom", message: `unknown anchor target: ${item.target}` });
    }

    for (const item of value.motions) {
      if (item.end > value.meta.duration)
        context.addIssue({ code: "custom", message: `motion exceeds duration: ${item.target}` });
    }

    for (const item of value.actions) {
      if (item.end <= item.start || item.end > value.meta.duration)
        context.addIssue({ code: "custom", message: `invalid action range: ${item.target}` });
    }
  });

export type Composition = z.infer<typeof compositionSchema>;
export type CompositionNode = NodeInput;
