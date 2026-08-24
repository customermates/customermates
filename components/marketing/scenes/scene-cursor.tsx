import { cn } from "@/core/utils/cn";

export type CursorWaypoint = {
  at: number;
  holding?: boolean;
  x: number;
  y: number;
};

function easeInOut(progress: number) {
  return progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
}

export function scenePointer(path: readonly CursorWaypoint[], t: number) {
  if (!path.length) return null;

  const first = path[0];
  const last = path[path.length - 1];
  if (t <= first.at) return { pressed: Boolean(first.holding), x: first.x, y: first.y };
  if (t >= last.at) return { pressed: Boolean(last.holding), x: last.x, y: last.y };

  for (let index = 0; index < path.length - 1; index += 1) {
    const from = path[index];
    const to = path[index + 1];
    if (t < from.at || t > to.at) continue;

    const span = to.at - from.at;
    const progress = span === 0 ? 1 : easeInOut((t - from.at) / span);
    return {
      pressed: Boolean(from.holding),
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    };
  }

  return { pressed: Boolean(last.holding), x: last.x, y: last.y };
}

export function SceneCursor({ path, t }: { path: readonly CursorWaypoint[]; t?: number }) {
  if (typeof t !== "number") return null;

  const point = scenePointer(path, t);
  if (!point) return null;

  return (
    <span
      className={cn(
        "pointer-events-none absolute z-10 block origin-top-left transition-none",
        point.pressed && "scale-90",
      )}
      style={{ left: `${point.x}%`, top: `${point.y}%` }}
    >
      {point.pressed ? (
        <span
          className="absolute -left-[1.7cqw] -top-[1.7cqw] block size-[3.4cqw] rounded-full"
          style={{ background: "rgb(122 122 134 / 34%)" }}
        />
      ) : null}

      <svg
        aria-hidden
        className="block w-[2.6cqw] drop-shadow-[0_1px_3px_rgb(0_0_0_/_45%)]"
        fill="none"
        viewBox="0 0 24 32"
      >
        <path
          d="M3 2l16 12.5-7.2.9 4.2 8.6-3.4 1.7-4.1-8.7-5.5 4.6z"
          fill="#ffffff"
          stroke="#1a1a1a"
          strokeWidth="1.4"
        />
      </svg>
    </span>
  );
}
