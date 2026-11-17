"use client";

import type { WikiGraph } from "@/features/wiki/wiki-graph.schema";
import type { WikiGraphCanvasNode } from "./wiki-graph-canvas";

import { useCallback, useMemo, useState } from "react";

import { actionData } from "@/core/utils/action-data";

import { pinWikiGraphNodeAction } from "../actions";

export type WikiGraphPlace = { x: number; y: number; pinned: boolean };

export type WikiGraphPositions = {
  nodes: WikiGraphCanvasNode[];
  move: (id: string, place: { x: number; y: number }) => void;
  restore: (id: string, origin: WikiGraphPlace) => void;
  pin: (id: string, place: { x: number; y: number } | null, origin: WikiGraphPlace) => Promise<void>;
};

function unconfirmedPlaces(
  places: Record<string, WikiGraphPlace>,
  graph: WikiGraph | null,
): Record<string, WikiGraphPlace> {
  const nodes = new Map((graph?.nodes ?? []).map((node) => [node.id, node] as const));
  const kept: Record<string, WikiGraphPlace> = {};
  for (const [id, place] of Object.entries(places)) {
    const node = nodes.get(id);
    if (!node || !place.pinned) continue;
    if (!(node.pinned && node.x === place.x && node.y === place.y)) kept[id] = place;
  }
  return kept;
}

export function useWikiGraphPositions(graph: WikiGraph | null): WikiGraphPositions {
  const [places, setPlaces] = useState<Record<string, WikiGraphPlace>>({});
  const [placedOn, setPlacedOn] = useState(graph);
  if (placedOn !== graph) {
    setPlacedOn(graph);
    setPlaces((current) => unconfirmedPlaces(current, graph));
  }
  const nodes = useMemo<WikiGraphCanvasNode[]>(
    () =>
      (graph?.nodes ?? []).map((node) => {
        const place = places[node.id];
        return place ? { ...node, x: place.x, y: place.y, pinned: place.pinned } : node;
      }),
    [graph, places],
  );

  const move = useCallback((id: string, place: { x: number; y: number }) => {
    setPlaces((current) => ({ ...current, [id]: { ...place, pinned: true } }));
  }, []);

  const restore = useCallback((id: string, origin: WikiGraphPlace) => {
    setPlaces((current) => ({ ...current, [id]: { ...origin } }));
  }, []);

  const pin = useCallback(
    (id: string, place: { x: number; y: number } | null, origin: WikiGraphPlace) => {
      setPlaces((current) => ({
        ...current,
        [id]: place ? { ...place, pinned: true } : { x: origin.x, y: origin.y, pinned: false },
      }));
      return actionData(pinWikiGraphNodeAction(place ? { id, x: place.x, y: place.y } : { id, pinned: false })).then(
        (result) => {
          if (result.pinned !== Boolean(place)) restore(id, origin);
        },
        (error: unknown) => {
          restore(id, origin);
          throw error;
        },
      );
    },
    [restore],
  );

  return useMemo(() => ({ nodes, move, restore, pin }), [move, nodes, pin, restore]);
}
