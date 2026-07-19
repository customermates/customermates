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

export const spaceTokens = [
  "none",
  "2xs",
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
] as const;
const spaceToken = z.enum(spaceTokens);
const space = z.union([spaceToken, z.number().min(0).max(160)]);

const qa = z
  .object({
    critical: z.boolean().optional(),
    checkPadding: z.boolean().optional(),
    insetParent: id.optional(),
    inset: spaceToken.optional(),
    insetAxis: z.enum(["x", "y", "both"]).default("x").optional(),
    allowOverlapWith: z.array(id).max(12).optional(),
    alignmentGroup: id.optional(),
    alignment: z.enum(["left", "center", "right"]).optional(),
    minPhonePx: z.number().min(7).max(24).optional(),
    allowClipping: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.insetParent == null) !== (value.inset == null))
      context.addIssue({
        code: "custom",
        message: "insetParent and inset must be declared together",
      });
  });

const layout = z
  .object({
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    width: z
      .union([
        z.number().positive(),
        z.enum(["full", "half", "third", "content"]),
      ])
      .optional(),
    height: z
      .union([z.number().positive(), z.enum(["full", "content"])])
      .optional(),
    minWidth: z.number().positive().optional(),
    maxWidth: z.number().positive().optional(),
    z: z.number().int().min(0).max(100).optional(),
    display: z.enum(["block", "flex", "grid"]).optional(),
    direction: z.enum(["row", "column"]).optional(),
    gap: space.optional(),
    rowGap: space.optional(),
    columnGap: space.optional(),
    rhythm: z.enum(["product", "social-form", "social-hero-form"]).optional(),
    align: z.enum(["start", "center", "end", "stretch"]).optional(),
    justify: z.enum(["start", "center", "end", "between"]).optional(),
    alignSelf: z.enum(["start", "center", "end", "stretch"]).optional(),
    grow: z.boolean().optional(),
    textAlign: z.enum(["left", "center", "right"]).optional(),
    overflow: z.enum(["visible", "hidden", "clip"]).optional(),
    columns: z.number().int().min(1).max(12).optional(),
    padding: space.optional(),
    paddingX: space.optional(),
    paddingY: space.optional(),
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
    if (value.rhythm && value.gap != null)
      context.addIssue({
        code: "custom",
        message: "layout rhythm and gap cannot be declared together",
      });
    if (value.attach && (value.x != null || value.y != null))
      context.addIssue({
        code: "custom",
        message: "attached layout cannot set x or y",
      });
    if (
      (value.x != null || value.y != null) &&
      (typeof value.width === "string" || typeof value.height === "string")
    )
      context.addIssue({
        code: "custom",
        message: "absolute layouts require numeric width and height",
      });
  });

const nodeBase = { id, layout: layout.optional(), qa: qa.optional() };

const textNode = z
  .object({
    ...nodeBase,
    type: z.literal("text"),
    role: z.enum([
      "display",
      "title",
      "body",
      "muted",
      "eyebrow",
      "mono",
      "label",
      "ui",
    ]),
    text: z.string(),
    size: z.enum(["product", "social", "social-hero"]).default("product"),
    maxLines: z.number().int().min(1).max(6).optional(),
    caret: z.boolean().optional(),
  })
  .strict();

const badgeNode = z
  .object({
    ...nodeBase,
    type: z.literal("badge"),
    variant: z.enum([
      "default",
      "secondary",
      "success",
      "warning",
      "info",
      "outline",
    ]),
    text: z.string(),
    size: z.enum(["product", "social", "social-hero"]).default("product"),
  })
  .strict();

const chipNode = z
  .object({
    ...nodeBase,
    type: z.literal("chip"),
    variant: z.enum([
      "default",
      "secondary",
      "success",
      "warning",
      "info",
      "outline",
    ]),
    size: z.enum(["sm", "md", "lg", "social"]),
    text: z.string(),
    startAsset: id.optional(),
  })
  .strict();

