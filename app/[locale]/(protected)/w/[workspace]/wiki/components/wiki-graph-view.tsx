"use client";

import type {
  PointerEvent as ReactPointerEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import type { WikiGraph, WikiPageLinks } from "@/features/wiki/wiki-graph.schema";
import type { WikiPageDto, WikiPageKind } from "@/features/wiki/wiki.schema";
import type { WikiGraphCanvasNode } from "./wiki-graph-canvas";
import type { WikiGraphTransform } from "./wiki-graph-model";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Maximize, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { actionData } from "@/core/utils/action-data";
import { cn } from "@/core/utils/cn";
import { WIKI_PAGE_KINDS } from "@/features/wiki/wiki.schema";

import { getWikiPageAction, getWikiPageLinksAction, pinWikiGraphNodeAction } from "../actions";
import { WikiGraphCanvas } from "./wiki-graph-canvas";
import { WikiGraphDrawer, WIKI_GRAPH_DRAWER_WIDTH } from "./wiki-graph-drawer";
import {
  WIKI_GRAPH_DRAG_THRESHOLD,
  WIKI_GRAPH_KIND_DOT,
  wikiGraphFitTransform,
  wikiGraphNeighbours,
  wikiGraphRevealNode,
  wikiGraphToUnit,
  wikiGraphVisibleIds,
  wikiGraphZoomAt,
} from "./wiki-graph-model";

type Props = {
  graph: WikiGraph;
  canPin: boolean;
  onOpenPage: (id: string) => void;
};

type Position = { x: number; y: number; pinned: boolean };

type Gesture =
  | { kind: "pan"; pointerId: number; startX: number; startY: number; origin: WikiGraphTransform }
  | { kind: "node"; pointerId: number; id: string; startX: number; startY: number; moved: boolean; origin: Position };

const WHEEL_LINE_PIXELS = 16;
const WHEEL_PAGE_PIXELS = 100;

function wheelPixels(event: WheelEvent): number {
  if (event.deltaMode === 1) return event.deltaY * WHEEL_LINE_PIXELS;
  if (event.deltaMode === 2) return event.deltaY * WHEEL_PAGE_PIXELS;
  return event.deltaY;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function WikiGraphView({ graph, canPin, onOpenPage }: Props) {
  const t = useTranslations();
  const container = useRef<HTMLDivElement | null>(null);
  const svg = useRef<SVGSVGElement | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<string | null>(null);
  const interacted = useRef(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [transform, setTransform] = useState<WikiGraphTransform>({ k: 1, x: 0, y: 0 });
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<Set<WikiPageKind>>(() => new Set(WIKI_PAGE_KINDS));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [pages, setPages] = useState<Record<string, WikiPageDto | null>>({});
  const [links, setLinks] = useState<Record<string, WikiPageLinks | null>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  const nodes = useMemo<WikiGraphCanvasNode[]>(
    () =>
      graph.nodes.map((node) => {
        const override = positions[node.id];
        return override ? { ...node, x: override.x, y: override.y, pinned: override.pinned } : node;
      }),
    [graph.nodes, positions],
  );
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node] as const)), [nodes]);
  const neighbours = useMemo(() => wikiGraphNeighbours(graph), [graph]);
  const visible = useMemo(() => wikiGraphVisibleIds(graph.nodes, { query, kinds }), [graph.nodes, kinds, query]);
  const focusId = hoverId ?? selectedId;
  const focus = useMemo(() => {
    if (!focusId) return null;
    return new Set([focusId, ...(neighbours.get(focusId) ?? [])]);
  }, [focusId, neighbours]);
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const kindLabels: Record<WikiPageKind, string> = {
    guide: t("Wiki.kind.guide"),
    procedure: t("Wiki.kind.procedure"),
    knowledge: t("Wiki.kind.knowledge"),
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

  const load = useCallback(async (id: string) => {
    setFailed((current) => ({ ...current, [id]: false }));
    try {
      const [page, pageLinks] = await Promise.all([
        getWikiPageAction(id).then((result) => (result.ok ? result.data : null)),
        actionData(getWikiPageLinksAction({ id })),
      ]);
      setPages((current) => ({ ...current, [id]: page }));
      setLinks((current) => ({ ...current, [id]: pageLinks }));
      if (!page) setFailed((current) => ({ ...current, [id]: true }));
    } catch (error) {
      setFailed((current) => ({ ...current, [id]: true }));
      reportApplicationError(error);
    }
  }, []);

  const select = useCallback(
    (id: string) => {
      const node = byId.get(id);
      if (!node) return;
      interacted.current = true;
      setSelectedId(id);
      setTransform((current) => wikiGraphRevealNode(node, viewport, current, WIKI_GRAPH_DRAWER_WIDTH));
      if (!(id in pages)) load(id).catch(reportApplicationError);
    },
    [byId, load, pages, viewport],
  );

  const close = useCallback(() => {
    setSelectedId(null);
    setHoverId(null);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !isEditableTarget(event.target)) close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close, selectedId]);

  const pin = useCallback((id: string, position: { x: number; y: number } | null, origin: Position) => {
    setPositions((current) => ({
      ...current,
      [id]: position ? { ...position, pinned: true } : { x: origin.x, y: origin.y, pinned: false },
    }));
    return actionData(
      pinWikiGraphNodeAction(position ? { id, x: position.x, y: position.y } : { id, pinned: false }),
    ).then(
      (result) => {
        if (result.pinned === Boolean(position)) return;
        setPositions((current) => ({ ...current, [id]: { ...origin } }));
      },
      (error: unknown) => {
        setPositions((current) => ({ ...current, [id]: { ...origin } }));
        throw error;
      },
    );
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
    const unit = wikiGraphToUnit(pointerPoint(event), transform);
    setPositions((state) => ({ ...state, [current.id]: { ...unit, pinned: true } }));
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
    if (current.kind === "pan" || current.moved) lastTap.current = null;
    if (current.kind === "pan") return;
    if (current.moved) {
      const unit = wikiGraphToUnit(pointerPoint(event), transform);
      runUserAction(() => pin(current.id, unit, current.origin));
      return;
    }
    lastTap.current = current.id;
    select(current.id);
  };

  const onPointerCancel = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    releasePointer(event);
    if (current.kind === "node" && current.moved)
      setPositions((state) => ({ ...state, [current.id]: { ...current.origin } }));
  };

  const onDoubleClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    const id = nodeIdAt(event.target) ?? lastTap.current;
    if (id) onOpenPage(id);
  };

  const onNodeKeyDown = (event: ReactKeyboardEvent<SVGGElement>, id: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(id);
    }
  };

  const toggleKind = (kind: WikiPageKind) =>
    setKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  return (
    <div ref={container} className="relative flex min-h-0 flex-1 overflow-hidden bg-background" data-wiki-graph-view="">
      <WikiGraphCanvas
        focus={focus}
        label={t("Wiki.graph.canvasLabel")}
        links={graph.links}
        nodeLabel={(node) => t("Wiki.graph.nodeLabel", { title: node.title, kind: kindLabels[node.kind] })}
        nodes={nodes}
        selectedId={selectedId}
        svgRef={svg}
        transform={transform}
        visible={visible}
        onDoubleClick={onDoubleClick}
        onNodeHover={setHoverId}
        onNodeKeyDown={onNodeKeyDown}
        onPointerCancel={onPointerCancel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />

      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 p-3"
        style={{ paddingRight: selected ? WIKI_GRAPH_DRAWER_WIDTH + 12 : undefined }}
      >
        <div className="pointer-events-auto relative w-72 max-w-full">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />

          <Input
            aria-label={t("Wiki.graph.search")}
            className="h-8 bg-card pl-8"
            placeholder={t("Wiki.graph.search")}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center gap-1">
          {WIKI_PAGE_KINDS.map((kind) => (
            <Button
              key={kind}
              aria-pressed={kinds.has(kind)}
              className={cn("h-8 gap-2 bg-card font-normal", !kinds.has(kind) && "text-muted-foreground")}
              size="sm"
              variant="secondary"
              onClick={() => toggleKind(kind)}
            >
              <span
                aria-hidden="true"
                className={cn("size-2 rounded-full", WIKI_GRAPH_KIND_DOT[kind], !kinds.has(kind) && "opacity-30")}
              />

              {kindLabels[kind]}

              <span className="text-muted-foreground tabular-nums">{kindCounts[kind]}</span>
            </Button>
          ))}
        </div>

        <div className="pointer-events-auto ml-auto">
          <Button aria-label={t("Wiki.graph.fit")} className="bg-card" size="icon" variant="secondary" onClick={fit}>
            <Maximize aria-hidden="true" />
          </Button>
        </div>
      </div>

      <p
        className="pointer-events-none absolute bottom-3 left-3 max-w-xl text-xs text-muted-foreground"
        style={{ right: selected ? WIKI_GRAPH_DRAWER_WIDTH + 12 : undefined }}
      >
        {visible.size === 0
          ? t("Wiki.graph.noMatches")
          : graph.truncated
            ? t("Wiki.graph.truncated", { count: graph.nodes.length })
            : canPin
              ? t("Wiki.graph.legendEdit")
              : t("Wiki.graph.legend")}
      </p>

      {selected && (
        <WikiGraphDrawer
          canPin={canPin}
          failed={failed[selected.id] === true}
          kindLabels={kindLabels}
          links={links[selected.id]}
          node={selected}
          page={pages[selected.id]}
          onClose={close}
          onOpen={onOpenPage}
          onSelect={select}
          onTogglePin={() =>
            runUserAction(() =>
              pin(selected.id, selected.pinned ? null : { x: selected.x, y: selected.y }, {
                x: selected.x,
                y: selected.y,
                pinned: selected.pinned,
              }),
            )
          }
        />
      )}
    </div>
  );
}
