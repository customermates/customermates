import {
  ILLUSTRATION_INK,
  ILLUSTRATION_OPACITY,
  illustrationSvgProps,
  type IllustrationProps,
} from "./illustration-grammar";

const BODY = { fill: ILLUSTRATION_INK, opacity: ILLUSTRATION_OPACITY.body };
const DETAIL = { fill: ILLUSTRATION_INK, opacity: ILLUSTRATION_OPACITY.detail };
const EDGE = {
  fill: "none",
  stroke: ILLUSTRATION_INK,
  strokeLinecap: "round" as const,
  strokeOpacity: ILLUSTRATION_OPACITY.detail,
  strokeWidth: 3,
};

function AccentCheck({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx="0" cy="0" fill="var(--primary-foreground)" opacity="0.92" r="12" />

      <path
        d="M-6 0l4 4 8-8"
        fill="none"
        stroke="var(--primary)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </g>
  );
}

export function RecordResolved(props: IllustrationProps) {
  return (
    <svg {...illustrationSvgProps(props)}>
      <g {...BODY}>
        <rect height="52" rx="16" width="330" x="96" y="52" />

        <rect height="52" rx="16" width="330" x="122" y="116" />

        <rect height="52" rx="16" width="330" x="174" y="244" />
      </g>

      <g {...DETAIL}>
        <rect height="14" rx="7" width="120" x="120" y="71" />

        <rect height="14" rx="7" width="86" x="146" y="135" />

        <rect height="14" rx="7" width="104" x="198" y="263" />
      </g>

      <rect fill="var(--primary)" height="52" rx="16" width="330" x="148" y="180" />

      <rect fill="var(--primary-foreground)" height="14" opacity="0.92" rx="7" width="140" x="172" y="199" />

      <rect fill="var(--primary-foreground)" height="14" opacity="0.45" rx="7" width="46" x="322" y="199" />

      <AccentCheck x={452} y={206} />
    </svg>
  );
}

export function ChannelsConverge(props: IllustrationProps) {
  const rows = [56, 114, 172, 230, 288];
  const labels = [58, 44, 66, 50, 60];

  return (
    <svg {...illustrationSvgProps(props)}>
      <g {...EDGE}>
        {rows.map((y) => (
          <path key={y} d={`M188 ${y + 20}C260 ${y + 20} 280 192 352 192`} />
        ))}
      </g>

      <g {...BODY}>
        {rows.map((y) => (
          <rect key={y} height="40" rx="14" width="132" x="56" y={y} />
        ))}
      </g>

      <g {...DETAIL}>
        {rows.map((y, index) => (
          <rect key={y} height="10" rx="5" width={labels[index]} x="74" y={y + 15} />
        ))}
      </g>

      <rect fill="var(--primary)" height="80" rx="20" width="232" x="352" y="152" />

      <rect fill="var(--primary-foreground)" height="14" opacity="0.92" rx="7" width="118" x="380" y="177" />

      <rect fill="var(--primary-foreground)" height="12" opacity="0.5" rx="6" width="76" x="380" y="201" />
    </svg>
  );
}

export function ComparisonVerdict(props: IllustrationProps) {
  const rows = [132, 184, 236, 288];
  const leftLabels = [118, 92, 130, 104];
  const rightLabels = [70, 104, 58, 86];

  return (
    <svg {...illustrationSvgProps(props)}>
      <rect fill="var(--primary)" height="56" rx="18" width="216" x="72" y="52" />

      <rect fill="var(--primary-foreground)" height="14" opacity="0.92" rx="7" width="104" x="96" y="73" />

      <rect {...BODY} height="56" rx="18" width="216" x="352" y="52" />

      <rect {...DETAIL} height="14" rx="7" width="80" x="376" y="73" />

      <g {...BODY}>
        {rows.map((y) => (
          <g key={y}>
            <rect height="40" rx="14" width="216" x="72" y={y} />

            <rect height="40" rx="14" width="216" x="352" y={y} />
          </g>
        ))}
      </g>

      <g {...DETAIL}>
        {rows.map((y, index) => (
          <g key={y}>
            <rect height="10" rx="5" width={leftLabels[index]} x="96" y={y + 15} />

            <rect height="10" rx="5" width={rightLabels[index]} x="376" y={y + 15} />
          </g>
        ))}
      </g>
    </svg>
  );
}

export function DetailMarked(props: IllustrationProps) {
  return (
    <svg {...illustrationSvgProps(props)}>
      <rect {...BODY} height="248" rx="24" width="448" x="96" y="56" />

      <g {...DETAIL}>
        <rect height="14" rx="7" width="164" x="128" y="92" />

        <rect height="12" rx="6" width="384" x="128" y="138" />

        <rect height="12" rx="6" width="330" x="128" y="166" />

        <rect height="12" rx="6" width="270" x="128" y="238" />

        <rect height="12" rx="6" width="200" x="128" y="266" />
      </g>

      <rect fill="var(--primary)" height="22" rx="11" width="248" x="128" y="200" />

      <circle cx="404" cy="211" fill="var(--primary)" r="12" />

      <path
        d="M398 211l4 4 8-8"
        fill="none"
        stroke="var(--primary-foreground)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function FlowSchematic(props: IllustrationProps) {
  const nodes = [
    { x: 40, y: 76 },
    { x: 40, y: 220 },
    { x: 245, y: 148 },
  ];

  return (
    <svg {...illustrationSvgProps(props)}>
      <defs>
        <marker id="illustration-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="6" refY="4">
          <path d="M0 0l6 4-6 4" fill="none" stroke={ILLUSTRATION_INK} strokeOpacity={ILLUSTRATION_OPACITY.detail} />
        </marker>
      </defs>

      <g {...EDGE} markerEnd="url(#illustration-arrow)">
        <path d="M190 108C218 108 218 180 240 180" />

        <path d="M190 252C218 252 218 180 240 180" />

        <path d="M395 180h50" />
      </g>

      <g {...BODY}>
        {nodes.map((node) => (
          <rect key={node.y} height="64" rx="20" width="150" x={node.x} y={node.y} />
        ))}
      </g>

      <g {...DETAIL}>
        <rect height="12" rx="6" width="78" x="64" y="102" />

        <rect height="12" rx="6" width="94" x="64" y="246" />

        <rect height="12" rx="6" width="86" x="269" y="174" />
      </g>

      <rect fill="var(--primary)" height="64" rx="20" width="150" x="450" y="148" />

      <rect fill="var(--primary-foreground)" height="12" opacity="0.92" rx="6" width="90" x="474" y="174" />
    </svg>
  );
}
