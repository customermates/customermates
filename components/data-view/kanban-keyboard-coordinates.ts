import type { KeyboardCoordinateGetter, Over } from "@dnd-kit/core";

export const kanbanKeyboardCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") return;
  const rect = context.collisionRect;
  if (!rect) return;
  const center = rect.left + rect.width / 2;
  const currentGroup = context.over?.id ?? context.active?.data.current?.groupKey;
  const candidates = context.droppableContainers
    .getEnabled()
    .flatMap((container) => {
      if (container.id === currentGroup) return [];
      const target = context.droppableRects.get(container.id);
      if (!target) return [];
      const distance = target.left + target.width / 2 - center;
      return (event.code === "ArrowRight" ? distance > 1 : distance < -1)
        ? [{ target, distance: Math.abs(distance) }]
        : [];
    })
    .sort((left, right) => left.distance - right.distance);
  const target = candidates[0]?.target;
  if (!target) return;
  event.preventDefault();
  return {
    x: currentCoordinates.x + target.left + target.width / 2 - center,
    y: currentCoordinates.y + Math.max(target.top, Math.min(rect.top, target.bottom - rect.height)) - rect.top,
  };
};

export const kanbanManualKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  if (event.code !== "ArrowUp" && event.code !== "ArrowDown") return kanbanKeyboardCoordinates(event, args);
  const { currentCoordinates, context } = args;
  const rect = context.collisionRect;
  if (!rect) return;
  const middle = rect.top + rect.height / 2;
  const left = rect.left + rect.width / 2;
  const candidates = context.droppableContainers
    .getEnabled()
    .flatMap((container) => {
      if (!container.data.current?.itemId || container.id === `card:${String(context.active?.id)}`) return [];
      const target = context.droppableRects.get(container.id);
      if (!target || left < target.left || left > target.left + target.width) return [];
      const distance = target.top + target.height / 2 - middle;
      return (event.code === "ArrowDown" ? distance > 1 : distance < -1)
        ? [{ target, distance: Math.abs(distance) }]
        : [];
    })
    .sort((first, second) => first.distance - second.distance);
  const target = candidates[0]?.target;
  if (!target) return;
  event.preventDefault();
  const step = event.code === "ArrowDown" ? target.height / 2 + 1 : -target.height / 2 - 1;
  return { x: currentCoordinates.x, y: currentCoordinates.y + target.top + target.height / 2 - middle + step };
};

export function dropTargetGroupKey(over: Pick<Over, "id" | "data">) {
  const groupKey: unknown = over.data.current?.groupKey;
  return typeof groupKey === "string" ? groupKey : String(over.id);
}
