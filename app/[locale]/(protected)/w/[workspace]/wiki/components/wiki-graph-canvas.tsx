"use client";

import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent, Ref } from "react";
import type { WikiGraph, WikiGraphNode } from "@/features/wiki/wiki-graph.schema";
import type { WikiGraphTransform } from "./wiki-graph-model";

import { useMemo } from "react";
import { Pin } from "lucide-react";

import { cn } from "@/core/utils/cn";

import {
  WIKI_GRAPH_KIND_NODE,
  WIKI_GRAPH_LABEL_FONT_SIZE,
  wikiGraphLabel,
  wikiGraphLabelIds,
  wikiGraphNodeRadius,
  wikiGraphNodeScale,
  wikiGraphPeakInbound,
  wikiGraphWorldPoint,
} from "./wiki-graph-model";

export type WikiGraphCanvasNode = WikiGraphNode & { pinned: boolean };

const PIN_SIZE = 13;
const RING_WIDTH = 1.5;
const GUIDE_RING_WIDTH = 2.5;
const GUIDE_CORE_SHARE = 0.35;

type Props = {
  svgRef: Ref<SVGSVGElement>;
  label: string;
  nodes: readonly WikiGraphCanvasNode[];
  links: WikiGraph["links"];
  transform: WikiGraphTransform;
  visible: ReadonlySet<string>;
  focusId: string | null;
  focus: ReadonlySet<string> | null;
  selectedId: string | null;
  nodeLabel: (node: WikiGraphCanvasNode) => string;
  onPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerUp: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onNodeHover: (id: string | null) => void;
  onNodeKeyDown: (event: ReactKeyboardEvent<SVGGElement>, id: string) => void;
};

export function WikiGraphCanvas({
  svgRef,
  label,
  nodes,
  links,
  transform,
  visible,
  focusId,
  focus,
  selectedId,
  nodeLabel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onNodeHover,
  onNodeKeyDown,
}: Props) {
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node] as const)), [nodes]);
  const strokeWidth = 1 / transform.k;
  const fontSize = WIKI_GRAPH_LABEL_FONT_SIZE / transform.k;
  const nodeScale = wikiGraphNodeScale(transform.k);
  const peak = useMemo(() => wikiGraphPeakInbound(nodes), [nodes]);
  const labelZoom = Math.round(transform.k * 20) / 20;
  const labelled = useMemo(
    () => wikiGraphLabelIds(nodes, { zoom: labelZoom, focusId, focus, visible }),
    [focus, focusId, labelZoom, nodes, visible],
  );
  const dimmed = (id: string) => !visible.has(id) || (focus !== null && !focus.has(id));

  return (
    <svg
      ref={svgRef}
      aria-label={label}
      className="size-full touch-none select-none"
      data-wiki-graph=""
      role="application"
      onPointerCancel={onPointerCancel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
        <g aria-hidden="true">
          {links.map((link) => {
            const source = byId.get(link.source);
            const target = byId.get(link.target);
            if (!source || !target) return null;
            const from = wikiGraphWorldPoint(source);
            const to = wikiGraphWorldPoint(target);
            const hot = focus !== null && focus.has(link.source) && focus.has(link.target);
            const faded = dimmed(link.source) || dimmed(link.target);
            return (
              <line
                key={`${link.source}-${link.target}`}
                className={cn(
                  "transition-opacity",
                  hot ? "stroke-foreground" : "stroke-border-strong",
                  faded ? "opacity-10" : hot ? "opacity-40" : "opacity-50",
                )}
                strokeWidth={strokeWidth}
                x1={from.x}
                x2={to.x}
                y1={from.y}
                y2={to.y}
              />
            );
          })}
        </g>

        <g>
          {nodes.map((node) => {
            const point = wikiGraphWorldPoint(node);
            const radius = wikiGraphNodeRadius(node, peak) / nodeScale;
            const selected = node.id === selectedId;
            const faded = dimmed(node.id);
            const pinSize = PIN_SIZE / transform.k;
            return (
              <g
                key={node.id}
                aria-label={nodeLabel(node)}
                aria-pressed={selected}
                className={cn("cursor-pointer outline-none transition-opacity", faded && "opacity-20")}
                data-wiki-graph-node={node.id}
                data-wiki-graph-pinned={node.pinned || undefined}
                role="button"
                tabIndex={visible.has(node.id) ? 0 : -1}
                transform={`translate(${point.x} ${point.y})`}
                onBlur={() => onNodeHover(null)}
                onFocus={() => onNodeHover(node.id)}
                onKeyDown={(event) => onNodeKeyDown(event, node.id)}
                onPointerEnter={() => onNodeHover(node.id)}
                onPointerLeave={() => onNodeHover(null)}
              >
                {selected && (
                  <circle
                    className="fill-none stroke-foreground opacity-80"
                    r={radius + 4 / transform.k}
                    strokeWidth={strokeWidth * 1.5}
                  />
                )}

                <circle className="fill-background" r={radius} />

                <circle
                  className={cn(WIKI_GRAPH_KIND_NODE[node.kind].tint, WIKI_GRAPH_KIND_NODE[node.kind].ring)}
                  data-wiki-graph-kind={node.kind}
                  r={radius}
                  strokeWidth={strokeWidth * (node.kind === "guide" ? GUIDE_RING_WIDTH : RING_WIDTH)}
                />

                {node.kind === "guide" && <circle className="fill-foreground" r={radius * GUIDE_CORE_SHARE} />}

                {node.pinned && (
                  <Pin
                    aria-hidden="true"
                    className="fill-background text-foreground"
                    data-wiki-graph-pin=""
                    height={pinSize}
                    strokeWidth={2.25}
                    width={pinSize}
                    x={radius * 0.55}
                    y={-radius * 0.55 - pinSize}
                  />
                )}
              </g>
            );
          })}
        </g>

        <g aria-hidden="true" className="pointer-events-none">
          {nodes.map((node) => {
            if (!labelled.has(node.id)) return null;
            const point = wikiGraphWorldPoint(node);
            const radius = wikiGraphNodeRadius(node, peak) / nodeScale;
            const emphasised = node.kind === "guide" || node.id === selectedId;
            return (
              <text
                key={node.id}
                className={cn(
                  "fill-foreground stroke-background [paint-order:stroke] [stroke-linejoin:round] transition-opacity",
                  emphasised && "font-semibold",
                  dimmed(node.id) && "opacity-20",
                )}
                fontSize={fontSize}
                strokeWidth={3 / transform.k}
                textAnchor="middle"
                x={point.x}
                y={point.y + radius + fontSize * 1.2}
              >
                {wikiGraphLabel(node.title)}
              </text>
            );
          })}
        </g>
      </g>
    </svg>
  );
}
