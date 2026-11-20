import type { CSSProperties, ReactNode } from "react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { Linkedin } from "@/components/icons/channel-icon";

type Drift = {
  children: ReactNode;
  id: string;
  path: readonly [x0: number, y0: number, x1: number, y1: number];
  seconds: number;
  delay: number;
  size: number;
};

function MateOrbMark() {
  return (
    <span className="homepage-drift-orb">
      <i />

      <i />
    </span>
  );
}

const DRIFTS: readonly Drift[] = [
  {
    children: <Linkedin className="size-[44%]" size={24} />,
    delay: -3,
    id: "linkedin",
    path: [86, 10, 83, 92],
    seconds: 28,
    size: 54,
  },
  {
    children: <AiClientLogo className="size-[44%]" provider="claude" />,
    delay: -16,
    id: "claude",
    path: [95, 38, 90, 108],
    seconds: 32,
    size: 58,
  },
  {
    children: <AiClientLogo className="size-[44%]" provider="chatgpt" />,
    delay: -8,
    id: "chatgpt",
    path: [14, 8, 6, 90],
    seconds: 30,
    size: 56,
  },
  {
    children: <MateOrbMark />,
    delay: -21,
    id: "mate",
    path: [6, 34, 1, 108],
    seconds: 34,
    size: 56,
  },
];

export function HomepageHeroDrift() {
  return (
    <div aria-hidden className="homepage-hero-drift" data-homepage-hero-drift="">
      {DRIFTS.map(({ children, delay, id, path, seconds, size }) => (
        <span
          key={id}
          className="homepage-drift-tile"
          data-drift={id}
          style={
            {
              "--drift-delay": `${delay}s`,
              "--drift-seconds": `${seconds}s`,
              "--drift-size": `${size}px`,
              "--drift-x0": `${path[0]}%`,
              "--drift-x1": `${path[2]}%`,
              "--drift-y0": `${path[1]}%`,
              "--drift-y1": `${path[3]}%`,
            } as CSSProperties
          }
        >
          {children}
        </span>
      ))}
    </div>
  );
}
