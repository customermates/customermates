import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import tailwindPostcss from "@tailwindcss/postcss";
import postcss from "postcss";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AppChip } from "@/components/chip/app-chip";
import { OverlappingStack } from "@/components/shared/overlapping-stack";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

import {
  compositionSchema,
  type Composition,
  type CompositionNode,
  type CompositionScene,
  type SpaceToken,
} from "./schema";

type AssetRoots = Record<string, string>;
type AssetMap = Record<string, { dataUri: string }>;

const socialBadgeClassName = "h-9 px-3 py-1.5 text-[22px] leading-none";
const socialHeroBadgeClassName = "h-11 px-4 py-2 text-[28px] leading-none";
const socialControlTypographyClassName = "text-[22px] leading-7 md:text-[22px]";
const socialHeroControlTypographyClassName =
  "text-[28px] leading-9 md:text-[28px]";
const socialSingleLineControlClassName = `h-14 px-5 py-3 ${socialControlTypographyClassName}`;
const socialSelectControlClassName = `h-14 data-[size=default]:h-14 px-5 py-3 ${socialControlTypographyClassName}`;
const socialTextareaControlClassName = `min-h-32 px-5 py-4 ${socialControlTypographyClassName}`;
const socialHeroSingleLineControlClassName = `h-16 px-6 py-3.5 ${socialHeroControlTypographyClassName}`;
const socialHeroSelectControlClassName = `h-16 data-[size=default]:h-16 px-6 py-3.5 ${socialHeroControlTypographyClassName}`;
const socialHeroTextareaControlClassName = `min-h-40 px-6 py-5 ${socialHeroControlTypographyClassName}`;

const inputControlClassName = (
  presentation: "product" | "social" | "social-hero",
) =>
  presentation === "social-hero"
    ? socialHeroSingleLineControlClassName
    : presentation === "social"
      ? socialSingleLineControlClassName
      : undefined;
const selectControlClassName = (
  presentation: "product" | "social" | "social-hero",
) =>
  presentation === "social-hero"
    ? `w-full ${socialHeroSelectControlClassName}`
    : presentation === "social"
      ? `w-full ${socialSelectControlClassName}`
      : "w-full";
const textareaControlClassName = (
  presentation: "product" | "social" | "social-hero",
) =>
  presentation === "social-hero"
    ? socialHeroTextareaControlClassName
    : presentation === "social"
      ? socialTextareaControlClassName
      : undefined;

export const spacingRecipes = {
  product: {
    field: 8,
    grid: 16,
    inline: 12,
    stack: 16,
  },
  "social-form": {
    field: 8,
    grid: 24,
    inline: 16,
    stack: 24,
  },
  "social-hero-form": {
    field: 8,
    grid: 24,
    inline: 16,
    stack: 24,
  },
} as const;
const badgeClassForSize = (size: "product" | "social" | "social-hero") =>
  size === "social-hero"
    ? socialHeroBadgeClassName
    : size === "social"
      ? socialBadgeClassName
      : undefined;
const tableColumnClassName = (
  align: "left" | "center" | "right" = "left",
  width: "narrow" | "standard" | "wide" | "fill" = "fill",
) =>
  [
    align === "center"
      ? "text-center [&>*]:mx-auto"
      : align === "right"
        ? "text-right [&>*]:ml-auto"
        : "text-left",
    {
      narrow: "w-24",
      standard: "w-40",
      wide: "w-64",
      fill: "w-auto",
    }[width],
  ].join(" ");

const htmlEscape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const assertWithinRoot = (root: string, candidate: string) => {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(resolvedRoot, candidate);
  const pathFromRoot = relative(resolvedRoot, resolvedCandidate);
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot))
    throw new Error(`asset escapes root: ${candidate}`);
  return resolvedCandidate;
};

const loadAssets = (composition: Composition, roots: AssetRoots): AssetMap =>
  Object.fromEntries(
    Object.entries(composition.assets).map(([assetId, asset]) => {
      const root = roots[asset.root];
      if (!root) throw new Error(`missing asset root: ${asset.root}`);
      const file = assertWithinRoot(root, asset.path);
      const bytes = readFileSync(file);
      return [
        assetId,
        {
          dataUri: `data:${asset.mediaType};base64,${bytes.toString("base64")}`,
        },
      ];
    }),
  );

export const spaceValues: Record<SpaceToken, number> = {
  none: 0,
  "2xs": 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
};

const spaceValue = (value: SpaceToken | number | undefined) =>
  typeof value === "number"
    ? value
    : value == null
      ? undefined
      : spaceValues[value];

const dimensionValue = (value: number | string | undefined) => {
  if (typeof value === "number" || value == null) return value;
  return {
    full: "100%",
    half: "50%",
    third: "33.333333%",
    content: "max-content",
  }[value];
};

const alignment = (
  value: "start" | "center" | "end" | "stretch" | undefined,
) => (value === "start" ? "flex-start" : value === "end" ? "flex-end" : value);

const layoutStyle = (
  layout: CompositionNode["layout"],
  nodeType?: CompositionNode["type"],
): React.CSSProperties => {
  if (!layout) return {};
  const style: React.CSSProperties = {};
  if (
    layout.x != null ||
    layout.y != null ||
    typeof layout.width === "number" ||
    typeof layout.height === "number"
  )
    style.position = "absolute";
  if (layout.attach) style.position = "absolute";
  if (layout.x != null) style.left = layout.x;
  if (layout.y != null) style.top = layout.y;
  if (layout.width != null) style.width = dimensionValue(layout.width);
  if (layout.height != null) style.height = dimensionValue(layout.height);
  if (layout.minWidth != null) style.minWidth = layout.minWidth;
  if (layout.maxWidth != null) style.maxWidth = layout.maxWidth;
  if (layout.z != null) style.zIndex = layout.z;
  if (layout.display) style.display = layout.display;
  if (layout.direction) style.flexDirection = layout.direction;
  if (layout.gap != null) style.gap = spaceValue(layout.gap);
  else if (
    layout.rhythm &&
    nodeType &&
    nodeType in spacingRecipes[layout.rhythm]
  )
    style.gap =
      spacingRecipes[layout.rhythm][
        nodeType as keyof (typeof spacingRecipes)[typeof layout.rhythm]
      ];
  if (layout.rowGap != null) style.rowGap = spaceValue(layout.rowGap);
  if (layout.columnGap != null) style.columnGap = spaceValue(layout.columnGap);
  if (layout.align) style.alignItems = alignment(layout.align);
  if (layout.alignSelf) style.alignSelf = alignment(layout.alignSelf);
  if (layout.grow) style.flexGrow = 1;
  if (layout.justify) {
    style.justifyContent =
      layout.justify === "between"
        ? "space-between"
        : layout.justify === "start"
          ? "flex-start"
          : layout.justify === "end"
            ? "flex-end"
            : layout.justify;
  }
  if (layout.columns)
    style.gridTemplateColumns = `repeat(${layout.columns}, minmax(0, 1fr))`;
  if (layout.textAlign) style.textAlign = layout.textAlign;
  if (layout.overflow) style.overflow = layout.overflow;
  if (layout.padding != null) style.padding = spaceValue(layout.padding);
  if (layout.paddingX != null) {
    style.paddingLeft = spaceValue(layout.paddingX);
    style.paddingRight = spaceValue(layout.paddingX);
  }
  if (layout.paddingY != null) {
    style.paddingTop = spaceValue(layout.paddingY);
    style.paddingBottom = spaceValue(layout.paddingY);
  }
  return style;
};