const buttonNode = z
  .object({
    ...nodeBase,
    type: z.literal("button"),
    variant: z
      .enum(["default", "destructive", "outline", "secondary", "ghost", "link"])
      .default("default"),
    size: z
      .enum(["default", "sm", "lg", "icon", "icon-sm", "icon-lg"])
      .default("default"),
    text: z.string().min(1),
    startAsset: id.optional(),
  })
  .strict();

const avatarNode = z
  .object({
    ...nodeBase,
    type: z.literal("avatar"),
    name: z.string().min(1),
    size: z.enum(["sm", "default", "lg", "xl"]).default("lg"),
    presentation: z
      .enum(["product", "social", "social-hero"])
      .default("product"),
  })
  .strict();

const providerTileNode = z
  .object({
    ...nodeBase,
    type: z.literal("providerTile"),
    asset: id,
    label: z.string().min(1),
    size: z.enum(["icon-sm", "icon", "icon-lg", "hero"]).default("icon-lg"),
  })
  .strict();

const inputControlNode = z
  .object({
    ...nodeBase,
    type: z.literal("inputControl"),
    value: z.string().optional(),
    placeholder: z.string().optional(),
    presentation: z
      .enum(["product", "social", "social-hero"])
      .default("product"),
  })
  .strict();

const textareaControlNode = z
  .object({
    ...nodeBase,
    type: z.literal("textareaControl"),
    value: z.string().optional(),
    placeholder: z.string().optional(),
    rows: z.number().int().min(2).max(8).default(3),
    presentation: z
      .enum(["product", "social", "social-hero"])
      .default("product"),
  })
  .strict();

const selectControlNode = z
  .object({
    ...nodeBase,
    type: z.literal("selectControl"),
    value: z.string().optional(),
    placeholder: z.string().optional(),
    presentation: z.enum(["product", "social"]).default("product"),
  })
  .strict();

const checkboxControlNode = z
  .object({
    ...nodeBase,
    type: z.literal("checkboxControl"),
    checked: z.boolean().default(false),
    presentation: z.enum(["product", "social"]).default("product"),
  })
  .strict();

const switchControlNode = z
  .object({
    ...nodeBase,
    type: z.literal("switchControl"),
    checked: z.boolean().default(false),
    presentation: z.enum(["product", "social"]).default("product"),
  })
  .strict();

const tabTriggerNode = z
  .object({
    ...nodeBase,
    type: z.literal("tabTrigger"),
    value: id,
    text: z.string().min(1),
  })
  .strict();

const inputNode = z
  .object({
    ...nodeBase,
    type: z.literal("input"),
    label: z.string().min(1),
    value: z.string().optional(),
    placeholder: z.string().optional(),
    description: z.string().optional(),
  })
  .strict();

const alertNode = z
  .object({
    ...nodeBase,
    type: z.literal("alert"),
    variant: z.enum(["default", "destructive"]).default("default"),
    title: z.string().min(1),
    description: z.string().optional(),
  })
  .strict();

const separatorNode = z
  .object({
    ...nodeBase,
    type: z.literal("separator"),
    orientation: z.enum(["horizontal", "vertical"]).default("horizontal"),
  })
  .strict();

const logoNode = z
  .object({
    ...nodeBase,
    type: z.literal("logo"),
    asset: id,
    label: z.string(),
  })
  .strict();

const overlapStackNode = z
  .object({
    ...nodeBase,
    type: z.literal("overlapStack"),
    assets: z.array(id).min(1).max(8),
    labels: z.array(z.string()).min(1).max(8),
    size: z.enum(["default", "sm"]).default("default"),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.assets.length !== value.labels.length)
      context.addIssue({
        code: "custom",
        message: "overlapStack assets and labels must have equal length",
      });
  });

const personCell = z
  .object({
    kind: z.literal("person"),
    primary: z.string(),
    secondary: z.string(),
  })
  .strict();
const textCell = z
  .object({ kind: z.literal("text"), text: z.string() })
  .strict();
const statusCell = z
  .object({
    kind: z.literal("status"),
    initial: z.string(),
    updated: z.string(),
    initialVariant: z
      .enum(["default", "secondary", "outline", "warning", "info"])
      .default("secondary"),
    updatedVariant: z.enum(["success", "default"]).default("success"),
  })
  .strict();

