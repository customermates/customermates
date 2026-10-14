import { describe, expect, it } from "vitest";

import { isAllowedInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

import { GetInvitationLinkInteractor } from "../get-invitation-link.interactor";

describe("invitation link demo-mode policy", () => {
  it("refuses the REST and MCP invitation link in demo mode because it writes an invite token", () => {
    expect(isAllowedInDemoMode(GetInvitationLinkInteractor)).toBe(false);
  });
});
