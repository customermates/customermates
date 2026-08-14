import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProtectedEnhancementsProvider, useProtectedEnhancementsAllowed } from "../protected-enhancements-context";

function Probe() {
  return createElement("span", null, String(useProtectedEnhancementsAllowed()));
}

function renderProbe(allowed: boolean) {
  return renderToStaticMarkup(createElement(ProtectedEnhancementsProvider, { allowed }, createElement(Probe)));
}

describe("ProtectedEnhancementsProvider", () => {
  it("fails closed when a security-sensitive consumer is outside the provider", () => {
    expect(() => renderToStaticMarkup(createElement(Probe))).toThrow(
      "useProtectedEnhancementsAllowed must be used within a ProtectedEnhancementsProvider",
    );
  });

  it("allows protected enhancements only when the navigation boundary explicitly permits them", () => {
    expect(renderProbe(true)).toContain("true");
    expect(renderProbe(false)).toContain("false");
  });
});
