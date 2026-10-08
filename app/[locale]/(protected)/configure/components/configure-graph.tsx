"use client";

import "@xyflow/react/dist/style.css";

import type { Edge, EdgeProps, Node, NodeProps } from "@xyflow/react";
import type { RecordField, RecordModelView, RecordRelationship } from "@/features/records/record-model.schema";
import type { MessagingProvider } from "@/generated/prisma";
import type {
  ConfigureGraphCatalog,
  ConfigureGraphEdge,
  ConfigureGraphList,
  ConfigureGraphSource,
} from "./configure-graph-model";
import type { ConfigureGraphPosition, ConfigureGraphRoute } from "./configure-graph-layout";
import type { ConfigureGraphLayout } from "@/features/p13n/p13n-settings.schema";

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  ConnectionMode,
  EdgeLabelRenderer,
  Handle,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useInternalNode,
  useReactFlow,
} from "@xyflow/react";
import { Cable, Link2, Maximize, Plus, RotateCcw, Sigma, ZoomIn, ZoomOut } from "lucide-react";

import { AppChip } from "@/components/chip/app-chip";
import { ClickableChip } from "@/components/chip/clickable-chip";
import { AppLink } from "@/components/shared/app-link";
import { recordTypeIcon } from "@/components/records/record-type-icon";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { cn } from "@/core/utils/cn";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { upsertP13nAction } from "@/app/actions";
import { CONFIGURE_GRAPH_P13N_ID } from "@/features/p13n/p13n-settings.schema";

import {
  accountStatusChipColor,
  getProviderDisplayLabel,
} from "@/app/[locale]/(protected)/settings/(account)/components/account-status-color";
import {
  configureEdgeGeometry,
  configureGraphLayout,
  configureGraphPlacement,
  configureGraphViewport,
  GRAPH_VISIBLE_ACCOUNTS,
  GRAPH_VISIBLE_FIELDS,
} from "./configure-graph-layout";
import { ACCOUNTS_NODE_ID, configureGraphData } from "./configure-graph-model";
import { settingsHref } from "@/app/components/navigation/settings-routes";
import { recordFieldTypeKey } from "@/features/records/record-input-value";
import { isResolvedField } from "./configure-model";

export type ConfigureGraphAccounts =
  | { state: "available"; accounts: ConfigureGraphSource[] }
  | { state: "locked" }
  | { state: "unavailable" };

type Props = {
  model: RecordModelView;
  catalog: ConfigureGraphCatalog;
  accounts: ConfigureGraphAccounts;
  focusedListId?: string | null;
  layout: ConfigureGraphLayout["positions"] | null;
  onLayoutChange: (layout: ConfigureGraphLayout["positions"] | null) => void;
  canManage: boolean;
  disabled: boolean;
  onSelectList: (typeId: string) => void;
  onEditField: (typeId: string, field: RecordField) => void;
  onAddField: (typeId: string) => void;
  onEditChannels: (typeId: string) => void;
  onEditRelationship: (relation: RecordRelationship) => void;
  onConnect: (sourceTypeId: string, targetTypeId: string) => void;
};

type GraphActions = Pick<
  Props,
  "canManage" | "disabled" | "onSelectList" | "onEditField" | "onAddField" | "onEditChannels" | "onEditRelationship"
> & { labelOf: (typeId: string) => string; listOf: (items: string[]) => string };

const GraphActionsContext = createContext<GraphActions | null>(null);

function useGraphActions() {
  const actions = useContext(GraphActionsContext);
  if (!actions) throw new Error("Graph actions are only available inside the configure graph");
  return actions;
}

type GraphSide = "top" | "right" | "bottom" | "left";

const POSITION: Record<GraphSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

const SIDES: GraphSide[] = ["top", "right", "bottom", "left"];

function NodeHandles({ connectable }: { connectable: boolean }) {
  return SIDES.map((side) => (
    <Handle
      key={side}
      className={cn(
        "!size-2.5 !border-2 !border-background !bg-muted-foreground/40",
        connectable ? "hover:!bg-primary" : "!pointer-events-none !opacity-0",
      )}
      id={side}
      isConnectable={connectable}
      position={POSITION[side]}
      type="source"
    />
  ));
}

