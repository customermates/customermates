export const ROUTINE_WRITE_TARGETS = ["contacts", "organizations", "deals", "services", "tasks"] as const;

export type RoutineWriteTarget = (typeof ROUTINE_WRITE_TARGETS)[number];

const EVENTS_BY_TARGET: Record<RoutineWriteTarget, readonly string[]> = {
  contacts: ["contact.created", "contact.updated", "contact.deleted"],
  organizations: ["organization.created", "organization.updated", "organization.deleted"],
  deals: ["deal.created", "deal.updated", "deal.deleted"],
  services: ["service.created", "service.updated", "service.deleted"],
  tasks: ["task.created", "task.updated", "task.deleted"],
};

export type RoutineGraphNode = {
  id: string;
  name: string;
  triggerEvents: readonly string[];
  writes: readonly RoutineWriteTarget[];
};

export type RoutineLoop =
  | { kind: "selfLoop"; routineId: string; event: string }
  | { kind: "mutualLoop"; routineId: string; peerRoutineId: string; event: string };

function eventsWrittenBy(node: RoutineGraphNode): string[] {
  return node.writes.flatMap((target) => [...EVENTS_BY_TARGET[target]]);
}

function edgesOf(nodes: RoutineGraphNode[]): { from: string; to: string; event: string }[] {
  const edges: { from: string; to: string; event: string }[] = [];

  for (const source of nodes) {
    const produced = eventsWrittenBy(source);
    for (const target of nodes) {
      const event = produced.find((candidate) => target.triggerEvents.includes(candidate));
      if (event) edges.push({ from: source.id, to: target.id, event });
    }
  }

  return edges;
}

export function detectRoutineLoops(nodes: RoutineGraphNode[]): RoutineLoop[] {
  const edges = edgesOf(nodes);
  const loops: RoutineLoop[] = [];
  const seenPairs = new Set<string>();

  for (const edge of edges) {
    if (edge.from === edge.to) {
      loops.push({ kind: "selfLoop", routineId: edge.from, event: edge.event });
      continue;
    }

    const returning = edges.some((candidate) => candidate.from === edge.to && candidate.to === edge.from);
    if (!returning) continue;

    const pairKey = [edge.from, edge.to].sort().join("|");
    if (seenPairs.has(pairKey)) continue;

    seenPairs.add(pairKey);
    loops.push({ kind: "mutualLoop", routineId: edge.from, peerRoutineId: edge.to, event: edge.event });
  }

  return loops;
}
