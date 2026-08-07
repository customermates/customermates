import { describe, expect, it } from "vitest";

import { WORKSPACE_SECTIONS } from "../workspace-sections";

describe("WORKSPACE_SECTIONS", () => {
  it("keeps API and connectors last in the Profile navigation", () => {
    expect(WORKSPACE_SECTIONS.profile.map(({ slug }) => slug)).toEqual(["settings", "connected-accounts", "api-keys"]);
  });
});