const tableNode = z
  .object({
    ...nodeBase,
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
            cells: z.record(
              id,
              z.discriminatedUnion("kind", [personCell, textCell, statusCell]),
            ),
          })
          .strict(),
      )
      .min(1)
      .max(24),
    countLabel: z.string().optional(),
    presentation: z.enum(["product", "social"]).default("product"),
  })
  .strict();

const tableHeadNode = z
  .object({
    ...nodeBase,
    type: z.literal("tableHead"),
    text: z.string(),
    align: z.enum(["left", "center", "right"]).default("left"),
    width: z.enum(["narrow", "standard", "wide", "fill"]).default("fill"),
  })
  .strict();
const statusSwapNode = z
  .object({
    ...nodeBase,
    type: z.literal("statusSwap"),
    initial: z
      .object({
        text: z.string(),
        variant: z.enum(["default", "secondary", "outline", "warning", "info"]),
      })
      .strict(),
    updated: z
      .object({
        text: z.string(),
        variant: z.enum(["success", "default", "secondary"]),
      })
      .strict(),
    size: z.enum(["product", "social", "social-hero"]).default("product"),
  })
  .strict();

const counterNode = z
  .object({
    ...nodeBase,
    type: z.literal("counter"),
    value: z.number().int().min(0),
    total: z.number().int().positive(),
    suffix: z.string().max(24).optional(),
    variant: z.enum(["secondary", "outline"]).default("secondary"),
    size: z.enum(["product", "social", "social-hero"]).default("product"),
    presentation: z.enum(["badge", "progress"]).default("badge"),
    label: z.string().min(1).max(16).optional(),
    completeLabel: z.string().min(1).max(16).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.presentation === "progress" &&
      (!value.label || !value.completeLabel || value.suffix)
    )
      context.addIssue({
        code: "custom",
        message:
          "progress counter requires label and completeLabel and forbids suffix",
      });
  });

const focusNode = z
  .object({
    ...nodeBase,
    type: z.literal("focus"),
    target: id,
    variant: z.enum(["primary", "success", "warning"]).default("primary"),
    inset: z.number().min(0).max(32).default(6),
    radius: z.number().min(0).max(48).default(12),
    label: z.string().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.layout?.x != null ||
      value.layout?.y != null ||
      value.layout?.attach
    )
      context.addIssue({
        code: "custom",
        message: "focus geometry is derived from its target",
      });
  });

const connectorNode = z
  .object({
    ...nodeBase,
    type: z.literal("connector"),
    from: z.object({ target: id, anchor }).strict(),
    to: z.object({ target: id, anchor }).strict(),
    variant: z.enum(["primary", "muted", "success"]).default("primary"),
    curve: z.enum(["horizontal", "vertical"]).default("horizontal"),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.layout?.x != null ||
      value.layout?.y != null ||
      value.layout?.attach
    )
      context.addIssue({
        code: "custom",
        message: "connector geometry is derived from its endpoints",
      });
  });

type LeafNode =
  | z.infer<typeof textNode>
  | z.infer<typeof badgeNode>
  | z.infer<typeof chipNode>
  | z.infer<typeof buttonNode>
  | z.infer<typeof avatarNode>
  | z.infer<typeof providerTileNode>
  | z.infer<typeof inputControlNode>
  | z.infer<typeof textareaControlNode>
  | z.infer<typeof selectControlNode>
  | z.infer<typeof checkboxControlNode>
  | z.infer<typeof switchControlNode>
  | z.infer<typeof tabTriggerNode>
  | z.infer<typeof inputNode>
  | z.infer<typeof alertNode>
  | z.infer<typeof separatorNode>
  | z.infer<typeof logoNode>
  | z.infer<typeof overlapStackNode>
  | z.infer<typeof tableNode>
  | z.infer<typeof tableHeadNode>
  | z.infer<typeof statusSwapNode>
  | z.infer<typeof counterNode>
  | z.infer<typeof focusNode>
  | z.infer<typeof connectorNode>;

