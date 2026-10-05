"use client";

import type { KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { RecordModel, RecordRelationship } from "@/features/records/record-model.schema";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { recordTypeIcon } from "@/components/records/record-type-icon";
import { cn } from "@/core/utils/cn";

import { configureMapLayout, MAP_NODE_HEIGHT, MAP_NODE_WIDTH, type ConfigureMapNode } from "./configure-map-layout";

type Drag = {
  sourceId: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
};

type Props = {
  model: RecordModel;
  showArchived: boolean;
  canManage: boolean;
  onSelectList: (typeId: string) => void;
  onEditRelationship: (relation: RecordRelationship) => void;
  onConnect: (sourceTypeId: string, targetTypeId: string) => void;
  action?: ReactNode;
};

const truncate = (label: string, limit = 18) => (label.length > limit ? `${label.slice(0, limit - 1)}…` : label);

export function ConfigureMap({
  model,
  showArchived,
  canManage,
  onSelectList,
  onEditRelationship,
  onConnect,
  action,
}: Props) {
  const t = useTranslations();
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDragState(next);
  };
  const [activeEdge, setActiveEdge] = useState<string | null>(null);
  const layout = useMemo(() => configureMapLayout(model, showArchived), [model, showArchived]);
  const labelOf = (typeId: string) => model.types.find((type) => type.id === typeId)?.pluralLabel ?? "";

  const toSvg = (clientX: number, clientY: number) => {
    const element = svg.current;
    const matrix = element?.getScreenCTM();
    if (!element || !matrix) return { x: clientX, y: clientY };
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  };
  const nodeAt = (x: number, y: number): ConfigureMapNode | undefined =>
    layout.nodes.find(
      (node) => Math.abs(node.x - x) <= MAP_NODE_WIDTH / 2 && Math.abs(node.y - y) <= MAP_NODE_HEIGHT / 2,
    );

  const startDrag = (event: ReactPointerEvent<SVGGElement>, node: ConfigureMapNode) => {
    if (event.button !== 0) return;
    const point = toSvg(event.clientX, event.clientY);
    svg.current?.setPointerCapture(event.pointerId);
    setDrag({
      sourceId: node.type.id,
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      x: point.x,
      y: point.y,
      moved: false,
    });
  };
  const moveDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    const active = dragRef.current;
    if (!active || event.pointerId !== active.pointerId) return;
    const point = toSvg(event.clientX, event.clientY);
    const moved = active.moved || Math.hypot(point.x - active.startX, point.y - active.startY) > 6;
    setDrag({ ...active, x: point.x, y: point.y, moved });
  };
  const endDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId);
    setDrag(null);
    if (!current.moved) {
      onSelectList(current.sourceId);
      return;
    }
    const point = toSvg(event.clientX, event.clientY);
    const target = nodeAt(point.x, point.y);
    if (target && canManage) onConnect(current.sourceId, target.type.id);
  };

  const source = drag?.moved ? layout.nodes.find((node) => node.type.id === drag.sourceId) : undefined;
  const hoverTarget = source && drag ? nodeAt(drag.x, drag.y) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-4 px-4 pt-4 md:px-8 md:pt-6">
        <p className="max-w-2xl text-sm text-muted-foreground" id="configure-map-help">
          {canManage ? t("RecordModel.mapHelp") : t("RecordModel.mapHelpReadOnly")}
        </p>

        {action}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4 md:px-8">
        <svg
          ref={svg}
          aria-describedby="configure-map-help"
          aria-label={t("RecordModel.mapLabel")}
          className="mx-auto block max-w-none select-none"
          data-configure-map=""
          height={layout.height}
          role="group"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
          onPointerCancel={() => setDrag(null)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
        >
          {layout.edges.map((edge) => {
            const active = activeEdge === edge.relation.id;
            const label = `${edge.relation.sourceLabel} · ${labelOf(edge.relation.sourceTypeId)} → ${labelOf(edge.relation.targetTypeId)}`;
            return (
              <g
                key={edge.relation.id}
                className={cn("group outline-none", canManage && "cursor-pointer")}
                data-configure-relationship={edge.relation.id}
                onPointerEnter={() => setActiveEdge(edge.relation.id)}
                onPointerLeave={() => setActiveEdge((current) => (current === edge.relation.id ? null : current))}
                {...(canManage
                  ? {
                      role: "button",
                      tabIndex: 0,
                      "aria-label": label,
                      onBlur: () => setActiveEdge(null),
                      onClick: () => onEditRelationship(edge.relation),
                      onFocus: () => setActiveEdge(edge.relation.id),
                      onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        onEditRelationship(edge.relation);
                      },
                    }
                  : { role: "img", "aria-label": label })}
              >
                <path className="fill-none stroke-transparent" d={edge.path} strokeWidth={14} />

                <path
                  className={cn(
                    "fill-none transition-colors",
                    active ? "stroke-primary" : "stroke-muted-foreground/50",
                    edge.relation.archived && "[stroke-dasharray:4_4]",
                  )}
                  d={edge.path}
                  strokeWidth={active ? 2 : 1.5}
                />

                {active && (
                  <g pointerEvents="none">
                    <rect
                      className="fill-popover stroke-border"
                      height={22}
                      rx={6}
                      width={Math.min(240, Math.max(48, edge.relation.sourceLabel.length * 7 + 16))}
                      x={edge.labelX - Math.min(240, Math.max(48, edge.relation.sourceLabel.length * 7 + 16)) / 2}
                      y={edge.labelY - 11}
                    />

                    <text
                      className="fill-popover-foreground text-xs"
                      dominantBaseline="central"
                      textAnchor="middle"
                      x={edge.labelX}
                      y={edge.labelY}
                    >
                      {truncate(edge.relation.sourceLabel, 32)}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {source && drag && (
            <line
              className="pointer-events-none stroke-primary [stroke-dasharray:6_4]"
              strokeWidth={2}
              x1={source.x}
              x2={drag.x}
              y1={source.y}
              y2={drag.y}
            />
          )}

          {layout.nodes.map((node) => {
            const Icon = recordTypeIcon(node.type.icon);
            const highlighted = hoverTarget?.type.id === node.type.id && hoverTarget.type.id !== drag?.sourceId;
            return (
              <g
                key={node.type.id}
                aria-label={node.type.pluralLabel}
                className={cn("group cursor-pointer outline-none", canManage && "touch-none")}
                data-configure-node={node.type.id}
                role="button"
                tabIndex={0}
                transform={`translate(${node.x - MAP_NODE_WIDTH / 2} ${node.y - MAP_NODE_HEIGHT / 2})`}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSelectList(node.type.id);
                }}
                onPointerDown={(event) => startDrag(event, node)}
              >
                <rect
                  className={cn(
                    "fill-card stroke-border transition-colors group-hover:stroke-primary/60 group-focus-visible:stroke-ring",
                    highlighted && "stroke-primary",
                    node.type.archived && "[stroke-dasharray:4_4]",
                  )}
                  height={MAP_NODE_HEIGHT}
                  rx={10}
                  strokeWidth={highlighted ? 2 : 1}
                  width={MAP_NODE_WIDTH}
                />

                <Icon aria-hidden className="text-muted-foreground" height={16} width={16} x={14} y={14} />

                <text
                  className={cn("text-sm", node.type.archived ? "fill-muted-foreground" : "fill-foreground")}
                  dominantBaseline="central"
                  x={38}
                  y={MAP_NODE_HEIGHT / 2}
                >
                  {truncate(node.type.pluralLabel)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
