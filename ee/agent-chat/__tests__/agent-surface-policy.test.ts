import { describe, expect, it } from "vitest";

import {
  AGENT_APPROVAL_WINDOW_MS,
  approvalWindowMsForSurface,
  isUnattendedSurface,
} from "@/ee/agent-chat/agent-surface-policy";

describe("agent surface policy", () => {
  it("gives a routine run no approval window so a gated tool declines instead of holding the lease", () => {
    expect(approvalWindowMsForSurface("routine")).toBe(0);
  });

  it("keeps the full approval window for an interactive chat", () => {
    expect(approvalWindowMsForSurface("chat")).toBe(AGENT_APPROVAL_WINDOW_MS);
    expect(AGENT_APPROVAL_WINDOW_MS).toBeGreaterThan(0);
  });

  it("treats only a routine as unattended, so panel tools stay available in chat", () => {
    expect(isUnattendedSurface("routine")).toBe(true);
    expect(isUnattendedSurface("chat")).toBe(false);
  });
});