type ContainerType =
  | "group"
  | "stack"
  | "inline"
  | "grid"
  | "field"
  | "cardHeader"
  | "cardAction"
  | "cardContent"
  | "cardFooter"
  | "tableHeader"
  | "tableBody";

type NodeInput =
  | LeafNode
  | {
      id: string;
      type: ContainerType;
      layout?: z.infer<typeof layout>;
      qa?: z.infer<typeof qa>;
      children: NodeInput[];
    }
  | {
      id: string;
      type: "dataTable";
      presentation:
        | "product"
        | "compact"
        | "comfortable"
        | "social"
        | "social-hero";
      layout?: z.infer<typeof layout>;
      qa?: z.infer<typeof qa>;
      children: NodeInput[];
    }
  | {
      id: string;
      type: "tableRow";
      state?: "default" | "selected" | "muted";
      layout?: z.infer<typeof layout>;
      qa?: z.infer<typeof qa>;
      children: NodeInput[];
    }
  | {
      id: string;
      type: "tableCell";
      align?: "left" | "center" | "right";
      width?: "narrow" | "standard" | "wide" | "fill";
      layout?: z.infer<typeof layout>;
      qa?: z.infer<typeof qa>;
      children: NodeInput[];
    }
  | {
      id: string;
      type: "tabs";
      value: string;
      orientation?: "horizontal" | "vertical";
      layout?: z.infer<typeof layout>;
      qa?: z.infer<typeof qa>;
      children: NodeInput[];
    }
  | {
      id: string;
      type: "tabsList";
      variant?: "default" | "line";
      layout?: z.infer<typeof layout>;
      qa?: z.infer<typeof qa>;
      children: NodeInput[];
    }
  | {
      id: string;
      type: "tabsContent";
      value: string;
      layout?: z.infer<typeof layout>;
      qa?: z.infer<typeof qa>;
      children: NodeInput[];
    }
  | {
      id: string;
      type: "card";
      title?: string;
      description?: string;
      headerBadge?: {
        text: string;
        variant: "default" | "secondary" | "success" | "outline";
      };
      presentation?: "product" | "social" | "hero";
      layout?: z.infer<typeof layout>;
      qa?: z.infer<typeof qa>;
      children: NodeInput[];
    };

const containerType = z.enum([
  "group",
  "stack",
  "inline",
  "grid",
  "field",
  "cardHeader",
  "cardAction",
  "cardContent",
  "cardFooter",
  "tableHeader",
  "tableBody",
]);

