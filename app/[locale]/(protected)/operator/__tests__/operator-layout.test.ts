import { renderToStaticMarkup } from "react-dom/server";
import { jsx } from "react/jsx-runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  consoleEnabled: true,
  notFound: vi.fn((): never => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
  visibility: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("next/navigation", () => ({ notFound: state.notFound }));
vi.mock("@/components/shared/page-container", () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) =>
    jsx("section", { "data-page-container": true, children }),
}));
vi.mock("@/core/di", () => ({
  getOperatorConsoleVisibilityInteractor: () => ({ invoke: state.visibility }),
}));
vi.mock("@/env", () => ({
  env: {
    get OPERATOR_CONSOLE_ENABLED() {
      return state.consoleEnabled;
    },
  },
}));
vi.mock("../operator-navigation", () => ({
  OperatorNavigation: () => jsx("nav", { "data-operator-navigation": true }),
}));

import OperatorLayout from "../layout";

beforeEach(() => {
  state.consoleEnabled = true;
  state.notFound.mockClear();
  state.visibility.mockClear();
  state.visibility.mockResolvedValue(true);
});

describe("OperatorLayout access boundary", () => {
  it("returns Next's 404 before reading operator state when the console is disabled", async () => {
    state.consoleEnabled = false;

    await expect(OperatorLayout({ children: "operator content" })).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");

    expect(state.visibility).not.toHaveBeenCalled();
    expect(state.notFound).toHaveBeenCalledOnce();
  });

  it("returns Next's 404 without rendering the operator shell for an ordinary user", async () => {
    state.visibility.mockResolvedValue(false);

    await expect(OperatorLayout({ children: "operator content" })).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");

    expect(state.visibility).toHaveBeenCalledOnce();
    expect(state.notFound).toHaveBeenCalledOnce();
  });

  it("renders operator content in the platform page container after the persisted access check passes", async () => {
    const element = await OperatorLayout({ children: jsx("main", { children: "operator content" }) });
    const html = renderToStaticMarkup(element);

    expect(state.visibility).toHaveBeenCalledOnce();
    expect(state.notFound).not.toHaveBeenCalled();
    expect(html).toContain("data-page-container");
    expect(html).toContain("data-operator-navigation");
    expect(html).toContain("operator content");
    expect(html).not.toContain("header");
  });
});
