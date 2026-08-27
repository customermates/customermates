import { act } from "react";
import { jsx } from "react/jsx-runtime";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useActivityGroupState } from "../use-activity-group-state";

let container: HTMLDivElement;
let root: Root;

type GroupState = ReturnType<typeof useActivityGroupState>;
type GroupInput = { hasRunning: boolean; hasError: boolean; isWorking: boolean; startedAt?: Date };

const observed = { current: null as GroupState | null };

function Probe(props: GroupInput) {
  observed.current = useActivityGroupState(props);
  return null;
}

function render(props: GroupInput) {
  act(() => {
    root.render(jsx(Probe, props));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-19T10:00:00.000Z"));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  observed.current = null;
  vi.useRealTimers();
});

describe("useActivityGroupState", () => {
  it("accumulates the whole group's duration instead of restarting each step", () => {
    render({ hasError: false, hasRunning: true, isWorking: true });

    vi.setSystemTime(new Date("2026-08-19T10:00:04.000Z"));
    render({ hasError: false, hasRunning: false, isWorking: true });
    expect(observed.current?.elapsedSeconds).toBe(4);

    vi.setSystemTime(new Date("2026-08-19T10:00:06.000Z"));
    render({ hasError: false, hasRunning: true, isWorking: true });

    vi.setSystemTime(new Date("2026-08-19T10:00:15.000Z"));
    render({ hasError: false, hasRunning: false, isWorking: true });

    expect(observed.current?.elapsedSeconds).toBe(15);
  });

  it("measures from the group's first activity so a remount cannot restart the clock", () => {
    vi.setSystemTime(new Date("2026-08-19T10:00:20.000Z"));
    render({
      hasError: false,
      hasRunning: true,
      isWorking: true,
      startedAt: new Date("2026-08-19T10:00:05.000Z"),
    });

    vi.setSystemTime(new Date("2026-08-19T10:00:25.000Z"));
    render({
      hasError: false,
      hasRunning: false,
      isWorking: true,
      startedAt: new Date("2026-08-19T10:00:05.000Z"),
    });

    expect(observed.current?.elapsedSeconds).toBe(20);
  });

  it("stays open between steps and collapses only once the turn ends", () => {
    render({ hasError: false, hasRunning: true, isWorking: true });
    expect(observed.current?.open).toBe(true);

    render({ hasError: false, hasRunning: false, isWorking: true });
    expect(observed.current?.open).toBe(true);

    render({ hasError: false, hasRunning: true, isWorking: true });
    expect(observed.current?.open).toBe(true);

    render({ hasError: false, hasRunning: false, isWorking: false });
    expect(observed.current?.open).toBe(false);
  });

  it("keeps a failed group open after the turn ends", () => {
    render({ hasError: false, hasRunning: true, isWorking: true });
    render({ hasError: true, hasRunning: false, isWorking: false });

    expect(observed.current?.open).toBe(true);
  });

  it("never reports a duration for a group that mounts already settled", () => {
    render({ hasError: false, hasRunning: false, isWorking: false });

    expect(observed.current?.elapsedSeconds).toBeNull();
    expect(observed.current?.open).toBe(false);
  });
});
