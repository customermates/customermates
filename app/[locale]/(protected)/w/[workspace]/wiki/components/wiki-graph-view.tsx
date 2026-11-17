"use client";

import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { WikiGraph } from "@/features/wiki/wiki-graph.schema";
import type { WikiPageKind } from "@/features/wiki/wiki.schema";
import type { WikiGraphPlace, WikiGraphPositions } from "./use-wiki-graph-positions";
import type { WikiGraphTransform } from "./wiki-graph-model";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Maximize } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";

import { WikiGraphCanvas } from "./wiki-graph-canvas";
import {
  WIKI_GRAPH_DRAG_THRESHOLD,
  WIKI_GRAPH_KIND_DOT,
  wikiGraphFitTransform,
  wikiGraphNeighbours,
  wikiGraphToUnit,
  wikiGraphVisibleIds,
  wikiGraphZoomAt,
} from "./wiki-graph-model";

type Props = {
  graph: WikiGraph;
  positions: WikiGraphPositions;
  query: string;
  found: ReadonlySet<string>;
  selectedId: string | null;
  canPin: boolean;
  onSelect: (id: string) => void;
};

type Gesture =
  | { kind: "pan"; pointerId: number; startX: number; startY: number; origin: WikiGraphTransform }
  | {
      kind: "node";
      pointerId: number;
      id: string;
      startX: number;
      startY: number;
      moved: boolean;
      origin: WikiGraphPlace;
    };

const WHEEL_LINE_PIXELS = 16;
const WHEEL_PAGE_PIXELS = 100;
const FILTER_KINDS = ["procedure", "knowledge"] as const satisfies readonly WikiPageKind[];
const FILTER_ALL = "all";

function wheelPixels(event: WheelEvent): number {
  if (event.deltaMode === 1) return event.deltaY * WHEEL_LINE_PIXELS;
  if (event.deltaMode === 2) return event.deltaY * WHEEL_PAGE_PIXELS;
  return event.deltaY;
}

