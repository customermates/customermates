import type { CollisionDetection, KeyboardCoordinateGetter } from "@dnd-kit/core";
import { describe, expect, it, vi } from "vitest";
import {
  dropTargetGroupKey,
  kanbanCollisionDetection,
  kanbanKeyboardCoordinates,
} from "../kanban-keyboard-coordinates";

describe("keyboard board movement", () => {
  it("skips the current column even when the card and column centers differ", () => {
    const preventDefault = vi.fn();
    const event = { code: "ArrowRight", preventDefault } as unknown as KeyboardEvent;
    const context = {
      active: "card",
      currentCoordinates: { x: 10, y: 50 },
      context: {
        active: { data: { current: { groupKey: "new" } } },
        over: null,
        collisionRect: { left: 10, top: 50, width: 280, height: 100 },
        droppableContainers: { getEnabled: () => [{ id: "new" }, { id: "qualified" }] },
        droppableRects: new Map([
          ["new", { left: 0, top: 0, width: 320, bottom: 600 }],
          ["qualified", { left: 340, top: 0, width: 320, bottom: 600 }],
        ]),
      },
    } as unknown as Parameters<KeyboardCoordinateGetter>[1];
    expect(kanbanKeyboardCoordinates(event, context)).toEqual({ x: 360, y: 50 });
    expect(preventDefault).toHaveBeenCalledOnce();
    context.context.over = { id: "qualified" } as NonNullable<typeof context.context.over>;
    context.context.collisionRect = { left: 360, top: 50, width: 280, height: 100 } as NonNullable<
      typeof context.context.collisionRect
    >;
    context.currentCoordinates = { x: 360, y: 50 };
    expect(kanbanKeyboardCoordinates({ ...event, code: "ArrowLeft" }, context)).toEqual({ x: 20, y: 50 });
  });
});

describe("board collision detection", () => {
  const rect = (left: number, width: number) => ({
    left,
    width,
    right: left + width,
    top: 0,
    bottom: 600,
    height: 600,
  });
  const detect = (center: number) =>
    kanbanCollisionDetection({
      active: { id: "card" },
      collisionRect: { ...rect(center - 165, 330), top: 100, bottom: 260, height: 160 },
      droppableContainers: [{ id: "new" }, { id: "qualified" }],
      droppableRects: new Map([
        ["new", rect(-184, 330)],
        ["qualified", rect(162, 40)],
      ]),
      pointerCoordinates: null,
    } as unknown as Parameters<CollisionDetection>[0]).map((collision) => collision.id);

  it("picks the narrow column under the card center over a wider overlapping column", () => {
    expect(detect(182)).toEqual(["qualified"]);
  });

  it("falls back to the largest overlap when no column is under the card center", () => {
    expect(detect(155)).toEqual(["new", "qualified"]);
  });
});

describe("board drop announcements", () => {
  it("names the column of the card a card is dropped on, as with manual ordering", () => {
    expect(
      dropTargetGroupKey({ id: "card:deal-7", data: { current: { groupKey: "value:won", itemId: "deal-7" } } }),
    ).toBe("value:won");
  });

  it("names the column itself when the card is dropped on a column", () => {
    expect(dropTargetGroupKey({ id: "value:lost", data: { current: undefined } })).toBe("value:lost");
  });
});
