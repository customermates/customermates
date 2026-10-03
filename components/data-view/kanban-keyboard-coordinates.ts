import type { KeyboardCoordinateGetter } from "@dnd-kit/core";

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
