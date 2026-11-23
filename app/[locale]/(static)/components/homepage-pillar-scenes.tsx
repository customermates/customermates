import type { HomepagePillarScenes } from "@/core/fumadocs/schemas/homepage";
import type { CSSProperties, ReactNode } from "react";

import { Bot, CheckCircle2, FileText, Zap } from "lucide-react";

import { Google, Linkedin, Outlook, Whatsapp } from "@/components/icons/channel-icon";
import { MateOrb } from "@/components/mate/mate-orb";

function step(index: number): CSSProperties {
  return { "--pa-delay": `${index * 0.7}s` } as CSSProperties;
}

function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="homepage-pa-frame" data-pillar-scene="">
      <p className="homepage-pa-title">{label}</p>

      {children}
    </div>
  );
}

const AGENT_STEP_ICONS = [
  <Zap key="when" className="size-3.5" />,
  <MateOrb key="ask" className="size-3.5" />,
  <FileText key="draft" className="size-3.5" />,
];

export function AgentsScene({ scene }: { scene: HomepagePillarScenes["agents"] }) {
  return (
    <Frame label={scene.label}>
      <ol className="grid gap-1.5">
        {scene.steps.map((item, index) => (
          <li key={item.kind} className="homepage-pa-step pa-in" style={step(index)}>
            <span className="homepage-pa-step-icon">{AGENT_STEP_ICONS[index]}</span>

            <span className="min-w-0">
              <span className="block text-[0.6875rem] text-muted-foreground">{item.kind}</span>

              <span className="block truncate text-xs font-medium text-foreground">{item.text}</span>
            </span>

            <span aria-hidden className="homepage-pa-tick pa-tick" style={step(index + 1)}>
              <CheckCircle2 className="size-3.5" />
            </span>
          </li>
        ))}
      </ol>

      <p className="homepage-pa-run pa-in" style={step(4)}>
        <span className="truncate">{scene.run}</span>

        <span className="homepage-pa-ok">{scene.status}</span>
      </p>
    </Frame>
  );
}

const INBOX_ICONS = [Linkedin, Google, Whatsapp, Outlook];

export function InboxScene({ scene }: { scene: HomepagePillarScenes["inbox"] }) {
  return (
    <Frame label={scene.label}>
      <ul className="grid gap-1.5">
        {scene.rows.map(({ linked, name, text }, index) => {
          const Icon = INBOX_ICONS[index] ?? Google;

          return (
            <li key={name} className="homepage-pa-row pa-in" style={step(index)}>
              <Icon className="size-4 shrink-0" size={16} />

              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground">{name}</span>

                <span className="block truncate text-[0.6875rem] text-muted-foreground">{text}</span>
              </span>

              <span className="mk-badge shrink-0 pa-in" style={step(index + 1)}>
                {linked}
              </span>
            </li>
          );
        })}
      </ul>
    </Frame>
  );
}

export function DataScene({ scene }: { scene: HomepagePillarScenes["data"] }) {
  return (
    <Frame label={scene.label}>
      <div className="flex flex-wrap gap-1.5">
        {scene.lists.map((list, index) => (
          <span key={list} className="mk-badge pa-in" style={step(index * 0.5)}>
            {list}
          </span>
        ))}
      </div>

      <div className="homepage-pa-table mt-2.5">
        <p className="homepage-pa-thead pa-in" style={step(2.5)}>
          {scene.columns.map((column) => (
            <span key={column}>{column}</span>
          ))}
        </p>

        {scene.rows.map((row, index) => (
          <p key={row[0]} className="homepage-pa-trow pa-in" style={step(3 + index * 0.6)}>
            {row.map((cell, cellIndex) => (
              <span key={cell} className={cellIndex === 0 ? "font-medium text-foreground" : undefined}>
                {cell}
              </span>
            ))}
          </p>
        ))}
      </div>
    </Frame>
  );
}

type NodeId = keyof HomepagePillarScenes["knowledge"]["nodes"];

const NODES: { hub?: boolean; id: NodeId; r: number; used?: boolean; x: number; y: number }[] = [
  { id: "guide", x: 100, y: 44, r: 6, hub: true },
  { id: "playbook", x: 46, y: 26, r: 5, used: true },
  { id: "process", x: 150, y: 18, r: 4.5 },
  { id: "rates", x: 172, y: 52, r: 4 },
  { id: "brief", x: 136, y: 76, r: 4 },
  { id: "icp", x: 30, y: 64, r: 4 },
  { id: "tone", x: 78, y: 78, r: 3.8 },
  { id: "agents", x: 90, y: 10, r: 3.8 },
];

const EDGES: [NodeId, NodeId][] = [
  ["guide", "playbook"],
  ["guide", "process"],
  ["guide", "rates"],
  ["guide", "brief"],
  ["guide", "icp"],
  ["guide", "agents"],
  ["playbook", "tone"],
  ["playbook", "rates"],
  ["process", "brief"],
  ["icp", "tone"],
  ["agents", "playbook"],
];

export function KnowledgeScene({ scene }: { scene: HomepagePillarScenes["knowledge"] }) {
  const at = (id: NodeId) => NODES.find((node) => node.id === id) ?? NODES[0];

  return (
    <Frame label={scene.label}>
      <svg aria-hidden className="homepage-pa-map" preserveAspectRatio="xMidYMid meet" viewBox="0 0 200 90">
        {EDGES.map(([from, to], index) => (
          <line
            key={`${from}-${to}`}
            className="pa-edge"
            pathLength={1}
            style={step(1 + index * 0.25)}
            x1={at(from).x}
            x2={at(to).x}
            y1={at(from).y}
            y2={at(to).y}
          />
        ))}

        {NODES.map((node, index) => (
          <g key={node.id} className="pa-node" style={step(index * 0.35)}>
            {node.used ? <circle className="pa-pulse" cx={node.x} cy={node.y} r={node.r + 3} /> : null}

            <circle
              className={node.hub ? "homepage-pa-node homepage-pa-node-hub" : "homepage-pa-node"}
              cx={node.x}
              cy={node.y}
              r={node.r}
            />

            <text className="homepage-pa-label" textAnchor="middle" x={node.x} y={node.y + node.r + 5}>
              {scene.nodes[node.id]}
            </text>
          </g>
        ))}
      </svg>

      <p className="homepage-pa-run pa-in" style={step(6)}>
        <Bot aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />

        <span className="truncate">{scene.run}</span>
      </p>
    </Frame>
  );
}