const node: z.ZodType<NodeInput> = z.lazy(() =>
  z.discriminatedUnion("type", [
    textNode,
    badgeNode,
    chipNode,
    buttonNode,
    avatarNode,
    providerTileNode,
    inputControlNode,
    textareaControlNode,
    selectControlNode,
    checkboxControlNode,
    switchControlNode,
    tabTriggerNode,
    inputNode,
    alertNode,
    separatorNode,
    logoNode,
    overlapStackNode,
    tableNode,
    tableHeadNode,
    statusSwapNode,
    counterNode,
    focusNode,
    connectorNode,
    z
      .object({
        ...nodeBase,
        type: z.literal("dataTable"),
        presentation: z
          .enum(["product", "compact", "comfortable", "social", "social-hero"])
          .default("product"),
        children: z.array(node).default([]),
      })
      .strict(),
    z
      .object({
        ...nodeBase,
        type: z.literal("tableRow"),
        state: z.enum(["default", "selected", "muted"]).default("default"),
        children: z.array(node).default([]),
      })
      .strict(),
    z
      .object({
        ...nodeBase,
        type: z.literal("tableCell"),
        align: z.enum(["left", "center", "right"]).default("left"),
        width: z.enum(["narrow", "standard", "wide", "fill"]).default("fill"),
        children: z.array(node).default([]),
      })
      .strict(),
    z
      .object({
        ...nodeBase,
        type: z.literal("tabs"),
        value: id,
        orientation: z.enum(["horizontal", "vertical"]).default("horizontal"),
        children: z.array(node).default([]),
      })
      .strict(),
    z
      .object({
        ...nodeBase,
        type: z.literal("tabsList"),
        variant: z.enum(["default", "line"]).default("default"),
        children: z.array(node).default([]),
      })
      .strict(),
    z
      .object({
        ...nodeBase,
        type: z.literal("tabsContent"),
        value: id,
        children: z.array(node).default([]),
      })
      .strict(),
    z
      .object({
        ...nodeBase,
        type: containerType,
        children: z.array(node).default([]),
      })
      .strict(),
    z
      .object({
        ...nodeBase,
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
        presentation: z.enum(["product", "social", "hero"]).default("product"),
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
    easing: z.enum([
      "linear",
      "easeIn",
      "easeInStrong",
      "easeOut",
      "easeInOut",
    ]),
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
      type: z.literal("typeValue"),
      target: id,
      start: z.number().min(0),
      end: z.number().positive(),
      value: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("selectValue"),
      target: id,
      start: z.number().min(0),
      end: z.number().positive(),
      value: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("toggleBoolean"),
      target: id,
      start: z.number().min(0),
      end: z.number().positive(),
      value: z.boolean(),
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
  z
    .object({
      type: z.literal("swapState"),
      target: id,
      start: z.number().min(0),
      end: z.number().positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal("countTo"),
      target: id,
      start: z.number().min(0),
      end: z.number().positive(),
      value: z.number().int().min(0),
    })
    .strict(),
]);

const density = z
  .object({
    maxNodes: z.number().int().min(1).max(320).default(48),
    maxTextLeaves: z.number().int().min(1).max(160).default(18),
    maxCharacters: z.number().int().min(1).max(1200).default(320),
    maxPrimaryRegions: z.number().int().min(1).max(8).default(3),
  })
  .strict();

const scene = z
  .object({
    id,
    name: z.string().min(1).max(80),
    category: z.enum(["primitive", "molecule", "pattern", "story"]),
    duration: z.number().min(0.2).max(60).optional(),
    density: density.optional(),
    nodes: z.array(node).min(1),
    motions: z.array(motion).default([]),
    actions: z.array(action).default([]),
  })
  .strict();

type Motion = z.infer<typeof motion>;
type Action = z.infer<typeof action>;

const textContent = (item: NodeInput): string[] => {
  const values: string[] = [];
  if (
    item.type === "text" ||
    item.type === "badge" ||
    item.type === "chip" ||
    item.type === "button"
  )
    values.push(item.text);
  if (item.type === "tableHead") values.push(item.text);
  if (item.type === "statusSwap")
    values.push(item.initial.text, item.updated.text);
  if (item.type === "counter")
    values.push(String(item.value), String(item.total), item.suffix ?? "");
  if (item.type === "input")
    values.push(
      item.label,
      item.value ?? "",
      item.placeholder ?? "",
      item.description ?? "",
    );
  if (item.type === "inputControl")
    values.push(item.value ?? "", item.placeholder ?? "");
  if (item.type === "textareaControl" || item.type === "selectControl")
    values.push(item.value ?? "", item.placeholder ?? "");
  if (item.type === "tabTrigger") values.push(item.text);
  if (item.type === "alert") values.push(item.title, item.description ?? "");
  if (item.type === "card")
    values.push(
      item.title ?? "",
      item.description ?? "",
      item.headerBadge?.text ?? "",
    );
  if (item.type === "table") {
    values.push(...item.columns.map((column) => column.label));
    for (const row of item.rows)
      for (const cell of Object.values(row.cells)) {
        if (cell.kind === "person") values.push(cell.primary, cell.secondary);
        else if (cell.kind === "text") values.push(cell.text);
        else values.push(cell.initial, cell.updated);
      }
  }
  if ("children" in item)
    for (const child of item.children) values.push(...textContent(child));
  return values.filter(Boolean);
};

const validateGraph = (
  nodes: NodeInput[],
  motions: Motion[],
  actions: Action[],
  duration: number,
  context: z.RefinementCtx,
  scope: string,
  strictFlow = false,
) => {
  const nodeIds = new Set<string>();
  const nodeTypes = new Map<string, string>();
  const attachedTargets: Array<{ source: string; target: string }> = [];
  let nodeCount = 0;
  const visit = (item: NodeInput, depth = 0, ancestors: string[] = []) => {
    nodeCount += 1;
    if (nodeIds.has(item.id))
      context.addIssue({
        code: "custom",
        message: `${scope} duplicate node id: ${item.id}`,
      });
    nodeIds.add(item.id);
    nodeTypes.set(item.id, item.type);
    if (item.type === "table") {
      for (const row of item.rows) {
        if (nodeIds.has(row.id))
          context.addIssue({
            code: "custom",
            message: `${scope} duplicate node id: ${row.id}`,
          });
        nodeIds.add(row.id);
      }
    }
    if (
      strictFlow &&
      depth > 0 &&
      (item.layout?.x != null || item.layout?.y != null) &&
      item.type !== "focus" &&
      item.type !== "connector"
    )
      context.addIssue({
        code: "custom",
        message: `${scope} nested node ${item.id} cannot use x/y; use flow and spacing tokens`,
      });
    if (item.layout?.attach)
      attachedTargets.push({
        source: item.id,
        target: item.layout.attach.target,
      });
    if (item.qa?.insetParent) {
      attachedTargets.push({ source: item.id, target: item.qa.insetParent });
      if (!ancestors.includes(item.qa.insetParent))
        context.addIssue({
          code: "custom",
          message: `${scope} insetParent must be an ancestor: ${item.id} -> ${item.qa.insetParent}`,
        });
    }
    if (item.type === "focus")
      attachedTargets.push({ source: item.id, target: item.target });
    if (item.type === "connector") {
      attachedTargets.push({ source: item.id, target: item.from.target });
      attachedTargets.push({ source: item.id, target: item.to.target });
    }
    if ("children" in item) {
      const childTypes = item.children.map((child) => child.type);
      const all = (allowed: string[]) =>
        childTypes.every((type) => allowed.includes(type));
      if (
        item.type === "card" &&
        childTypes.some((type) =>
          ["cardHeader", "cardContent", "cardFooter"].includes(type),
        ) &&
        !all(["cardHeader", "cardContent", "cardFooter"])
      )
        context.addIssue({
          code: "custom",
          message: `${scope} explicit card slots cannot mix with unslotted children: ${item.id}`,
        });
      if (item.type === "dataTable" && !all(["tableHeader", "tableBody"]))
        context.addIssue({
          code: "custom",
          message: `${scope} dataTable children must be tableHeader or tableBody: ${item.id}`,
        });
      if (
        (item.type === "tableHeader" || item.type === "tableBody") &&
        !all(["tableRow"])
      )
        context.addIssue({
          code: "custom",
          message: `${scope} ${item.type} children must be tableRow: ${item.id}`,
        });
      if (item.type === "tableRow" && !all(["tableHead", "tableCell"]))
        context.addIssue({
          code: "custom",
          message: `${scope} tableRow children must be tableHead or tableCell: ${item.id}`,
        });
      if (
        item.type === "field" &&
        !all([
          "text",
          "inputControl",
          "textareaControl",
          "selectControl",
          "checkboxControl",
          "switchControl",
          "inline",
        ])
      )
        context.addIssue({
          code: "custom",
          message: `${scope} field contains an unsupported control: ${item.id}`,
        });
      if (item.type === "tabs" && !all(["tabsList", "tabsContent"]))
        context.addIssue({
          code: "custom",
          message: `${scope} tabs children must be tabsList or tabsContent: ${item.id}`,
        });
      if (item.type === "tabsList" && !all(["tabTrigger"]))
        context.addIssue({
          code: "custom",
          message: `${scope} tabsList children must be tabTrigger: ${item.id}`,
        });
      item.children.forEach((child) =>
        visit(child, depth + 1, [...ancestors, item.id]),
      );
    }
  };
  nodes.forEach((item) => visit(item));
  for (const item of [...motions, ...actions])
    if (!nodeIds.has(item.target))
      context.addIssue({
        code: "custom",
        message: `${scope} unknown target: ${item.target}`,
      });
  const actionTargets = {
    typeText: ["text"],
    typeValue: ["inputControl", "textareaControl"],
    selectValue: ["selectControl"],
    toggleBoolean: ["checkboxControl", "switchControl"],
    updateTable: ["table"],
    swapState: ["statusSwap"],
    countTo: ["counter"],
  } as const;
  for (const item of actions) {
    const targetType = nodeTypes.get(item.target);
    if (
      targetType &&
      !(actionTargets[item.type] as readonly string[]).includes(targetType)
    )
      context.addIssue({
        code: "custom",
        message: `${scope} ${item.type} cannot target ${targetType}: ${item.target}`,
      });
  }
  for (const item of attachedTargets) {
    if (item.source === item.target)
      context.addIssue({
        code: "custom",
        message: `${scope} node cannot target itself: ${item.source}`,
      });
    else if (!nodeIds.has(item.target))
      context.addIssue({
        code: "custom",
        message: `${scope} unknown anchor target: ${item.target}`,
      });
  }
  for (const item of motions)
    if (item.end > duration)
      context.addIssue({
        code: "custom",
        message: `${scope} motion exceeds duration: ${item.target}`,
      });
  for (const item of actions)
    if (item.end <= item.start || item.end > duration)
      context.addIssue({
        code: "custom",
        message: `${scope} invalid action range: ${item.target}`,
      });
  return { nodeCount, text: nodes.flatMap(textContent) };
};

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
    nodes: z.array(node).min(1).optional(),
    motions: z.array(motion).default([]),
    actions: z.array(action).default([]),
    scenes: z.array(scene).min(1).max(64).optional(),
    defaultScene: id.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasLegacy = Boolean(value.nodes?.length);
    const hasScenes = Boolean(value.scenes?.length);
    if (hasLegacy === hasScenes)
      context.addIssue({
        code: "custom",
        message: "composition must declare either nodes or scenes",
      });
    if (hasLegacy)
      validateGraph(
        value.nodes ?? [],
        value.motions,
        value.actions,
        value.meta.duration,
        context,
        "composition",
        false,
      );
    if (hasScenes) {
      if (value.motions.length || value.actions.length)
        context.addIssue({
          code: "custom",
          message:
            "scene compositions keep motions and actions inside each scene",
        });
      const sceneIds = new Set<string>();
      for (const item of value.scenes ?? []) {
        if (sceneIds.has(item.id))
          context.addIssue({
            code: "custom",
            message: `duplicate scene id: ${item.id}`,
          });
        sceneIds.add(item.id);
        const duration = item.duration ?? value.meta.duration;
        const graph = validateGraph(
          item.nodes,
          item.motions,
          item.actions,
          duration,
          context,
          `scene ${item.id}`,
          true,
        );
        const budget = item.density;
        if (budget) {
          if (graph.nodeCount > budget.maxNodes)
            context.addIssue({
              code: "custom",
              message: `scene ${item.id} exceeds maxNodes (${graph.nodeCount}/${budget.maxNodes})`,
            });
          if (graph.text.length > budget.maxTextLeaves)
            context.addIssue({
              code: "custom",
              message: `scene ${item.id} exceeds maxTextLeaves (${graph.text.length}/${budget.maxTextLeaves})`,
            });
          const characters = graph.text.join("").length;
          if (characters > budget.maxCharacters)
            context.addIssue({
              code: "custom",
              message: `scene ${item.id} exceeds maxCharacters (${characters}/${budget.maxCharacters})`,
            });
          if (item.nodes.length > budget.maxPrimaryRegions)
            context.addIssue({
              code: "custom",
              message: `scene ${item.id} exceeds maxPrimaryRegions (${item.nodes.length}/${budget.maxPrimaryRegions})`,
            });
        }
      }
      if (value.defaultScene && !sceneIds.has(value.defaultScene))
        context.addIssue({
          code: "custom",
          message: `unknown defaultScene: ${value.defaultScene}`,
        });
    } else if (value.defaultScene)
      context.addIssue({
        code: "custom",
        message: "defaultScene requires scenes",
      });
  });

export type Composition = z.infer<typeof compositionSchema>;
export type CompositionNode = NodeInput;
export type CompositionScene = z.infer<typeof scene>;
export type SpaceToken = (typeof spaceTokens)[number];
