import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  report: vi.fn(),
  toast: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/app/actions", () => ({ upsertP13nAction: mocks.upsert }));
vi.mock("@/core/errors/report-application-error", () => ({
  reportApplicationError: mocks.report,
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({
  toastZodErrorTree: mocks.toast,
}));

import { resetP13nColumnWidthPersistenceForTests, useP13nColumnWidths } from "../use-p13n-column-widths";

const roots: Root[] = [];
const containers: HTMLElement[] = [];

function Harness({
  initial = {},
  p13nId = "wiki-layout",
  scope = "user-1",
}: {
  initial?: Record<string, number>;
  p13nId?: string | null;
  scope?: string;
}) {
  const { columnWidths, commitColumnWidths } = useP13nColumnWidths({
    initial,
    p13nId: p13nId ?? undefined,
    persistenceScope: scope,
  });

  return createElement(
    "button",
    {
      "data-widths": JSON.stringify(columnWidths),
      onClick: () =>
        commitColumnWidths((current) => ({
          ...current,
          pages: (current.pages ?? 200) + 20,
        })),
    },
    "Resize",
  );
}

async function mount(node: ReturnType<typeof createElement>) {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(node);
    await Promise.resolve();
  });
  return { container, root };
}

async function flushPersistence() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.upsert.mockResolvedValue({
    ok: true,
    data: { p13nId: "wiki-layout", columnWidths: {} },
  });
});

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
    await Promise.resolve();
    await Promise.resolve();
  });
  for (const container of containers.splice(0)) container.remove();
  resetP13nColumnWidthPersistenceForTests();
  vi.clearAllMocks();
});

describe("useP13nColumnWidths", () => {
  it("updates immediately in the UI and starts persistence", async () => {
    const { container } = await mount(createElement(Harness, { initial: { pages: 220 } }));
    const button = container.querySelector<HTMLButtonElement>("button");

    await act(async () => {
      button?.click();
      await Promise.resolve();
    });

    expect(button?.dataset.widths).toBe('{"pages":240}');
    expect(mocks.upsert).toHaveBeenCalledExactlyOnceWith({
      p13nId: "wiki-layout",
      columnWidths: { pages: 240 },
    });
  });

  it("coalesces repeated immediate commits while persistence is in flight", async () => {
    let resolveFirst = () => {};
    mocks.upsert.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = () =>
            resolve({
              ok: true,
              data: { p13nId: "wiki-layout", columnWidths: {} },
            });
        }),
    );
    const { container } = await mount(createElement(Harness, {}));
    const button = container.querySelector<HTMLButtonElement>("button");

    await act(async () => {
      button?.click();
      await Promise.resolve();
    });
    act(() => {
      button?.click();
      button?.click();
    });
    expect(mocks.upsert).toHaveBeenCalledOnce();

    await act(async () => {
      resolveFirst();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert).toHaveBeenLastCalledWith({
      p13nId: "wiki-layout",
      columnWidths: { pages: 260 },
    });
  });

  it("reattaches the latest layout only inside the same user and surface scope", async () => {
    const first = await mount(createElement(Harness, { initial: { pages: 220 } }));
    act(() => first.container.querySelector<HTMLButtonElement>("button")?.click());

    const same = await mount(createElement(Harness, { initial: { pages: 100 } }));
    const other = await mount(createElement(Harness, { initial: { pages: 100 }, scope: "user-2" }));
    const otherSurface = await mount(
      createElement(Harness, {
        initial: { pages: 120 },
        p13nId: "entity-layout",
      }),
    );

    expect(same.container.querySelector("button")?.getAttribute("data-widths")).toBe('{"pages":240}');
    expect(other.container.querySelector("button")?.getAttribute("data-widths")).toBe('{"pages":100}');
    expect(otherSurface.container.querySelector("button")?.getAttribute("data-widths")).toBe('{"pages":120}');
  });

  it("keeps read-only layouts local when no p13n id is available", async () => {
    const { container } = await mount(
      createElement(Harness, {
        initial: { pages: 220 },
        p13nId: null,
      }),
    );

    act(() => container.querySelector<HTMLButtonElement>("button")?.click());
    await flushPersistence();

    expect(container.querySelector("button")?.getAttribute("data-widths")).toBe('{"pages":240}');
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("reports validation failures without losing the local layout", async () => {
    mocks.upsert.mockResolvedValueOnce({
      ok: false,
      error: { formErrors: ["Invalid layout"], fieldErrors: {} },
    });
    const { container } = await mount(createElement(Harness, {}));

    act(() => container.querySelector<HTMLButtonElement>("button")?.click());
    await flushPersistence();

    expect(mocks.toast).toHaveBeenCalledOnce();
    expect(container.querySelector("button")?.getAttribute("data-widths")).toBe('{"pages":220}');
  });

  it("reports rejected persistence without losing the local layout", async () => {
    const error = new Error("offline");
    mocks.upsert.mockRejectedValueOnce(error);
    const { container } = await mount(createElement(Harness, {}));

    act(() => container.querySelector<HTMLButtonElement>("button")?.click());
    await flushPersistence();

    expect(mocks.report).toHaveBeenCalledExactlyOnceWith(error);
    expect(container.querySelector("button")?.getAttribute("data-widths")).toBe('{"pages":220}');
  });
});
