import { afterEach, describe, expect, it, vi } from "vitest";

import { refreshAccountStateWhenVisible } from "../account-state-refresh";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("refreshAccountStateWhenVisible", () => {
  it("revalidates a cached root layout when a background tab becomes visible", () => {
    const refresh = vi.fn();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    const unregister = refreshAccountStateWhenVisible(refresh);

    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).not.toHaveBeenCalled();

    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledOnce();

    unregister();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
