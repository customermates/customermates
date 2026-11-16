"use client";

import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent, Ref } from "react";
import type { WikiGraph, WikiGraphNode } from "@/features/wiki/wiki-graph.schema";
import type { WikiGraphTransform } from "./wiki-graph-model";

import { cn } from "@/core/utils/cn";

import {
  WIKI_GRAPH_KIND_FILL,
  wikiGraphLabel,
  wikiGraphNodeRadius,
  wikiGraphShowsLabel,
  wikiGraphWorldPoint,
} from "./wiki-graph-model";

export type WikiGraphCanvasNode = WikiGraphNode & { pinned: boolean };

type Props = {
  svgRef: Ref<SVGSVGElement>;
  label: string;
  nodes: readonly WikiGraphCanvasNode[];
  links: WikiGraph["links"];
  transform: WikiGraphTransform;
  visible: ReadonlySet<string>;
  focus: ReadonlySet<string> | null;
  selectedId: string | null;
  nodeLabel: (node: WikiGraphCanvasNode) => string;
  onPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerUp: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onNodeHover: (id: string | null) => void;
  onNodeKeyDown: (event: ReactKeyboardEvent<SVGGElement>, id: string) => void;
  onNodeDoubleClick: (id: string) => void;
};

export function WikiGraphCanvas({
  svgRef,
  label,
  nodes,
  links,
  transform,
  visible,
  focus,
  selectedId,
  nodeLabel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onNodeHover,
  onNodeKeyDown,
  onNodeDoubleClick,
}: Props) {
  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  const strokeWidth = 1 / transform.k;
  const fontSize = 11 / transform.k;
  const nodeScale = transform.k < 1 ? transform.k : Math.sqrt(transform.k);
  const labelContext = { total: nodes.length, zoom: transform.k, focus, selected: selectedId };
  const dimmed = (id: string) => !visible.has(id) || (focus !== null && !focus.has(id));

  return (
    <svg
      ref={svgRef}
      aria-label={label}
      className="size-full touch-none select-none"
      data-wiki-graph=""
      role="application"
      onPointerCancel={onPointerUp}
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
                  faded ? "opacity-15" : hot ? "opacity-90" : "opacity-60",
                )}
                strokeWidth={hot ? strokeWidth * 1.5 : strokeWidth}
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
            const radius = wikiGraphNodeRadius(node) / nodeScale;
            const selected = node.id === selectedId;
            const faded = dimmed(node.id);
            return (
              <g
                key={node.id}
                aria-label={nodeLabel(node)}
                aria-pressed={selected}
                className={cn("cursor-pointer outline-none transition-opacity", faded && "opacity-20")}
                data-wiki-graph-node={node.id}
                data-wiki-graph-pinned={node.pinned || undefined}
                role="button"
                tabIndex={faded ? -1 : 0}
                transform={`translate(${point.x} ${point.y})`}
                onBlur={() => onNodeHover(null)}
                onDoubleClick={() => onNodeDoubleClick(node.id)}
                onFocus={() => onNodeHover(node.id)}
                onKeyDown={(event) => onNodeKeyDown(event, node.id)}
                onPointerEnter={() => onNodeHover(node.id)}
                onPointerLeave={() => onNodeHover(null)}
              >
                {(node.kind === "guide" || selected) && (
                  <circle
                    className={cn("fill-none stroke-foreground", selected ? "opacity-90" : "opacity-45")}
                    r={radius + 5 / transform.k}
                    strokeWidth={selected ? strokeWidth * 1.5 : strokeWidth}
                  />
                )}

                <circle
                  className={cn(WIKI_GRAPH_KIND_FILL[node.kind], "stroke-card")}
                  r={radius}
                  strokeWidth={strokeWidth * 1.5}
                />

                {node.pinned && <circle className="fill-card" r={Math.max(1.2, radius * 0.28)} />}
              </g>
            );
          })}
        </g>

        <g aria-hidden="true" className="pointer-events-none">
          {nodes.map((node) => {
            if (!wikiGraphShowsLabel(node, labelContext)) return null;
            const point = wikiGraphWorldPoint(node);
            const radius = wikiGraphNodeRadius(node) / nodeScale;
            const emphasised = node.kind === "guide" || node.id === selectedId;
            return (
              <text
                key={node.id}
                className={cn(
                  "fill-foreground stroke-background [paint-order:stroke] [stroke-linejoin:round] transition-opacity",
                  emphasised && "font-semibold",
                  dimmed(node.id) && "opacity-20",
                )}
                fontSize={emphasised ? fontSize * 1.12 : fontSize}
                strokeWidth={3 / transform.k}
                textAnchor="middle"
                x={point.x}
                y={point.y + radius + fontSize * 1.15}
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
