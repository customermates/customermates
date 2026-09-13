import type { BaseFormStore } from "@/core/base/base-form.store";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NavigationGuardController } from "@/core/stores/navigation-guard.controller";

const state = vi.hoisted(() => ({
  controller: null as NavigationGuardController | null,
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ navigationGuard: state.controller }),
}));
vi.mock("../unsaved-changes-guard", () => ({
  UnsavedChangesGuard: () => null,
}));

import { NavigationGuardModal } from "../navigation-guard-modal";

let root: Root;
let container: HTMLDivElement;
let nextRouter: ReturnType<typeof vi.fn<(event: PopStateEvent) => void>>;
let store: { hasUnsavedChanges: boolean; withUnsavedChangesGuard: boolean };

async function settleHistory() {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

function dirty(value = true) {
  act(() =>
    runInAction(() => {
      store.hasUnsavedChanges = value;
    }),
  );
}

function push(page: string) {
  window.history.pushState({ __NA: true, tree: page }, "", `/wiki?page=${page}`);
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  state.controller = new NavigationGuardController();
  store = observable({
    hasUnsavedChanges: false,
    withUnsavedChangesGuard: true,
  });
  state.controller.register(store as BaseFormStore);
  window.history.replaceState({ __NA: true, tree: "A" }, "", "/wiki?page=A");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  nextRouter = vi.fn();
  window.addEventListener("popstate", nextRouter);
  act(() => root.render(createElement(NavigationGuardModal)));
});

afterEach(async () => {
  act(() => root.unmount());
  container.remove();
  window.removeEventListener("popstate", nextRouter);
  await vi.runAllTimersAsync();
  vi.useRealTimers();
});