const nodeAttributes = (
  node: CompositionNode,
  baseStyle: React.CSSProperties = {},
) => ({
  "data-cm-alignment": node.qa?.alignment,
  "data-cm-alignment-group": node.qa?.alignmentGroup,
  "data-cm-allow-overlap": node.qa?.allowOverlapWith?.join(","),
  "data-cm-attach": node.layout?.attach
    ? JSON.stringify(node.layout.attach)
    : undefined,
  "data-cm-check-padding": node.qa?.checkPadding ? "true" : undefined,
  "data-cm-component": node.type,
  "data-cm-critical": node.qa?.critical ? "true" : undefined,
  "data-cm-id": node.id,
  "data-cm-inset-axis": node.qa?.insetAxis,
  "data-cm-inset-parent": node.qa?.insetParent,
  "data-cm-inset-token": node.qa?.inset,
  "data-cm-min-phone-px": node.qa?.minPhonePx,
  "data-cm-spacing-recipe": node.layout?.rhythm,
  "data-cm-allow-clipping": node.qa?.allowClipping ? "true" : undefined,
  "data-cm-qa-box":
    node.qa?.allowOverlapWith ||
    node.qa?.alignmentGroup ||
    node.qa?.checkPadding ||
    node.qa?.insetParent
      ? "true"
      : undefined,
  "data-motion-id": node.id,
  style: { ...baseStyle, ...layoutStyle(node.layout, node.type) },
});

const wrapper = (
  node: CompositionNode,
  content: React.ReactNode,
  baseStyle: React.CSSProperties = {},
) => <div {...nodeAttributes(node, baseStyle)}>{content}</div>;

const assetImage = (assets: AssetMap, asset: string, label: string) => {
  const value = assets[asset];
  if (!value) throw new Error(`unknown asset: ${asset}`);
  return React.createElement("img", {
    alt: label,
    className: "size-full object-contain",
    src: value.dataUri,
  });
};

const childrenFor = (node: CompositionNode, assets: AssetMap) =>
  "children" in node
    ? node.children.map((child) => (
        <React.Fragment key={child.id}>
          {renderNode(child, assets)}
        </React.Fragment>
      ))
    : null;

