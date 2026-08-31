import { renderToStaticMarkup } from "react-dom/server";
import { jsx } from "react/jsx-runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  notFound: vi.fn((): never => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
  visibility: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("next/navigation", () => ({ notFound: state.notFound }));
vi.mock("@/core/di", () => ({
  getGetOperatorConsoleVisibilityInteractor: () => ({ invoke: state.visibility }),
}));
import OperatorLayout from "../layout";

beforeEach(() => {
  state.notFound.mockClear();
  state.visibility.mockClear();
  state.visibility.mockResolvedValue(true);
});

describe("OperatorLayout access boundary", () => {
  it("returns Next's 404 without rendering the operator shell for an ordinary user", async () => {
    state.visibility.mockResolvedValue(false);

    await expect(OperatorLayout({ children: "operator content" })).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");

    expect(state.visibility).toHaveBeenCalledOnce();
    expect(state.notFound).toHaveBeenCalledOnce();
  });

  it("renders operator content without a chrome of its own after the persisted access check passes", async () => {
    const element = await OperatorLayout({ children: jsx("main", { children: "operator content" }) });
    const html = renderToStaticMarkup(element);

    expect(state.visibility).toHaveBeenCalledOnce();
    expect(state.notFound).not.toHaveBeenCalled();
    expect(html).toContain("operator content");
    expect(html).not.toContain("header");
  });
});