describe("shared dirty history navigation", () => {
  it("preserves a dirty Wiki document when Back is canceled", async () => {
    push("B");
    dirty();

    window.history.back();
    await settleHistory();

    expect(state.controller?.isPending).toBe(true);
    expect(nextRouter).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?page=B");
    act(() => state.controller?.cancel());
    await settleHistory();
    expect(window.location.search).toBe("?page=B");
    expect(nextRouter).not.toHaveBeenCalled();
  });

  it("replays Back exactly once after confirmation without adding history entries", async () => {
    push("B");
    const length = window.history.length;
    dirty();
    window.history.back();
    await settleHistory();
    act(() => state.controller?.confirm());
    await settleHistory();
    expect(window.location.search).toBe("?page=A");
    expect(nextRouter).toHaveBeenCalledOnce();
    expect(window.history.length).toBe(length);
    expect(window.history.state).toMatchObject({ __NA: true, tree: "A" });
    expect(state.controller?.isPending).toBe(false);
  });

  it("guards Forward and preserves the forward entry after cancellation", async () => {
    push("B");
    window.history.back();
    await settleHistory();
    nextRouter.mockClear();
    dirty();
    window.history.forward();
    await settleHistory();
    expect(window.location.search).toBe("?page=A");
    expect(state.controller?.isPending).toBe(true);
    expect(nextRouter).not.toHaveBeenCalled();
    act(() => state.controller?.cancel());
    dirty(false);
    window.history.forward();
    await settleHistory();
    expect(window.location.search).toBe("?page=B");
    expect(nextRouter).toHaveBeenCalledOnce();
  });

  it("replays confirmed Forward with its original framework state", async () => {
    push("B");
    window.history.back();
    await settleHistory();
    nextRouter.mockClear();
    dirty();
    window.history.forward();
    await settleHistory();
    act(() => state.controller?.confirm());
    await settleHistory();
    expect(window.location.search).toBe("?page=B");
    expect(window.history.state).toMatchObject({ __NA: true, tree: "B" });
    expect(nextRouter).toHaveBeenCalledOnce();
  });

  it("restores and confirms multi-entry history traversal", async () => {
    push("B");
    push("C");
    push("D");
    dirty();
    window.history.go(-3);
    await settleHistory();
    expect(window.location.search).toBe("?page=D");
    expect(nextRouter).not.toHaveBeenCalled();
    act(() => state.controller?.confirm());
    await settleHistory();
    expect(window.location.search).toBe("?page=A");
    expect(nextRouter).toHaveBeenCalledOnce();
  });

  it("lets clean forms traverse without confirmation or duplicate router events", async () => {
    push("B");
    window.history.back();
    await settleHistory();
    expect(window.location.search).toBe("?page=A");
    expect(state.controller?.isPending).toBe(false);
    expect(nextRouter).toHaveBeenCalledOnce();
    window.history.forward();
    await settleHistory();
    expect(window.location.search).toBe("?page=B");
    expect(nextRouter).toHaveBeenCalledTimes(2);
  });

  it("does not let one approval authorize a later traversal", async () => {
    push("B");
    push("C");
    dirty();
    window.history.back();
    await settleHistory();
    act(() => state.controller?.confirm());
    await settleHistory();
    nextRouter.mockClear();
    window.history.back();
    await settleHistory();
    expect(window.location.search).toBe("?page=B");
    expect(state.controller?.isPending).toBe(true);
    expect(nextRouter).not.toHaveBeenCalled();
  });

  it("keeps replaceState metadata without treating a replacement as a new entry", async () => {
    push("B");
    const length = window.history.length;
    window.history.replaceState({ __NA: true, tree: "B-updated", custom: 42 }, "", "/wiki?page=B-updated");
    expect(window.history.length).toBe(length);
    expect(window.history.state).toMatchObject({
      __NA: true,
      tree: "B-updated",
      custom: 42,
    });
    dirty();
    window.history.back();
    await settleHistory();
    expect(window.location.search).toBe("?page=B-updated");
    expect(window.history.state).toMatchObject({
      tree: "B-updated",
      custom: 42,
    });
    expect(state.controller?.isPending).toBe(true);
  });

  it("does not advance its position when a push fails", async () => {
    expect(() => window.history.pushState({}, "", "https://foreign.example/page")).toThrow();
    push("B");
    dirty();
    window.history.back();
    await settleHistory();
    expect(window.location.search).toBe("?page=B");
    expect(state.controller?.isPending).toBe(true);
  });

  it("releases the guard when its owner unmounts", async () => {
    push("B");
    dirty();
    act(() => root.render(null));
    window.history.back();
    await settleHistory();
    expect(window.location.search).toBe("?page=A");
    expect(nextRouter).toHaveBeenCalledOnce();
  });

  it("reuses one adapter after unmount and remount", async () => {
    push("B");
    act(() => root.render(null));
    act(() => root.render(createElement(NavigationGuardModal)));
    dirty();
    window.history.back();
    await settleHistory();
    expect(window.location.search).toBe("?page=B");
    expect(state.controller?.isPending).toBe(true);
    expect(nextRouter).not.toHaveBeenCalled();
  });

  it("keeps the document when repeated Back presses arrive before restoration settles", async () => {
    push("B");
    push("C");
    dirty();
    window.history.back();
    window.history.back();
    await settleHistory();
    expect(window.location.search).toBe("?page=C");
    expect(state.controller?.isPending).toBe(true);
    expect(nextRouter).not.toHaveBeenCalled();
    act(() => state.controller?.cancel());
  });

  it("keeps repeated Back attempts guarded while the confirmation is already open", async () => {
    push("B");
    push("C");
    dirty();
    window.history.back();
    await settleHistory();
    window.history.back();
    await settleHistory();
    expect(window.location.search).toBe("?page=C");
    expect(state.controller?.isPending).toBe(true);
    expect(nextRouter).not.toHaveBeenCalled();
    act(() => state.controller?.confirm());
    await settleHistory();
    expect(window.location.search).toBe("?page=B");
    expect(nextRouter).toHaveBeenCalledOnce();
  });

  it("keeps history state through an additional framework history wrapper", async () => {
    const pushState = window.history.pushState.bind(window.history);
    const replaceState = window.history.replaceState.bind(window.history);
    window.history.pushState = function (data, unused, url) {
      return pushState.call(this, { ...data, __PRIVATE_NEXTJS_INTERNALS_TREE: "tree" }, unused, url);
    };
    window.history.replaceState = function (data, unused, url) {
      return replaceState.call(this, { ...data, __PRIVATE_NEXTJS_INTERNALS_TREE: "tree" }, unused, url);
    };
    try {
      push("B");
      window.history.replaceState(null, "", "/wiki?page=B-updated");
      dirty();
      window.history.back();
      await settleHistory();
      expect(window.location.search).toBe("?page=B-updated");
      expect(window.history.state).toMatchObject({
        __PRIVATE_NEXTJS_INTERNALS_TREE: "tree",
      });
      expect(state.controller?.isPending).toBe(true);
      expect(nextRouter).not.toHaveBeenCalled();
    } finally {
      window.history.pushState = pushState;
      window.history.replaceState = replaceState;
    }
  });
});