export function WikiGraphView({ graph, positions, query, found, selectedId, canPin, onSelect }: Props) {
  const t = useTranslations();
  const container = useRef<HTMLDivElement | null>(null);
  const svg = useRef<SVGSVGElement | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const interacted = useRef(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [transform, setTransform] = useState<WikiGraphTransform>({ k: 1, x: 0, y: 0 });
  const [kind, setKind] = useState<WikiPageKind | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const { nodes } = positions;
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node] as const)), [nodes]);
  const neighbours = useMemo(() => wikiGraphNeighbours(graph), [graph]);
  const visible = useMemo(
    () => wikiGraphVisibleIds(graph.nodes, { query, kind, found }),
    [found, graph.nodes, kind, query],
  );
  const focusId = hoverId ?? selectedId;
  const focus = useMemo(() => {
    if (!focusId) return null;
    return new Set([focusId, ...(neighbours.get(focusId) ?? [])]);
  }, [focusId, neighbours]);
  const kindLabels: Record<WikiPageKind, string> = {
    guide: t("Wiki.kind.guide"),
    procedure: t("Wiki.kind.procedure"),
    knowledge: t("Wiki.kind.knowledge"),
  };
  const filterLabels: Record<(typeof FILTER_KINDS)[number], string> = {
    procedure: t("Wiki.graph.filter.procedure"),
    knowledge: t("Wiki.graph.filter.knowledge"),
  };
  const kindCounts = useMemo(() => {
    const counts: Record<WikiPageKind, number> = { guide: 0, procedure: 0, knowledge: 0 };
    for (const node of graph.nodes) counts[node.kind] += 1;
    return counts;
  }, [graph.nodes]);

  const fit = useCallback(() => {
    interacted.current = false;
    setTransform(wikiGraphFitTransform(graph.nodes, viewport));
  }, [graph.nodes, viewport]);

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      const size = { width: Math.round(rect.width), height: Math.round(rect.height) };
      setViewport((current) => (current.width === size.width && current.height === size.height ? current : size));
      if (!interacted.current && size.width > 0 && size.height > 0)
        setTransform(wikiGraphFitTransform(graph.nodes, size));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(element);
    return () => observer.disconnect();
  }, [graph.nodes]);

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      interacted.current = true;
      const rect = element.getBoundingClientRect();
      const factor = Math.exp(-wheelPixels(event) * 0.0015);
      setTransform((current) =>
        wikiGraphZoomAt(current, factor, { x: event.clientX - rect.left, y: event.clientY - rect.top }),
      );
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const pointerPoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const nodeIdAt = (target: EventTarget | null) =>
    (target as Element | null)?.closest?.<SVGGElement>("[data-wiki-graph-node]")?.dataset.wikiGraphNode;

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    interacted.current = true;
    const id = nodeIdAt(event.target);
    const node = id ? byId.get(id) : undefined;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gesture.current =
      id && node
        ? {
            kind: "node",
            pointerId: event.pointerId,
            id,
            startX: event.clientX,
            startY: event.clientY,
            moved: false,
            origin: { x: node.x, y: node.y, pinned: node.pinned },
          }
        : { kind: "pan", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: transform };
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.kind === "pan") {
      setTransform({
        k: current.origin.k,
        x: current.origin.x + event.clientX - current.startX,
        y: current.origin.y + event.clientY - current.startY,
      });
      return;
    }
    if (!canPin) return;
    if (
      !current.moved &&
      Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < WIKI_GRAPH_DRAG_THRESHOLD
    )
      return;
    current.moved = true;
    positions.move(current.id, wikiGraphToUnit(pointerPoint(event), transform));
  };

  const releasePointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    releasePointer(event);
    if (current.kind === "pan") return;
    if (current.moved) {
      const unit = wikiGraphToUnit(pointerPoint(event), transform);
      runUserAction(() => positions.pin(current.id, unit, current.origin));
      return;
    }
    onSelect(current.id);
  };

  const onPointerCancel = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    releasePointer(event);
    if (current.kind === "node" && current.moved) positions.restore(current.id, current.origin);
  };

  const onNodeKeyDown = (event: ReactKeyboardEvent<SVGGElement>, id: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
    }
  };

  const filterItem = (value: WikiPageKind | null, label: string, count: number) => ({
    value: value ?? FILTER_ALL,
    controls: false as const,
    label: (
      <span className="flex items-center gap-1.5">
        {value && <span aria-hidden="true" className={cn("size-2 rounded-full", WIKI_GRAPH_KIND_DOT[value])} />}

        <span className="truncate">{label}</span>

        <span className="tabular-nums opacity-70">{count}</span>
      </span>
    ),
  });

  return (
    <div ref={container} className="relative flex min-h-0 flex-1 overflow-hidden bg-background" data-wiki-graph-view="">
      <WikiGraphCanvas
        focus={focus}
        focusId={focusId}
        label={t("Wiki.graph.canvasLabel")}
        links={graph.links}
        nodeLabel={(node) => t("Wiki.graph.nodeLabel", { title: node.title, kind: kindLabels[node.kind] })}
        nodes={nodes}
        selectedId={selectedId}
        svgRef={svg}
        transform={transform}
        visible={visible}
        onNodeHover={setHoverId}
        onNodeKeyDown={onNodeKeyDown}
        onPointerCancel={onPointerCancel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-3">
        <SegmentedControl
          className="pointer-events-auto min-w-0"
          items={[
            filterItem(null, t("Wiki.graph.filter.all"), graph.nodes.length),
            ...FILTER_KINDS.map((value) => filterItem(value, filterLabels[value], kindCounts[value])),
          ]}
          label={t("Wiki.graph.filter.label")}
          listClassName="w-auto bg-card"
          value={kind ?? FILTER_ALL}
          onValueChange={(value) => setKind(FILTER_KINDS.find((candidate) => candidate === value) ?? null)}
        />

        <div className="pointer-events-auto ml-auto shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t("Wiki.graph.fit")}
                className="size-7 bg-card"
                size="icon-sm"
                variant="secondary"
                onClick={fit}
              >
                <Maximize aria-hidden="true" />
              </Button>
            </TooltipTrigger>

            <TooltipContent>{t("Wiki.graph.fit")}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <p className="pointer-events-none absolute bottom-3 left-3 max-w-xl text-xs text-muted-foreground">
        {visible.size === 0
          ? t("Wiki.graph.noMatches")
          : graph.truncated
            ? t("Wiki.graph.truncated", { count: graph.nodes.length })
            : canPin
              ? t("Wiki.graph.legendEdit")
              : t("Wiki.graph.legend")}
      </p>
    </div>
  );
}
