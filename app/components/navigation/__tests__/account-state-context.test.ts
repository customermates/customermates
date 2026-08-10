import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccountStateProvider, useAccountState } from "../account-state-context";

function Probe() {
  const state = useAccountState();
  return createElement(
    "span",
    null,
    `${state.state}:${state.protectedEnhancementsAllowed}:${state.showRestrictedShell}`,
  );
}

function renderProbe(
  shell: "app" | "public" | "restricted",
  state: Parameters<typeof AccountStateProvider>[0]["state"],
) {
  return renderToStaticMarkup(createElement(AccountStateProvider, { shell, state }, createElement(Probe)));
}

describe("AccountStateProvider", () => {
  it("fails closed when a security-sensitive consumer is outside the provider", () => {
    expect(() => renderToStaticMarkup(createElement(Probe))).toThrow(
      "useAccountState must be used within an AccountStateProvider",
    );
  });

  it("allows protected enhancements only in the full allowed app shell", () => {
    expect(renderProbe("app", "allowed")).toContain("allowed:true:false");
  });

  it("suppresses protected enhancements for pre-tenant and registered blocker shells", () => {
    expect(renderProbe("public", "unregistered")).toContain("unregistered:false:false");
    expect(renderProbe("restricted", "inactive")).toContain("inactive:false:true");
  });
});