const CONNECTED_ACCOUNTS_HREF = settingsHref("channels");

type ListNode = Node<{ list: ConfigureGraphList }, "list">;
type AccountsNode = Node<{ accounts: ConfigureGraphSource[] }, "accounts">;
type PromptNode = Node<{ state: "available" | "locked" }, "prompt">;

function ListNodeView({ data: { list } }: NodeProps<ListNode>) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { canManage, disabled, labelOf, listOf, onSelectList, onEditField, onAddField, onEditChannels } =
    useGraphActions();
  const Icon = recordTypeIcon(list.type.icon);
  const visible = list.fields.slice(0, GRAPH_VISIBLE_FIELDS);
  const hidden = list.fields.length - visible.length;
  return (
    <div
      className="w-[22rem] rounded-xl border border-border bg-card text-card-foreground shadow-sm"
      data-configure-node={list.type.id}
      data-focus-target={`list:${list.type.id}`}
    >
      <NodeHandles connectable={canManage && !disabled} />

      <button
        aria-label={list.type.pluralLabel}
        className="flex w-full items-center gap-2.5 rounded-t-xl px-3.5 pt-3 pb-2.5 text-left outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none"
        disabled={disabled}
        type="button"
        onClick={() => onSelectList(list.type.id)}
      >
        <Icon aria-hidden className="size-4 shrink-0" />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold">{list.type.pluralLabel}</span>

          {list.parentId && (
            <span className="block truncate text-sm text-muted-foreground">
              {t("RecordModel.graph.partOf", { list: labelOf(list.parentId) })}
            </span>
          )}
        </span>

        {!list.type.navigationVisible && !list.type.embedded && (
          <AppChip className="shrink-0" variant="secondary">
            {t("RecordModel.hiddenList")}
          </AppChip>
        )}
      </button>

      {list.recordCount !== undefined && (
        <div className="border-y border-border px-3.5 py-2 text-sm text-muted-foreground" data-configure-node-count="">
          {list.recordCount === null ? (
            t("RecordModel.graph.recordsRestricted")
          ) : (
            <span className="flex items-baseline gap-1">
              <span className="text-base font-semibold text-foreground tabular-nums">
                {intlStore.formatNumber(list.recordCount)}
              </span>

              <span>{t("RecordModel.graph.recordUnit", { count: list.recordCount })}</span>
            </span>
          )}
        </div>
      )}

      <ul aria-label={t("RecordModel.fields")} className="py-1">
        {visible.map(({ field, calculated, sources }) => {
          const detail =
            calculated && sources.length ? t("RecordModel.graph.calculatedFrom", { sources: listOf(sources) }) : null;
          return (
            <li key={field.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="nodrag flex h-9 w-full items-center gap-2 px-3.5 text-left text-sm outline-none hover:bg-accent/50 focus-visible:bg-accent/60 disabled:pointer-events-none"
                    data-configure-graph-field={field.id}
                    disabled={disabled || !canManage}
                    type="button"
                    onClick={() => isResolvedField(field) && onEditField(list.type.id, field)}
                  >
                    {calculated ? (
                      <Sigma aria-hidden className="size-3.5 shrink-0 text-primary" />
                    ) : (
                      <span aria-hidden className="size-3.5 shrink-0" />
                    )}

                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{field.label}</span>

                      {detail && <span className="text-muted-foreground">{` ${detail}`}</span>}
                    </span>

                    <span className="shrink-0 text-muted-foreground">
                      {t(`RecordModel.types.${recordFieldTypeKey(field)}`)}
                    </span>
                  </button>
                </TooltipTrigger>

                <TooltipContent className="max-w-xs">
                  <p className="font-medium">{field.label}</p>

                  <p>{detail ?? t(`RecordModel.types.${recordFieldTypeKey(field)}`)}</p>
                </TooltipContent>
              </Tooltip>
            </li>
          );
        })}

        {list.channels && (
          <li>
            <button
              className="nodrag flex h-9 w-full items-center gap-2 px-3.5 text-left text-sm outline-none hover:bg-accent/50 focus-visible:bg-accent/60 disabled:pointer-events-none"
              data-configure-graph-channels={list.type.id}
              disabled={disabled || !canManage}
              type="button"
              onClick={() => onEditChannels(list.type.id)}
            >
              <span aria-hidden className="size-3.5 shrink-0" />

              <span className="min-w-0 flex-1 truncate font-medium">{t("EntityChannels.heading")}</span>

              <span className="shrink-0 text-muted-foreground">{t("RecordModel.channelsField.short")}</span>
            </button>
          </li>
        )}

        {hidden > 0 && (
          <li>
            <button
              className="nodrag flex h-9 w-full items-center px-3.5 ps-[2.375rem] text-left text-sm text-muted-foreground outline-none hover:bg-accent/50 hover:text-foreground focus-visible:bg-accent/60 disabled:pointer-events-none"
              disabled={disabled}
              type="button"
              onClick={() => onSelectList(list.type.id)}
            >
              {t("RecordModel.graph.moreFields", { count: hidden })}
            </button>
          </li>
        )}

        {canManage && (
          <li>
            <button
              aria-label={t("RecordModel.graph.addFieldTo", { list: list.type.pluralLabel })}
              className="nodrag flex h-9 w-full items-center gap-2 px-3.5 text-left text-sm text-primary outline-none hover:bg-accent/50 focus-visible:bg-accent/60 disabled:pointer-events-none disabled:opacity-60"
              disabled={disabled}
              type="button"
              onClick={() => onAddField(list.type.id)}
            >
              <Plus aria-hidden className="size-3.5" />

              {t("RecordModel.addField")}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

function AccountsNodeView({ data: { accounts } }: NodeProps<AccountsNode>) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const visible = accounts.slice(0, GRAPH_VISIBLE_ACCOUNTS);
  const hidden = accounts.length - visible.length;
  return (
    <div
      className="w-[22rem] rounded-xl border border-border bg-card text-card-foreground shadow-sm"
      data-configure-source="accounts"
    >
      <NodeHandles connectable={false} />

      <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2.5">
        <Cable aria-hidden className="size-4 shrink-0" />

        <span className="min-w-0 flex-1 truncate text-base font-semibold">{t("RecordModel.graph.accounts")}</span>

        <AppLink className="nodrag shrink-0 text-sm" href={CONNECTED_ACCOUNTS_HREF}>
          {t("RecordModel.graph.manage")}
        </AppLink>
      </div>

      <ul aria-label={t("RecordModel.graph.accounts")} className="border-t border-border py-1">
        {visible.map((account) => {
          const Icon = getProviderIcon(account.provider as MessagingProvider);
          const label = getProviderDisplayLabel({ ...account, provider: account.provider as MessagingProvider }, t);
          return (
            <li key={account.id} className="flex h-12 items-center gap-2.5 px-3.5" data-configure-account={account.id}>
              <Icon aria-hidden className="size-4 shrink-0" />

              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-medium">{label}</span>

                {account.address && (
                  <span className="block truncate text-xs text-muted-foreground">{account.address}</span>
                )}
              </span>

              <AppChip className="shrink-0" variant={accountStatusChipColor(account.status)}>
                {t(`ConnectedAccountsCard.statusLabels.${account.status}`)}
              </AppChip>
            </li>
          );
        })}

        {hidden > 0 && (
          <li>
            <AppLink
              appearance="unstyled"
              className="nodrag flex h-12 w-full items-center px-3.5 ps-[2.625rem] text-sm text-muted-foreground outline-none hover:bg-accent/50 hover:text-foreground focus-visible:bg-accent/60"
              href={CONNECTED_ACCOUNTS_HREF}
            >
              {t("RecordModel.graph.moreAccounts", { count: hidden })}
            </AppLink>
          </li>
        )}
      </ul>

      <div className="flex items-baseline gap-1 border-t border-border px-3.5 py-2 text-sm text-muted-foreground">
        <span className="text-base font-semibold text-foreground tabular-nums">
          {intlStore.formatNumber(accounts.length)}
        </span>

        <span>{t("RecordModel.graph.accountUnit", { count: accounts.length })}</span>
      </div>
    </div>
  );
}

function PromptNodeView({ data: { state } }: NodeProps<PromptNode>) {
  const t = useTranslations();
  return (
    <div
      className="w-[22rem] rounded-xl border border-dashed border-border bg-card/80 text-card-foreground"
      data-configure-source="connect"
    >
      <NodeHandles connectable={false} />

      <div className="flex items-center gap-2.5 px-3.5 pt-3">
        <Cable aria-hidden className="size-4 shrink-0 text-muted-foreground" />

        <span className="min-w-0 flex-1 text-base font-semibold">{t("RecordModel.graph.connectTitle")}</span>
      </div>

      <p className="px-3.5 pt-1.5 text-sm text-muted-foreground">{t("RecordModel.graph.connectDescription")}</p>

      <div className="px-3.5 pt-2 pb-3">
        <Button asChild className="nodrag" size="xs" variant="secondary">
          <AppLink appearance="unstyled" href={state === "locked" ? settingsHref("billing") : CONNECTED_ACCOUNTS_HREF}>
            {state === "locked" ? t("MessagingUpsell.cta") : t("ConnectedAccountsCard.connectAccount")}
          </AppLink>
        </Button>
      </div>
    </div>
  );
}

type GraphEdgeData = {
  edge: ConfigureGraphEdge;
  route: ConfigureGraphRoute;
  anchors: { source: ConfigureGraphPosition; target: ConfigureGraphPosition };
  lane: number;
};
type GraphEdge = Edge<GraphEdgeData, "graph">;

function useNodeBox(id: string, fallback: ConfigureGraphPosition | undefined): ConfigureGraphPosition | undefined {
  const node = useInternalNode(id);
  if (!node || !fallback) return fallback;
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured.width ?? fallback.width,
    height: node.measured.height ?? fallback.height,
  };
}

function GraphEdgeView({ data, source, target }: EdgeProps<GraphEdge>) {
  const t = useTranslations();
  const { canManage, disabled, labelOf, listOf, onEditRelationship } = useGraphActions();
  const descriptionId = useId();
  const sourceBox = useNodeBox(source, data?.anchors.source);
  const targetBox = useNodeBox(target, data?.anchors.target);
  if (!data || !sourceBox || !targetBox) return null;
  const { edge, route, anchors, lane } = data;
  const { path, label: labelPoint } = configureEdgeGeometry(route, anchors, sourceBox, targetBox, lane);
  const chipPosition = { transform: `translate(-50%, -50%) translate(${labelPoint.x}px, ${labelPoint.y}px)` };
  if (edge.kind === "relationship") {
    const { relation } = edge;
    const cardinality = t(`RecordModel.cardinality.${edge.cardinality}`);
    const calculated = edge.calculatedFields.length
      ? t("RecordModel.graph.calculationEdge", { fields: listOf(edge.calculatedFields) })
      : null;
    const label = t("RecordModel.graph.relationshipLabel", {
      label: relation.sourceLabel,
      source: labelOf(relation.sourceTypeId),
      target: labelOf(relation.targetTypeId),
      cardinality,
    });
    const chip = {
      "aria-describedby": calculated ? descriptionId : undefined,
      "aria-label": label,
      "data-configure-relationship": relation.id,
      size: "md" as const,
      startContent: calculated ? <Sigma aria-hidden /> : undefined,
      tooltip: (
        <>
          <p>{label}</p>

          {calculated && <p>{calculated}</p>}
        </>
      ),
      variant: "secondary" as const,
    };
    return (
      <>
        <BaseEdge
          className={edge.parent ? "!stroke-primary/60" : "!stroke-muted-foreground/45"}
          path={path}
          style={{ strokeWidth: edge.parent ? 2 : 1.5 }}
        />

        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute z-[4] rounded-md bg-background"
            style={chipPosition}
          >
            {canManage && !disabled ? (
              <ClickableChip {...chip} onClick={() => onEditRelationship(relation)}>
                {cardinality}
              </ClickableChip>
            ) : (
              <AppChip {...chip}>{cardinality}</AppChip>
            )}
          </div>

          {calculated && (
            <span className="sr-only" id={descriptionId}>
              {calculated}
            </span>
          )}
        </EdgeLabelRenderer>
      </>
    );
  }
  const calculation = edge.kind === "calculation";
  const title = calculation
    ? t("RecordModel.graph.calculationEdge", { fields: listOf(edge.fields) })
    : t("RecordModel.graph.accountEdge", { list: labelOf(edge.target) });
  return (
    <>
      <BaseEdge
        className={cn(calculation ? "!stroke-primary/70" : "!stroke-muted-foreground/45", "[stroke-dasharray:5_5]")}
        path={path}
        style={{ strokeWidth: 1.5 }}
      />

      <EdgeLabelRenderer>
        <div className="pointer-events-auto absolute z-[4] rounded-md bg-background" style={chipPosition}>
          <AppChip
            aria-label={title}
            data-configure-graph-edge={edge.kind}
            role="img"
            size="md"
            tooltip={title}
            variant={calculation ? "default" : "secondary"}
          >
            {calculation ? <Sigma aria-hidden className="size-3.5" /> : <Link2 aria-hidden className="size-3.5" />}
          </AppChip>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const FIT_VIEW = { padding: 0.08, maxZoom: 1 };

const COARSE_POINTER = "(pointer: coarse)";

function subscribeCoarsePointer(onChange: () => void) {
  const query = window.matchMedia(COARSE_POINTER);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useCoarsePointer() {
  return useSyncExternalStore(
    subscribeCoarsePointer,
    () => window.matchMedia(COARSE_POINTER).matches,
    () => false,
  );
}

async function saveGraphLayout(layout: ConfigureGraphLayout | null) {
  const result = await upsertP13nAction({ p13nId: CONFIGURE_GRAPH_P13N_ID, settings: layout });
  if (!result.ok) toastZodErrorTree(result.error);
}

function edgeLanes(edges: readonly { id: string; source: string; target: string }[]) {
  const groups = new Map<string, string[]>();
  for (const edge of edges) {
    const key = [edge.source, edge.target].sort().join(" ");
    groups.set(key, [...(groups.get(key) ?? []), edge.id]);
  }
  const lanes = new Map<string, number>();
  const reversed = new Set(edges.filter((edge) => edge.source > edge.target).map((edge) => edge.id));
  for (const ids of groups.values()) {
    ids.forEach((id, index) => {
      const lane = index - (ids.length - 1) / 2;
      lanes.set(id, reversed.has(id) ? -lane : lane);
    });
  }
  return lanes;
}

const nodeTypes = { list: ListNodeView, accounts: AccountsNodeView, prompt: PromptNodeView };
const edgeTypes = { graph: GraphEdgeView };

function ConfigureGraphCanvas({
  model,
  catalog,
  accounts,
  focusedListId,
  layout: saved,
  onLayoutChange,
  canManage,
  disabled,
  onSelectList,
  onEditField,
  onAddField,
  onEditChannels,
  onEditRelationship,
  onConnect,
}: Props) {
  const t = useTranslations();
  const { resolvedTheme } = useTheme();
  const locale = useLocale();
  const connectPrompt = accounts.state !== "unavailable";
  const coarsePointer = useCoarsePointer();
  const help = canManage ? t("RecordModel.graph.help") : t("RecordModel.graph.helpReadOnly");
  const container = useRef<HTMLDivElement>(null);
  const [direction, setDirection] = useState<"TB" | "LR" | null>(null);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width && height) setDirection(width > height * 1.25 ? "LR" : "TB");
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const placed = useRef<"TB" | "LR" | null>(null);
  const flow = useReactFlow<Node, GraphEdge>();
  const [ready, setReady] = useState(false);
  const [measured, setMeasured] = useState<ReadonlyMap<string, { width: number; height: number }>>(new Map());
  const { nodes, edges, positions } = useMemo(() => {
    const sources = accounts.state === "available" ? accounts.accounts : [];
    const data = configureGraphData(model, catalog, sources, connectPrompt);
    const layout = configureGraphLayout(data, canManage, connectPrompt, measured, direction ?? "TB");
    const placement = configureGraphPlacement(layout.positions, saved);
    const at = (id: string) => {
      const position = placement.get(id);
      return { x: position?.x ?? 0, y: position?.y ?? 0 };
    };
    const nodes: Node[] = [
      ...data.lists.map((list) => ({ id: list.type.id, type: "list", position: at(list.type.id), data: { list } })),
      ...(data.sources.length
        ? [{ id: ACCOUNTS_NODE_ID, type: "accounts", position: at(ACCOUNTS_NODE_ID), data: { accounts: data.sources } }]
        : connectPrompt
          ? [{ id: ACCOUNTS_NODE_ID, type: "prompt", position: at(ACCOUNTS_NODE_ID), data: { state: accounts.state } }]
          : []),
    ];
    const routed = data.edges.flatMap((edge) => {
      const route = layout.routes.get(edge.id);
      const [source, target] =
        edge.kind === "relationship"
          ? [edge.relation.sourceTypeId, edge.relation.targetTypeId]
          : [edge.source, edge.target];
      const anchors = { source: layout.positions.get(source), target: layout.positions.get(target) };
      if (!route || !anchors.source || !anchors.target) return [];
      return [
        { id: edge.id, source, target, edge, route, anchors: { source: anchors.source, target: anchors.target } },
      ];
    });
    const lanes = edgeLanes(routed);
    const edges: GraphEdge[] = routed.map(({ id, source, target, edge, route, anchors }) => ({
      id,
      type: "graph",
      source,
      target,
      sourceHandle: "bottom",
      targetHandle: "top",
      data: { edge, route, anchors, lane: lanes.get(id) ?? 0 },
    }));
    return { nodes, edges, positions: placement };
  }, [model, catalog, accounts, connectPrompt, canManage, measured, direction, saved]);
  const [flowNodes, setFlowNodes] = useState<Node[]>(nodes);
  useEffect(
    () =>
      setFlowNodes((current) =>
        nodes.map((node) => ({ ...node, measured: current.find((previous) => previous.id === node.id)?.measured })),
      ),
    [nodes],
  );
  useEffect(() => {
    if (!ready || !flowNodes.length || flowNodes.some((node) => !node.measured?.width || !node.measured.height)) return;
    const sizes = new Map(
      flowNodes.map(
        (node) =>
          [
            node.id,
            { width: Math.ceil(node.measured?.width ?? 0), height: Math.ceil(node.measured?.height ?? 0) },
          ] as const,
      ),
    );
    const changed = [...sizes].some(([id, size]) => {
      const previous = measured.get(id);
      return !previous || previous.width !== size.width || previous.height !== size.height;
    });
    if (changed) {
      setMeasured(sizes);
      return;
    }
    const element = container.current;
    if (!direction || placed.current === direction || !element) return;
    placed.current = direction;
    void flow
      .setViewport(configureGraphViewport(positions, element.clientWidth, element.clientHeight))
      .catch(reportApplicationError);
  }, [ready, flow, measured, flowNodes, positions, direction]);
  useEffect(() => {
    if (!ready || !focusedListId || !placed.current) return;
    void flow
      .fitView({
        nodes: [{ id: focusedListId }],
        padding: 0.4,
        maxZoom: 1,
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300,
      })
      .catch(reportApplicationError);
  }, [ready, flow, focusedListId, measured]);
  const listIds = useMemo(() => new Set(model.types.map((type) => type.id)), [model.types]);
  const keepLayout = () =>
    runUserAction(async () => {
      const positions = Object.fromEntries(
        Object.entries(saved ?? {}).filter(([id]) => listIds.has(id) || id === ACCOUNTS_NODE_ID),
      );
      for (const node of flow.getNodes())
        positions[node.id] = { x: Math.round(node.position.x), y: Math.round(node.position.y) };
      onLayoutChange(positions);
      await saveGraphLayout({ positions });
    });
  const resetLayout = async () => {
    placed.current = null;
    onLayoutChange(null);
    await saveGraphLayout(null);
  };
  const actions = useMemo<GraphActions>(
    () => ({
      canManage,
      disabled,
      labelOf: (typeId) => model.types.find((type) => type.id === typeId)?.pluralLabel ?? "",
      listOf: (items) => new Intl.ListFormat(locale, { style: "short", type: "unit" }).format(items),
      onSelectList,
      onEditField,
      onAddField,
      onEditChannels,
      onEditRelationship,
    }),
    [
      canManage,
      disabled,
      locale,
      model.types,
      onSelectList,
      onEditField,
      onAddField,
      onEditChannels,
      onEditRelationship,
    ],
  );
  return (
    <GraphActionsContext.Provider value={actions}>
      <div
        ref={container}
        aria-label={t("RecordModel.graph.label")}
        className="relative min-h-0 flex-1"
        data-configure-graph=""
        role="group"
      >
        <ReactFlow
          panOnScroll
          ariaLabelConfig={{
            "node.a11yDescription.default": help,
            "node.a11yDescription.keyboardDisabled": help,
            "edge.a11yDescription.default": help,
            "handle.ariaLabel": t("RecordModel.graph.handle"),
          }}
          colorMode={resolvedTheme === "dark" ? "dark" : "light"}
          connectionMode={ConnectionMode.Loose}
          edgeTypes={edgeTypes}
          edges={edges}
          edgesFocusable={false}
          isValidConnection={(connection) =>
            listIds.has(connection.source) && listIds.has(connection.target) && connection.source !== connection.target
          }
          maxZoom={1.5}
          minZoom={0.2}
          nodeTypes={nodeTypes}
          nodes={flowNodes}
          nodesConnectable={canManage && !disabled}
          nodesDraggable={!disabled && !coarsePointer}
          nodesFocusable={false}
          proOptions={{ hideAttribution: true }}
          zoomOnScroll={false}
          onConnectEnd={(event, connection) => {
            const source = connection.fromNode?.id;
            if (!source || !listIds.has(source)) return;
            const point = "changedTouches" in event ? event.changedTouches[0] : event;
            const target =
              (connection.isValid ? connection.toNode?.id : undefined) ??
              (point &&
                document
                  .elementsFromPoint(point.clientX, point.clientY)
                  .map((element) => element.closest("[data-configure-node]")?.getAttribute("data-configure-node"))
                  .find(Boolean));
            if (target && target !== source && listIds.has(target)) onConnect(source, target);
          }}
          onInit={() => setReady(true)}
          onNodeDragStop={keepLayout}
          onNodesChange={(changes) => setFlowNodes((current) => applyNodeChanges(changes, current))}
        >
          <Background
            className="!bg-background"
            color="var(--border)"
            gap={18}
            size={1.5}
            variant={BackgroundVariant.Dots}
          />

          <Panel
            aria-label={t("RecordModel.graph.controls")}
            className="!m-3 flex flex-col gap-1"
            position="bottom-left"
            role="group"
          >
            {[
              { label: t("RecordModel.graph.zoomIn"), icon: ZoomIn, run: () => flow.zoomIn(), off: false },
              { label: t("RecordModel.graph.zoomOut"), icon: ZoomOut, run: () => flow.zoomOut(), off: false },
              { label: t("RecordModel.graph.fitView"), icon: Maximize, run: () => flow.fitView(FIT_VIEW), off: false },
              { label: t("RecordModel.graph.resetLayout"), icon: RotateCcw, run: resetLayout, off: !saved || disabled },
            ].map(({ label, icon: Icon, run, off }) => (
              <Tooltip key={label}>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={label}
                    disabled={off}
                    size="icon-sm"
                    variant="secondary"
                    onClick={() => runUserAction(run)}
                  >
                    <Icon aria-hidden />
                  </Button>
                </TooltipTrigger>

                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            ))}
          </Panel>
        </ReactFlow>
      </div>
    </GraphActionsContext.Provider>
  );
}

export function ConfigureGraph(props: Props) {
  return (
    <ReactFlowProvider>
      <ConfigureGraphCanvas {...props} />
    </ReactFlowProvider>
  );
}
