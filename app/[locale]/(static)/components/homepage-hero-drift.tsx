import type { CSSProperties, ReactNode } from "react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { Linkedin, Whatsapp } from "@/components/icons/channel-icon";

type Drift = {
  children: ReactNode;
  id: string;
  path: readonly [x0: number, y0: number, x1: number, y1: number];
  seconds: number;
  delay: number;
  size: number;
};

const DRIFTS: readonly Drift[] = [
  {
    children: <AiClientLogo className="size-[44%]" provider="chatgpt" />,
    delay: -8,
    id: "chatgpt",
    path: [14, 8, 6, 90],
    seconds: 30,
    size: 56,
  },
  {
    children: <AiClientLogo className="size-[44%]" provider="claude" />,
    delay: -2,
    id: "claude",
    path: [2, 60, 11, 118],
    seconds: 32,
    size: 58,
  },
  {
    children: <Linkedin className="size-[44%]" size={24} />,
    delay: -3,
    id: "linkedin",
    path: [86, 10, 83, 92],
    seconds: 28,
    size: 54,
  },
  {
    children: <Whatsapp className="size-[44%]" size={24} />,
    delay: -16,
    id: "whatsapp",
    path: [95, 38, 90, 108],
    seconds: 32,
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
