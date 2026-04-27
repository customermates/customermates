import { describe, it, expect, beforeEach, vi } from "vitest";

import type { BaseFormStore } from "@/core/base/base-form.store";

import { NavigationGuardController } from "../navigation-guard.controller";

function makeStore(opts: { dirty?: boolean; guardEnabled?: boolean } = {}): BaseFormStore {
  return {
    hasUnsavedChanges: opts.dirty ?? false,
    withUnsavedChangesGuard: opts.guardEnabled ?? true,
  } as unknown as BaseFormStore;
}

describe("NavigationGuardController", () => {
  let controller: NavigationGuardController;

  beforeEach(() => {
    controller = new NavigationGuardController();
  });

  it("runs navigate immediately when no stores are registered", () => {
    const navigate = vi.fn();
    const result = controller.tryNavigate(navigate);

    expect(result).toBe(true);
    expect(navigate).toHaveBeenCalledOnce();
    expect(controller.isPending).toBe(false);
  });

  it("runs navigate immediately when registered stores are clean", () => {
    controller.register(makeStore({ dirty: false }));
    const navigate = vi.fn();

    expect(controller.tryNavigate(navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledOnce();
    expect(controller.isGuarding).toBe(false);
  });

  it("captures the navigation and surfaces the modal when any registered store is dirty", () => {
    controller.register(makeStore({ dirty: true }));
    const navigate = vi.fn();

    expect(controller.tryNavigate(navigate)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(controller.isGuarding).toBe(true);
    expect(controller.isPending).toBe(true);
  });

  it("ignores stores that have opted out via withUnsavedChangesGuard=false", () => {
    controller.register(makeStore({ dirty: true, guardEnabled: false }));
    const navigate = vi.fn();

    expect(controller.tryNavigate(navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledOnce();
    expect(controller.isGuarding).toBe(false);
  });

  it("guards if any one registered store is dirty (multi-store)", () => {
    controller.register(makeStore({ dirty: false }));
    controller.register(makeStore({ dirty: true }));
    controller.register(makeStore({ dirty: false }));

    expect(controller.isGuarding).toBe(true);
  });

  it("confirm() runs the captured navigation and clears pending state", () => {
    controller.register(makeStore({ dirty: true }));
    const navigate = vi.fn();
    controller.tryNavigate(navigate);

    controller.confirm();

    expect(navigate).toHaveBeenCalledOnce();
    expect(controller.pendingNavigation).toBeNull();
  });

  it("confirm() bypasses guards while running so wrapped routers don't recurse", () => {
    controller.register(makeStore({ dirty: true }));

    let recursionResult: boolean | null = null;
    const innerNavigate = vi.fn();
    const outerNavigate = vi.fn(() => {
      // Simulate a wrapped useRouter calling tryNavigate from inside the navigate fn.
      recursionResult = controller.tryNavigate(innerNavigate);
    });

    controller.tryNavigate(outerNavigate);
    controller.confirm();

    expect(outerNavigate).toHaveBeenCalledOnce();
    expect(innerNavigate).toHaveBeenCalledOnce();
    expect(recursionResult).toBe(true);
  });

  it("cancel() clears the captured navigation without running it", () => {
    controller.register(makeStore({ dirty: true }));
    const navigate = vi.fn();
    controller.tryNavigate(navigate);

    controller.cancel();

    expect(navigate).not.toHaveBeenCalled();
    expect(controller.pendingNavigation).toBeNull();
    expect(controller.isPending).toBe(false);
  });

  it("unregister() removes the store from the guard set", () => {
    const store = makeStore({ dirty: true });
    controller.register(store);
    expect(controller.isGuarding).toBe(true);

    controller.unregister(store);
    expect(controller.isGuarding).toBe(false);
  });

  it("confirm() is a no-op when nothing is pending", () => {
    controller.register(makeStore({ dirty: true }));

    expect(() => controller.confirm()).not.toThrow();
    expect(controller.pendingNavigation).toBeNull();
  });
});
