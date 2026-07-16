import { z } from "zod";

const id = z.string().regex(/^[a-z][a-z0-9-]*$/);

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
  })
  .strict();

const textNode = z
  .object({
    id,
    type: z.literal("text"),
    role: z.enum(["display", "title", "body", "muted", "eyebrow", "mono"]),
    text: z.string(),
    caret: z.boolean().optional(),
    layout: layout.optional(),
  })
  .strict();

const badgeNode = z
  .object({
    id,
    type: z.literal("badge"),
    variant: z.enum(["default", "secondary", "success", "warning", "info", "outline"]),
    text: z.string(),
    layout: layout.optional(),
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
  })
  .strict();

const logoNode = z
  .object({
    id,
    type: z.literal("logo"),
    asset: id,
    label: z.string(),
    layout: layout.optional(),
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
    layout: layout.optional(),
  })
  .strict();

type NodeInput =
  | z.infer<typeof textNode>
  | z.infer<typeof badgeNode>
  | z.infer<typeof chipNode>
  | z.infer<typeof providerTileNode>
  | z.infer<typeof logoNode>
  | z.infer<typeof overlapStackNode>
  | z.infer<typeof tableNode>
  | {
      id: string;
      type: "group";
      layout?: z.infer<typeof layout>;
      children: NodeInput[];
    }
  | {
      id: string;
      type: "card";
      title?: string;
      description?: string;
      headerBadge?: { text: string; variant: "default" | "secondary" | "success" | "outline" };
      layout?: z.infer<typeof layout>;
      children: NodeInput[];
    };

const node: z.ZodType<NodeInput> = z.lazy(() =>
  z.discriminatedUnion("type", [
    textNode,
    badgeNode,
    chipNode,
    providerTileNode,
    logoNode,
    overlapStackNode,
    tableNode,
    z.object({ id, type: z.literal("group"), layout: layout.optional(), children: z.array(node).default([]) }).strict(),
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
    const visit = (item: NodeInput) => {
      if (nodeIds.has(item.id)) context.addIssue({ code: "custom", message: `duplicate node id: ${item.id}` });
      nodeIds.add(item.id);
      if (item.type === "group" || item.type === "card") item.children.forEach(visit);
    };
    value.nodes.forEach(visit);
    for (const item of [...value.motions, ...value.actions])
      if (!nodeIds.has(item.target)) context.addIssue({ code: "custom", message: `unknown target: ${item.target}` });

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