const renderNode = (
  node: CompositionNode,
  assets: AssetMap,
): React.ReactNode => {
  if (node.type === "group") return wrapper(node, childrenFor(node, assets));
  if (node.type === "stack")
    return wrapper(node, childrenFor(node, assets), {
      display: "flex",
      flexDirection: "column",
      gap: spaceValues.md,
    });
  if (node.type === "inline")
    return wrapper(node, childrenFor(node, assets), {
      display: "flex",
      alignItems: "center",
      gap: spaceValues.sm,
    });
  if (node.type === "grid")
    return wrapper(node, childrenFor(node, assets), {
      display: "grid",
      gap: spaceValues.md,
    });
  if (node.type === "field")
    return wrapper(node, childrenFor(node, assets), {
      display: "grid",
      gap: spaceValues.xs,
    });

  if (node.type === "text") {
    const classes = {
      display: "text-x-4xl",
      title: "text-x-3xl",
      body: "text-sm text-foreground",
      muted: "text-sm text-muted-foreground",
      eyebrow: "text-xs font-medium uppercase tracking-widest text-primary",
      mono: "font-mono text-sm font-medium text-foreground",
      label: "text-sm font-medium text-foreground",
      ui: "text-[22px] font-medium text-foreground",
    }[node.role];
    const resolvedClasses = `${classes}${node.size === "social-hero" ? " text-[28px]" : node.size === "social" ? " text-[22px]" : ""}`;
    const textStyle: React.CSSProperties | undefined = node.maxLines
      ? {
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: node.maxLines,
          overflow: "hidden",
        }
      : undefined;
    const content =
      node.role === "display" ? (
        <h1
          className={resolvedClasses}
          data-cm-text-leaf
          data-cm-type-token={node.role}
          style={textStyle}
        >
          {node.text}
        </h1>
      ) : (
        <div
          className={resolvedClasses}
          data-cm-text-leaf
          data-cm-type-token={node.role}
          style={textStyle}
        >
          {node.text}
        </div>
      );
    return wrapper(
      node,
      <div data-text-target={node.id}>
        {content}
        {node.caret && (
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-primary"
            data-caret-for={node.id}
          />
        )}
      </div>,
    );
  }
  if (node.type === "badge")
    return wrapper(
      node,
      <Badge className={badgeClassForSize(node.size)} variant={node.variant}>
        {node.text}
      </Badge>,
    );
  if (node.type === "chip") {
    const startContent = node.startAsset
      ? assetImage(assets, node.startAsset, "")
      : undefined;
    return wrapper(
      node,
      <AppChip
        className={node.size === "social" ? socialBadgeClassName : undefined}
        size={node.size === "social" ? "lg" : node.size}
        startContent={startContent}
        variant={node.variant}
      >
        {node.text}
      </AppChip>,
    );
  }
  if (node.type === "button")
    return wrapper(
      node,
      <Button size={node.size} variant={node.variant}>
        {node.startAsset ? (
          <span className="size-4">
            {assetImage(assets, node.startAsset, "")}
          </span>
        ) : null}
        {node.text}
      </Button>,
    );
  if (node.type === "avatar")
    return wrapper(
      node,
      <Avatar
        className={
          node.presentation === "social"
            ? "[&_[data-slot=avatar-fallback]]:text-[22px]"
            : undefined
        }
        name={node.name}
        size={node.size}
      />,
    );
  if (node.type === "providerTile")
    return wrapper(
      node,
      <Button
        aria-label={node.label}
        className={node.size === "hero" ? "size-24 rounded-xl p-5" : undefined}
        size={node.size === "hero" ? "icon-lg" : node.size}
        variant="outline"
      >
        {assetImage(assets, node.asset, "")}
      </Button>,
    );
  if (node.type === "inputControl")
    return wrapper(
      node,
      <Input
        aria-label={node.id}
        className={inputControlClassName(node.presentation)}
        data-cm-control-id={node.id}
        data-cm-control-kind="single-line"
        data-cm-control-presentation={node.presentation}
        data-input-target={node.id}
        placeholder={node.placeholder}
        readOnly
        value={node.value ?? ""}
      />,
    );
  if (node.type === "textareaControl")
    return wrapper(
      node,
      <Textarea
        aria-label={node.id}
        className={textareaControlClassName(node.presentation)}
        data-cm-control-id={node.id}
        data-cm-control-kind="multiline"
        data-cm-control-presentation={node.presentation}
        data-input-target={node.id}
        placeholder={node.placeholder}
        readOnly
        rows={node.rows}
        value={node.value ?? ""}
      />,
    );
  if (node.type === "selectControl")
    return wrapper(
      node,
      <Select value="content-static-value">
        <SelectTrigger
          aria-label={node.id}
          className={selectControlClassName(node.presentation)}
          data-cm-control-id={node.id}
          data-cm-control-kind="single-line"
          data-cm-control-presentation={node.presentation}
        >
          <span
            className={node.value ? undefined : "text-muted-foreground"}
            data-select-initial={node.value ?? node.placeholder ?? "Select"}
            data-select-initial-placeholder={node.value ? "false" : "true"}
            data-select-target={node.id}
          >
            {node.value ?? node.placeholder ?? "Select"}
          </span>
        </SelectTrigger>
      </Select>,
    );
  if (node.type === "checkboxControl")
    return wrapper(
      node,
      <Checkbox
        aria-label={node.id}
        checked={node.checked}
        className={node.presentation === "social" ? "size-7" : undefined}
        data-boolean-initial={String(node.checked)}
        data-boolean-target={node.id}
      />,
    );
  if (node.type === "switchControl")
    return wrapper(
      node,
      <Switch
        aria-label={node.id}
        checked={node.checked}
        className={node.presentation === "social" ? "h-7 w-12" : undefined}
        data-boolean-initial={String(node.checked)}
        data-boolean-target={node.id}
      />,
    );
  if (node.type === "tabTrigger")
    return (
      <TabsTrigger {...nodeAttributes(node)} value={node.value}>
        {node.text}
      </TabsTrigger>
    );
  if (node.type === "input")
    return wrapper(
      node,
      <div className="grid gap-2">
        <Label htmlFor={node.id}>{node.label}</Label>
        <Input
          id={node.id}
          placeholder={node.placeholder}
          readOnly
          value={node.value ?? ""}
        />
        {node.description && (
          <div className="text-xs text-muted-foreground">
            {node.description}
          </div>
        )}
      </div>,
    );
  if (node.type === "alert")
    return wrapper(
      node,
      <Alert variant={node.variant}>
        <AlertTitle>{node.title}</AlertTitle>
        {node.description && (
          <AlertDescription>{node.description}</AlertDescription>
        )}
      </Alert>,
    );
  if (node.type === "separator")
    return wrapper(node, <Separator orientation={node.orientation} />);
  if (node.type === "logo")
    return wrapper(node, assetImage(assets, node.asset, node.label));
  if (node.type === "overlapStack") {
    const entries = node.assets.map((asset, index) => ({
      asset,
      label: node.labels[index],
    }));
    return wrapper(
      node,
      <OverlappingStack
        badgeKey={(entry) => entry.asset}
        badges={entries}
        renderBadge={(entry) => (
          <Button aria-label={entry.label} size="icon-lg" variant="outline">
            {assetImage(assets, entry.asset, "")}
          </Button>
        )}
        renderOverflow={(count) => <Badge variant="secondary">+{count}</Badge>}
        size={node.size}
      />,
    );
  }
  if (node.type === "counter" && node.presentation === "progress") {
    const percentage = Math.min(100, (node.value / node.total) * 100);
    return wrapper(
      node,
      <Badge
        className={`${
          node.size === "social-hero"
            ? "h-14 min-w-72 px-5 text-[28px]"
            : node.size === "social"
              ? "h-12 min-w-64 px-4 text-[22px]"
              : "h-9 min-w-48 px-3"
        } relative justify-between gap-4 overflow-hidden tabular-nums`}
        data-count-root={node.id}
        variant={node.variant}
      >
        <span
          className="absolute inset-y-0 left-0 bg-primary/15 transition-none"
          data-count-progress={node.id}
          style={{ width: `${percentage}%` }}
        />
        <span className="relative flex items-center gap-2 font-medium">
          <span className="size-2 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
          <span
            data-count-complete-label={node.completeLabel}
            data-count-label={node.label}
            data-count-status={node.id}
          >
            {node.value >= node.total ? node.completeLabel : node.label}
          </span>
        </span>
        <span className="relative font-semibold">
          <span data-count-target={node.id}>{node.value}</span>
          <span>{`/${node.total}`}</span>
        </span>
      </Badge>,
    );
  }
  if (node.type === "counter")
    return wrapper(
      node,
      <Badge className={badgeClassForSize(node.size)} variant={node.variant}>
        <span data-count-target={node.id}>{node.value}</span>
        <span>{`/${node.total}${node.suffix ?? ""}`}</span>
      </Badge>,
    );
  if (node.type === "statusSwap") {
    const social = node.size === "social" || node.size === "social-hero";
    const statusClassName = badgeClassForSize(node.size);
    return wrapper(
      node,
      <div
        className={
          node.size === "social-hero"
            ? "relative h-11 min-w-40"
            : social
              ? "relative h-9 min-w-32"
              : "relative h-5 min-w-20"
        }
        data-state-target={node.id}
      >
        <span
          className="absolute inset-0 flex items-center justify-end"
          data-state-initial
        >
          <Badge className={statusClassName} variant={node.initial.variant}>
            {node.initial.text}
          </Badge>
        </span>
        <span
          className="absolute inset-0 flex items-center justify-end opacity-0"
          data-state-updated
        >
          <Badge className={statusClassName} variant={node.updated.variant}>
            {node.updated.text}
          </Badge>
        </span>
      </div>,
    );
  }
  if (node.type === "focus") {
    const classes = {
      primary:
        "border-primary text-primary shadow-[0_0_28px_color-mix(in_oklab,var(--primary)_32%,transparent)]",
      success:
        "border-success text-success shadow-[0_0_28px_color-mix(in_oklab,var(--success)_28%,transparent)]",
      warning:
        "border-warning text-warning shadow-[0_0_28px_color-mix(in_oklab,var(--warning)_28%,transparent)]",
    }[node.variant];
    return wrapper(
      node,
      <div
        className={`pointer-events-none absolute inset-0 rounded-[inherit] border-2 ${classes}`}
        data-cm-focus-inset={node.inset}
        data-cm-focus-radius={node.radius}
        data-cm-focus-target={node.target}
      >
        {node.label && (
          <span className="absolute -top-7 left-0 font-mono text-xs font-medium">
            {node.label}
          </span>
        )}
      </div>,
    );
  }
  if (node.type === "connector") {
    const classes = {
      primary: "text-primary",
      muted: "text-muted-foreground",
      success: "text-success",
    }[node.variant];
    return wrapper(
      node,
      <svg
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 size-full overflow-visible ${classes}`}
        data-cm-connector-curve={node.curve}
        data-cm-connector-from={JSON.stringify(node.from)}
        data-cm-connector-to={JSON.stringify(node.to)}
        fill="none"
      >
        <path
          data-cm-connector-path
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>,
    );
  }

  if (node.type === "cardHeader")
    return (
      <CardHeader {...nodeAttributes(node)}>
        {childrenFor(node, assets)}
      </CardHeader>
    );
  if (node.type === "cardAction")
    return (
      <CardAction {...nodeAttributes(node)}>
        {childrenFor(node, assets)}
      </CardAction>
    );
  if (node.type === "cardContent")
    return (
      <CardContent {...nodeAttributes(node)}>
        {childrenFor(node, assets)}
      </CardContent>
    );
  if (node.type === "cardFooter")
    return (
      <CardFooter {...nodeAttributes(node)}>
        {childrenFor(node, assets)}
      </CardFooter>
    );
  if (node.type === "dataTable") {
    const social = node.presentation === "social";
    const socialHero = node.presentation === "social-hero";
    const compact = node.presentation === "compact";
    const comfortable = node.presentation === "comfortable";
    return (
      <div {...nodeAttributes(node)} data-table-id={node.id}>
        <Table
          className={
            socialHero
              ? "text-[28px] [&_[data-slot=table-cell]]:h-[76px] [&_[data-slot=table-cell]]:px-0 [&_[data-slot=table-cell]]:py-3 [&_[data-slot=table-head]]:h-14 [&_[data-slot=table-head]]:px-0 [&_[data-slot=table-head]]:text-[28px]"
              : social
                ? "text-[22px] [&_[data-slot=table-cell]]:px-5 [&_[data-slot=table-cell]]:py-4 [&_[data-slot=table-head]]:h-12 [&_[data-slot=table-head]]:px-5 [&_[data-slot=table-head]]:text-[22px]"
                : compact
                  ? "text-xs [&_[data-slot=table-cell]]:h-8 [&_[data-slot=table-cell]]:px-2 [&_[data-slot=table-cell]]:py-1 [&_[data-slot=table-head]]:h-8 [&_[data-slot=table-head]]:px-2 [&_[data-slot=table-head]]:text-xs"
                  : comfortable
                    ? "[&_[data-slot=table-cell]]:h-14 [&_[data-slot=table-cell]]:px-4 [&_[data-slot=table-cell]]:py-3 [&_[data-slot=table-head]]:h-12 [&_[data-slot=table-head]]:px-4"
                    : undefined
          }
        >
          {childrenFor(node, assets)}
        </Table>
      </div>
    );
  }
  if (node.type === "tableHeader")
    return (
      <TableHeader {...nodeAttributes(node)}>
        {childrenFor(node, assets)}
      </TableHeader>
    );
  if (node.type === "tableBody")
    return (
      <TableBody {...nodeAttributes(node)}>
        {childrenFor(node, assets)}
      </TableBody>
    );
  if (node.type === "tableRow")
    return (
      <TableRow
        {...nodeAttributes(node)}
        className={node.state === "muted" ? "opacity-55" : undefined}
        data-state={node.state === "selected" ? "selected" : undefined}
      >
        {childrenFor(node, assets)}
      </TableRow>
    );
  if (node.type === "tableHead")
    return (
      <TableHead
        {...nodeAttributes(node)}
        className={tableColumnClassName(node.align, node.width)}
      >
        {node.text}
      </TableHead>
    );
  if (node.type === "tableCell")
    return (
      <TableCell
        {...nodeAttributes(node)}
        className={tableColumnClassName(node.align, node.width)}
      >
        {childrenFor(node, assets)}
      </TableCell>
    );

  if (node.type === "tabs")
    return (
      <Tabs
        {...nodeAttributes(node)}
        orientation={node.orientation}
        value={node.value}
      >
        {childrenFor(node, assets)}
      </Tabs>
    );
  if (node.type === "tabsList")
    return (
      <TabsList {...nodeAttributes(node)} variant={node.variant}>
        {childrenFor(node, assets)}
      </TabsList>
    );
  if (node.type === "tabsContent")
    return (
      <TabsContent {...nodeAttributes(node)} value={node.value}>
        {childrenFor(node, assets)}
      </TabsContent>
    );

  if (node.type === "table") {
    const social = node.presentation === "social";
    return wrapper(
      node,
      <div data-table-id={node.id}>
        {node.countLabel && (
          <div className="mb-2 flex justify-end">
            <Badge
              className={social ? "px-3 py-1.5 text-[22px]" : undefined}
              variant="secondary"
            >
              <span data-count-for={node.id}>0</span>
              <span>{`/${node.countLabel}`}</span>
            </Badge>
          </div>
        )}
        <Table className={social ? "text-[22px]" : undefined}>
          <TableHeader>
            <TableRow>
              {node.columns.map((column) => (
                <TableHead
                  className={social ? "h-12 px-5 text-[22px]" : undefined}
                  key={column.key}
                >
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {node.rows.map((row, rowIndex) => (
              <TableRow
                key={row.id}
                data-cm-component="table-row"
                data-cm-id={row.id}
                data-row-index={rowIndex}
              >
                {node.columns.map((column) => {
                  const cell = row.cells[column.key];
                  if (!cell)
                    throw new Error(`row ${row.id} misses cell ${column.key}`);
                  if (cell.kind === "person")
                    return (
                      <TableCell
                        className={social ? "px-5 py-4" : undefined}
                        key={column.key}
                      >
                        <div
                          className={
                            social
                              ? "flex items-center gap-4"
                              : "flex items-center gap-2"
                          }
                        >
                          <Avatar
                            className={
                              social
                                ? "[&_[data-slot=avatar-fallback]]:text-[22px]"
                                : undefined
                            }
                            name={cell.primary}
                            size={social ? "xl" : "lg"}
                          />
                          <div>
                            <div
                              className={
                                social
                                  ? "text-[22px] font-medium"
                                  : "font-medium"
                              }
                            >
                              {cell.primary}
                            </div>
                            <div
                              className={
                                social
                                  ? "text-[22px] text-muted-foreground"
                                  : "text-[11px] text-muted-foreground"
                              }
                            >
                              {cell.secondary}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    );
                  if (cell.kind === "text")
                    return (
                      <TableCell
                        className={social ? "px-5 py-4 text-[22px]" : undefined}
                        key={column.key}
                      >
                        {cell.text}
                      </TableCell>
                    );
                  return (
                    <TableCell
                      className={social ? "px-5 py-4" : undefined}
                      key={column.key}
                    >
                      <div
                        className={
                          social
                            ? "relative h-9 min-w-32"
                            : "relative h-5 min-w-20"
                        }
                      >
                        <span className="absolute inset-0" data-state-initial>
                          <Badge
                            className={
                              social ? "px-3 py-1.5 text-[22px]" : undefined
                            }
                            variant={cell.initialVariant}
                          >
                            {cell.initial}
                          </Badge>
                        </span>
                        <span
                          className="absolute inset-0 opacity-0"
                          data-state-updated
                        >
                          <Badge
                            className={
                              social ? "px-3 py-1.5 text-[22px]" : undefined
                            }
                            variant={cell.updatedVariant}
                          >
                            {cell.updated}
                          </Badge>
                        </span>
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>,
    );
  }

  if (node.type !== "card")
    throw new Error(`unsupported composition node: ${node.type}`);
  const explicitSlots = node.children.some((child) =>
    ["cardHeader", "cardContent", "cardFooter"].includes(child.type),
  );
  return (
    <Card
      {...nodeAttributes(node)}
      className={
        node.presentation === "hero"
          ? "gap-8 rounded-xl py-8 [&>[data-slot=card-header]]:px-8 [&>[data-slot=card-content]]:px-8 [&>[data-slot=card-footer]]:px-8"
          : node.presentation === "social"
            ? "gap-8 py-12 [&>[data-slot=card-header]]:px-12 [&>[data-slot=card-content]]:px-12 [&>[data-slot=card-footer]]:px-12"
            : undefined
      }
    >
      {explicitSlots ? (
        childrenFor(node, assets)
      ) : (
        <>
          {(node.title || node.description || node.headerBadge) && (
            <CardHeader>
              {node.title && <CardTitle>{node.title}</CardTitle>}
              {node.description && (
                <CardDescription>{node.description}</CardDescription>
              )}
              {node.headerBadge && (
                <CardAction>
                  <Badge variant={node.headerBadge.variant}>
                    {node.headerBadge.text}
                  </Badge>
                </CardAction>
              )}
            </CardHeader>
          )}
          <CardContent>{childrenFor(node, assets)}</CardContent>
        </>
      )}
    </Card>
  );
};

const inlineFontCss = (
  packageName: string,
  family: string,
  weights: number[],
) =>
  weights
    .map((weight) => {
      const cssPath = resolve(
        `node_modules/${packageName}/latin-${weight}.css`,
      );
      const css = readFileSync(cssPath, "utf8");
      const match = css.match(/url\(\.\/files\/([^)]*?\.woff2)\)/);
      if (!match)
        throw new Error(
          `missing font file declaration: ${packageName} ${weight}`,
        );
      const bytes = readFileSync(resolve(dirname(cssPath), "files", match[1]));
      return `@font-face{font-family:'${family}';font-style:normal;font-display:block;font-weight:${weight};src:url(data:font/woff2;base64,${bytes.toString("base64")}) format('woff2')}`;
    })
    .join("\n");

export const compileProductCss = async () => {
  const source = `@import "../../styles/globals.css";\n@source "../../components/ui/card.tsx";\n@source "../../components/ui/button.tsx";\n@source "../../components/ui/badge.tsx";\n@source "../../components/ui/table.tsx";\n@source "../../components/ui/avatar.tsx";\n@source "../../components/ui/input.tsx";\n@source "../../components/ui/textarea.tsx";\n@source "../../components/ui/select.tsx";\n@source "../../components/ui/checkbox.tsx";\n@source "../../components/ui/switch.tsx";\n@source "../../components/ui/tabs.tsx";\n@source "../../components/ui/label.tsx";\n@source "../../components/ui/alert.tsx";\n@source "../../components/ui/separator.tsx";\n@source "../../components/chip/app-chip.tsx";\n@source "../../components/shared/overlapping-stack.tsx";\n@source "./render.tsx";`;
  const result = await postcss([tailwindPostcss() as never]).process(source, {
    from: resolve("tools/content-motion/motion.css"),
  });
  return `${inlineFontCss("@fontsource/inter", "Inter", [400, 500, 600, 700])}\n${inlineFontCss("@fontsource/jetbrains-mono", "JetBrains Mono", [400, 500])}\n${result.css}`;
};

const scenePayload = (composition: Composition) => {
  if (composition.scenes)
    return composition.scenes.map((scene) => ({
      id: scene.id,
      duration: scene.duration ?? composition.meta.duration,
      motions: scene.motions,
      actions: scene.actions,
    }));
  return [
    {
      id: "default",
      duration: composition.meta.duration,
      motions: composition.motions,
      actions: composition.actions,
    },
  ];
};

const runtime = (composition: Composition, defaultScene: string) => `
const cmSpace=${JSON.stringify(spaceValues)};
const composition=${JSON.stringify({ scenes: scenePayload(composition), defaultScene })};
const sceneMap=new Map(composition.scenes.map((scene)=>[scene.id,scene]));
let activeScene=composition.defaultScene;
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const ease=(name,value)=>{value=clamp(value);if(name==='linear')return value;if(name==='easeIn')return value*value*value;if(name==='easeInStrong')return value*value*value*value*value;if(name==='easeOut')return 1-Math.pow(1-value,3);return value<.5?4*value*value*value:1-Math.pow(-2*value+2,3)/2};
const mix=(a,b,value)=>(a??0)+((b??0)-(a??0))*value;
const cmRoot=()=>document.querySelector('[data-cm-scene-id="'+activeScene+'"]')??document;
const cmNode=(id)=>cmRoot().querySelector('[data-cm-id="'+id+'"]');
const cmAnchor=(rect,name)=>({
  'top-left':[rect.left,rect.top],'top':[rect.left+rect.width/2,rect.top],'top-right':[rect.right,rect.top],
  'left':[rect.left,rect.top+rect.height/2],'center':[rect.left+rect.width/2,rect.top+rect.height/2],'right':[rect.right,rect.top+rect.height/2],
  'bottom-left':[rect.left,rect.bottom],'bottom':[rect.left+rect.width/2,rect.bottom],'bottom-right':[rect.right,rect.bottom]
}[name]);
const cmPlaceAttached=()=>{
  const bodyRect=document.body.getBoundingClientRect();
  for(const element of cmRoot().querySelectorAll('[data-cm-attach]')){
    const spec=JSON.parse(element.dataset.cmAttach);const target=cmNode(spec.target);if(!target)continue;
    const baseRect=element.offsetParent?.getBoundingClientRect()??bodyRect;const targetPoint=cmAnchor(target.getBoundingClientRect(),spec.targetAnchor);
    const width=element.offsetWidth;const height=element.offsetHeight;const local=cmAnchor({left:0,top:0,right:width,bottom:height,width,height},spec.selfAnchor);
    element.style.left=(targetPoint[0]-baseRect.left-local[0]+spec.offsetX)+'px';element.style.top=(targetPoint[1]-baseRect.top-local[1]+spec.offsetY)+'px';
  }
};
const cmPlaceFocus=()=>{
  const bodyRect=document.body.getBoundingClientRect();
  for(const marker of cmRoot().querySelectorAll('[data-cm-focus-target]')){
    const holder=marker.closest('[data-cm-id]');const target=cmNode(marker.dataset.cmFocusTarget);if(!holder||!target)continue;
    const baseRect=holder.offsetParent?.getBoundingClientRect()??bodyRect;const rect=target.getBoundingClientRect();const inset=Number(marker.dataset.cmFocusInset||0);const radius=Number(marker.dataset.cmFocusRadius||0);
    holder.style.position='absolute';holder.style.left=(rect.left-baseRect.left-inset)+'px';holder.style.top=(rect.top-baseRect.top-inset)+'px';holder.style.width=(rect.width+inset*2)+'px';holder.style.height=(rect.height+inset*2)+'px';holder.style.borderRadius=radius+'px';
  }
};
const cmPlaceConnectors=()=>{
  for(const svg of cmRoot().querySelectorAll('[data-cm-connector-from]')){
    const holder=svg.closest('[data-cm-id]');const from=JSON.parse(svg.dataset.cmConnectorFrom);const to=JSON.parse(svg.dataset.cmConnectorTo);const fromTarget=cmNode(from.target);const toTarget=cmNode(to.target);if(!holder||!fromTarget||!toTarget)continue;
    const base=holder.offsetParent??document.body;const baseRect=base.getBoundingClientRect();holder.style.position='absolute';holder.style.left='0';holder.style.top='0';holder.style.width=baseRect.width+'px';holder.style.height=baseRect.height+'px';
    const a=cmAnchor(fromTarget.getBoundingClientRect(),from.anchor);const b=cmAnchor(toTarget.getBoundingClientRect(),to.anchor);const ax=a[0]-baseRect.left,ay=a[1]-baseRect.top,bx=b[0]-baseRect.left,by=b[1]-baseRect.top;
    const horizontal=svg.dataset.cmConnectorCurve==='horizontal';const c1x=horizontal?(ax+bx)/2:ax;const c1y=horizontal?ay:(ay+by)/2;const c2x=horizontal?(ax+bx)/2:bx;const c2y=horizontal?by:(ay+by)/2;
    svg.setAttribute('viewBox','0 0 '+baseRect.width+' '+baseRect.height);svg.querySelector('[data-cm-connector-path]')?.setAttribute('d','M '+ax+' '+ay+' C '+c1x+' '+c1y+', '+c2x+' '+c2y+', '+bx+' '+by);
  }
};
window.getProductScenes=()=>composition.scenes.map(({id,duration})=>({id,duration}));
window.setProductScene=(sceneId)=>{
  if(!sceneMap.has(sceneId))throw new Error('unknown product scene: '+sceneId);activeScene=sceneId;
  for(const scene of document.querySelectorAll('[data-cm-scene-id]'))scene.style.display=scene.dataset.cmSceneId===sceneId?'block':'none';
};
window.renderScene=(sceneId,progress,frame,frameCount)=>{
  window.setProductScene(sceneId);const scene=sceneMap.get(sceneId);const time=clamp(progress)*scene.duration;const states=new Map();
  for(const motion of scene.motions){
    const existing=states.get(motion.target);if(time<motion.start&&existing)continue;
    const state=existing??{x:0,y:0,scale:1,opacity:1,rotate:0,rotateX:0,rotateY:0,blur:0,clipTop:0,clipRight:0,clipBottom:0,clipLeft:0,originX:50,originY:50};
    const keys=['x','y','scale','opacity','rotate','rotateX','rotateY','blur','clipTop','clipRight','clipBottom','clipLeft','originX','originY'];
    if(time<motion.start){for(const key of keys)if(motion.from[key]!=null)state[key]=motion.from[key];}
    else if(time>=motion.end){for(const key of keys)if(motion.to[key]!=null)state[key]=motion.to[key];}
    else{const value=ease(motion.easing,(time-motion.start)/(motion.end-motion.start));for(const key of keys)if(motion.from[key]!=null||motion.to[key]!=null)state[key]=mix(motion.from[key]??state[key],motion.to[key]??state[key],value);}
    states.set(motion.target,state);
  }
  for(const element of cmRoot().querySelectorAll('[data-motion-id]')){if(!states.has(element.dataset.motionId)){element.style.opacity='';element.style.transform='';element.style.filter='';element.style.clipPath='';}}
  for(const [target,state] of states){const element=cmRoot().querySelector('[data-motion-id="'+target+'"]');if(!element)continue;element.style.opacity=String(state.opacity);element.style.transformOrigin=state.originX+'% '+state.originY+'%';const hasDepth=Math.abs(state.rotateX)>.001||Math.abs(state.rotateY)>.001;element.style.transform=hasDepth?'perspective(1400px) translate3d('+state.x+'px,'+state.y+'px,0) rotateX('+state.rotateX+'deg) rotateY('+state.rotateY+'deg) rotateZ('+state.rotate+'deg) scale('+state.scale+')':'translate('+state.x+'px,'+state.y+'px) rotate('+state.rotate+'deg) scale('+state.scale+')';element.style.filter=state.blur?'blur('+state.blur+'px)':'none';element.style.clipPath='inset('+state.clipTop+'% '+state.clipRight+'% '+state.clipBottom+'% '+state.clipLeft+'%)';}
  for(const action of scene.actions){
    const value=clamp((time-action.start)/(action.end-action.start));
    if(action.type==='typeText'){const holder=cmRoot().querySelector('[data-text-target="'+action.target+'"] > :first-child');if(holder)holder.textContent=action.text.slice(0,Math.floor(action.text.length*value));const caret=cmRoot().querySelector('[data-caret-for="'+action.target+'"]');if(caret)caret.style.opacity=value<1||Math.floor(time*1000/action.caretMs)%2===0?'1':'0';}
    if(action.type==='typeValue'){const input=cmRoot().querySelector('[data-input-target="'+action.target+'"]');if(input)input.value=action.value.slice(0,Math.floor(action.value.length*value));}
    if(action.type==='selectValue'){const select=cmRoot().querySelector('[data-select-target="'+action.target+'"]');if(select){const changed=value>=.5;select.textContent=changed?action.value:select.dataset.selectInitial;select.classList.toggle('text-muted-foreground',!changed&&select.dataset.selectInitialPlaceholder==='true');}}
    if(action.type==='toggleBoolean'){const control=cmRoot().querySelector('[data-boolean-target="'+action.target+'"]');if(control){const checked=value>=.5?action.value:control.dataset.booleanInitial==='true';const state=checked?'checked':'unchecked';control.dataset.state=state;control.setAttribute('aria-checked',String(checked));const indicator=control.querySelector('[data-slot="checkbox-indicator"]');if(indicator)indicator.style.display=checked?'grid':'none';const thumb=control.querySelector('[data-slot="switch-thumb"]');if(thumb)thumb.dataset.state=state;}}
    if(action.type==='updateTable'){const table=cmRoot().querySelector('[data-table-id="'+action.target+'"]');if(!table)continue;const rows=[...table.querySelectorAll('[data-row-index]')];const completed=Math.min(rows.length,Math.floor(value*rows.length+.0001));rows.forEach((row,index)=>{const done=index<completed;row.querySelector('[data-state-initial]')?.style.setProperty('opacity',done?'0':'1');row.querySelector('[data-state-updated]')?.style.setProperty('opacity',done?'1':'0');});const count=table.querySelector('[data-count-for="'+action.target+'"]');if(count)count.textContent=String(Math.floor(value*action.total));}
    if(action.type==='swapState'){const target=cmRoot().querySelector('[data-state-target="'+action.target+'"]');if(!target)continue;const initial=target.querySelector('[data-state-initial]');const updated=target.querySelector('[data-state-updated]');const switched=value>=.5;initial?.style.setProperty('visibility',switched?'hidden':'visible');initial?.style.setProperty('opacity','1');updated?.style.setProperty('visibility',switched?'visible':'hidden');updated?.style.setProperty('opacity','1');}
    if(action.type==='countTo'&&time>=action.start){const target=cmRoot().querySelector('[data-count-target="'+action.target+'"]');const count=Math.round(action.value*value);if(target){target.textContent=String(count);const root=target.closest('[data-count-root]');const progress=root?.querySelector('[data-count-progress]');if(progress)progress.style.width=String(Math.min(100,count/action.value*100))+'%';const status=root?.querySelector('[data-count-status]');if(status)status.textContent=count>=action.value?status.dataset.countCompleteLabel:status.dataset.countLabel;}}
  }
  cmPlaceAttached();cmPlaceFocus();cmPlaceConnectors();
};
window.renderFrame=(progress,frame,frameCount)=>window.renderScene(composition.defaultScene,progress,frame,frameCount);
window.cmAuditLayout=()=>{
  const tolerance=1;const bodyRect=document.body.getBoundingClientRect();const findings=[];const elements=[];const root=cmRoot();const boxes=[...root.querySelectorAll('[data-cm-id]')];
  const visible=(element)=>{const style=getComputedStyle(element);const rect=element.getBoundingClientRect();let opacity=1;for(let current=element;current&&current!==document.documentElement;current=current.parentElement)opacity*=Number(getComputedStyle(current).opacity);return style.display!=='none'&&style.visibility!=='hidden'&&opacity>.01&&rect.width>.5&&rect.height>.5};
  const record=(element)=>{const rect=element.getBoundingClientRect();const style=getComputedStyle(element);const scale=Math.min(rect.width/Math.max(element.offsetWidth,1),rect.height/Math.max(element.offsetHeight,1));return {id:element.dataset.cmId,component:element.dataset.cmComponent||'unknown',rect:{x:rect.x-bodyRect.x,y:rect.y-bodyRect.y,width:rect.width,height:rect.height,right:rect.right-bodyRect.x,bottom:rect.bottom-bodyRect.y},scale:Number.isFinite(scale)?scale:1,padding:{left:parseFloat(style.paddingLeft)||0,right:parseFloat(style.paddingRight)||0,top:parseFloat(style.paddingTop)||0,bottom:parseFloat(style.paddingBottom)||0}}};
  for(const element of boxes){if(!visible(element))continue;const item=record(element);elements.push(item);
    const intentionalCrop=element.closest('[data-cm-allow-clipping="true"]');
    if(!intentionalCrop&&(item.rect.x<-tolerance||item.rect.y<-tolerance||item.rect.right>bodyRect.width+tolerance||item.rect.bottom>bodyRect.height+tolerance))findings.push({code:'out-of-bounds',id:item.id});
    const boxStyle=getComputedStyle(element);const clipsX=['hidden','clip','auto','scroll'].includes(boxStyle.overflowX);const clipsY=['hidden','clip','auto','scroll'].includes(boxStyle.overflowY);
    if(element.dataset.cmAllowClipping!=='true'&&((clipsX&&element.scrollWidth>element.clientWidth+tolerance)||(clipsY&&element.scrollHeight>element.clientHeight+tolerance)))findings.push({code:'content-clipped',id:item.id});
    if(element.dataset.cmCheckPadding==='true'&&(Math.abs(item.padding.left-item.padding.right)>2||Math.abs(item.padding.top-item.padding.bottom)>2))findings.push({code:'asymmetric-padding',id:item.id,padding:item.padding});
    if(element.dataset.cmInsetParent){const parent=cmNode(element.dataset.cmInsetParent);if(!parent)findings.push({code:'unknown-inset-parent',id:item.id});else{const a=element.getBoundingClientRect(),b=parent.getBoundingClientRect(),expected=cmSpace[element.dataset.cmInsetToken]??0,axis=element.dataset.cmInsetAxis??'x';if((axis==='x'||axis==='both')&&(Math.abs((a.left-b.left)-expected)>2||Math.abs((b.right-a.right)-expected)>2))findings.push({code:'inset-drift-x',id:item.id,parent:element.dataset.cmInsetParent,expected});if((axis==='y'||axis==='both')&&(Math.abs((a.top-b.top)-expected)>2||Math.abs((b.bottom-a.bottom)-expected)>2))findings.push({code:'inset-drift-y',id:item.id,parent:element.dataset.cmInsetParent,expected});}}
    if(element.dataset.cmCritical==='true'){const min=Number(element.dataset.cmMinPhonePx||9);const textNodes=[element,...element.querySelectorAll('*')].filter((child)=>visible(child)&&child.textContent?.trim()&&child.children.length===0);for(const textNode of textNodes){const textStyle=getComputedStyle(textNode);const effective=(parseFloat(textStyle.fontSize)||0)*item.scale*360/bodyRect.width;if(effective<min)findings.push({code:'phone-type-too-small',id:item.id,effective:Math.round(effective*10)/10,min});}}
  }
  for(const leaf of root.querySelectorAll('[data-cm-text-leaf]')){if(!visible(leaf)||!leaf.textContent?.trim()||leaf.closest('[data-cm-allow-clipping="true"]'))continue;const range=document.createRange();range.selectNodeContents(leaf);const paint=range.getBoundingClientRect();for(let ancestor=leaf;ancestor&&ancestor!==document.body;ancestor=ancestor.parentElement){const style=getComputedStyle(ancestor);const clipX=['hidden','clip','auto','scroll'].includes(style.overflowX);const clipY=['hidden','clip','auto','scroll'].includes(style.overflowY);if(!clipX&&!clipY)continue;const rect=ancestor.getBoundingClientRect();if((clipX&&(paint.left<rect.left-tolerance||paint.right>rect.right+tolerance))||(clipY&&(paint.top<rect.top-tolerance||paint.bottom>rect.bottom+tolerance))){findings.push({code:'text-paint-clipped',id:leaf.closest('[data-cm-id]')?.dataset.cmId});break;}}}
  const qaBoxes=boxes.filter((element)=>element.dataset.cmQaBox==='true'&&visible(element));
  for(let a=0;a<qaBoxes.length;a++)for(let b=a+1;b<qaBoxes.length;b++){const first=qaBoxes[a],second=qaBoxes[b];if(first.contains(second)||second.contains(first))continue;const allowed=new Set([...(first.dataset.cmAllowOverlap||'').split(','),...(second.dataset.cmAllowOverlap||'').split(',')]);if(allowed.has(first.dataset.cmId)||allowed.has(second.dataset.cmId))continue;const x=first.getBoundingClientRect(),y=second.getBoundingClientRect();const overlap=Math.min(x.right,y.right)-Math.max(x.left,y.left)>tolerance&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>tolerance;if(overlap)findings.push({code:'unexpected-overlap',ids:[first.dataset.cmId,second.dataset.cmId]});}
  const groups=new Map();for(const element of qaBoxes){const group=element.dataset.cmAlignmentGroup;if(!group)continue;const key=group+':'+(element.dataset.cmAlignment||'left');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(element);}for(const [key,members] of groups){if(members.length<2)continue;const axis=key.split(':').at(-1);const rails=members.map((element)=>{const rect=element.getBoundingClientRect();return axis==='right'?rect.right:axis==='center'?rect.left+rect.width/2:rect.left});if(Math.max(...rails)-Math.min(...rails)>2)findings.push({code:'alignment-drift',group:key,ids:members.map((element)=>element.dataset.cmId)});}
  const controlGroups=new Map();for(const element of root.querySelectorAll('[data-cm-control-presentation]')){if(!visible(element))continue;const key=element.dataset.cmControlPresentation;if(!controlGroups.has(key))controlGroups.set(key,[]);controlGroups.get(key).push(element);}const controlMetrics=(element)=>{const style=getComputedStyle(element),rect=element.getBoundingClientRect();return {height:rect.height,fontSize:parseFloat(style.fontSize)||0,lineHeight:parseFloat(style.lineHeight)||0,paddingLeft:parseFloat(style.paddingLeft)||0,paddingRight:parseFloat(style.paddingRight)||0};};for(const [presentation,members] of controlGroups){if(members.length<2)continue;const reference=controlMetrics(members[0]);for(const element of members.slice(1)){const metrics=controlMetrics(element),shared=['fontSize','lineHeight','paddingLeft','paddingRight'];const drift=shared.filter((key)=>Math.abs(metrics[key]-reference[key])>1);if(drift.length)findings.push({code:'control-metric-drift',presentation,id:element.dataset.cmControlId,reference:members[0].dataset.cmControlId,metrics:drift});}const single=members.filter((element)=>element.dataset.cmControlKind==='single-line');if(single.length>1){const height=controlMetrics(single[0]).height;for(const element of single.slice(1))if(Math.abs(controlMetrics(element).height-height)>1)findings.push({code:'control-height-drift',presentation,id:element.dataset.cmControlId,reference:single[0].dataset.cmControlId});}}
  for(const element of root.querySelectorAll('[data-cm-spacing-recipe]')){if(!visible(element))continue;const recipe=element.dataset.cmSpacingRecipe,component=element.dataset.cmComponent,expected={product:{field:8,grid:16,inline:12,stack:16},'social-form':{field:8,grid:24,inline:16,stack:24},'social-hero-form':{field:8,grid:24,inline:16,stack:24}}[recipe]?.[component];if(expected==null)continue;const actual=parseFloat(getComputedStyle(element).gap)||0;if(Math.abs(actual-expected)>1)findings.push({code:'spacing-recipe-drift',id:element.dataset.cmId,recipe,component,expected,actual});}
  for(const marker of root.querySelectorAll('[data-cm-focus-target]')){if(!visible(marker))continue;const holder=marker.closest('[data-cm-id]');const target=cmNode(marker.dataset.cmFocusTarget);if(!holder||!target){findings.push({code:'unknown-focus-target',id:holder?.dataset.cmId});continue;}const focus=holder.getBoundingClientRect(),rect=target.getBoundingClientRect();if(focus.left>rect.left+tolerance||focus.top>rect.top+tolerance||focus.right<rect.right-tolerance||focus.bottom<rect.bottom-tolerance)findings.push({code:'focus-misses-target',id:holder.dataset.cmId,target:marker.dataset.cmFocusTarget});}
  return {ok:findings.length===0,findings,elements,scene:activeScene,canvas:{width:bodyRect.width,height:bodyRect.height}};
};
window.renderFrame(0,0,${Math.round(composition.meta.duration * composition.meta.fps)});`;

const normalizedScenes = (
  composition: Composition,
): Array<
  | CompositionScene
  | { id: string; name: string; category: "story"; nodes: CompositionNode[] }
> =>
  composition.scenes ?? [
    {
      id: "default",
      name: composition.meta.title,
      category: "story",
      nodes: composition.nodes ?? [],
    },
  ];

export const buildCompositionHtml = async (
  input: unknown,
  roots: AssetRoots,
) => {
  const composition = compositionSchema.parse(input);
  const assets = loadAssets(composition, roots);
  const css = await compileProductCss();
  const scenes = normalizedScenes(composition);
  const defaultScene = composition.defaultScene ?? scenes[0].id;
  const markup = renderToStaticMarkup(
    <>
      {scenes.map((scene) => (
        <div
          data-cm-scene-category={scene.category}
          data-cm-scene-id={scene.id}
          key={scene.id}
          style={{
            display: scene.id === defaultScene ? "block" : "none",
            inset: 0,
            position: "absolute",
          }}
        >
          {scene.nodes.map((item) => (
            <React.Fragment key={item.id}>
              {renderNode(item, assets)}
            </React.Fragment>
          ))}
        </div>
      ))}
    </>,
  );
  const meta = JSON.stringify({
    width: composition.meta.width,
    height: composition.meta.height,
    duration: composition.meta.duration,
    fps: composition.meta.fps,
    scenes: scenes.map((scene) => scene.id),
    defaultScene,
  });
  const productMeta = JSON.stringify({
    productRef: composition.meta.productRef,
    componentSource: "customermates-product",
    schemaVersion: 3,
    layoutSystem: "tokenized-compound-scenes",
  });
  return `<!doctype html><html class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=${composition.meta.width},initial-scale=1"><title>${htmlEscape(composition.meta.title)}</title><style>${css}\n*{box-sizing:border-box}html,body{width:${composition.meta.width}px;height:${composition.meta.height}px;margin:0;overflow:hidden}body{position:relative;font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-feature-settings:"cv11","ss01","ss03"}body>div[data-cm-scene-id]{transform-origin:center}</style></head><body class="bg-background text-foreground"><script type="application/json" id="cm-video-meta">${meta}</script><script type="application/json" id="cm-product-meta">${productMeta}</script>${markup}<script>${runtime(composition, defaultScene)}</script></body></html>`;
};

export const verifyProductAuthority = (repo: string, expectedRef: string) => {
  const actual = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repo,
    encoding: "utf8",
  }).trim();
  if (actual !== expectedRef)
    throw new Error(
      `product ref mismatch: expected ${expectedRef}, got ${actual}`,
    );
  const status = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    {
      cwd: repo,
      encoding: "utf8",
    },
  ).trim();
  if (status)
    throw new Error("product worktree must be clean before composition build");
  return actual;
};
