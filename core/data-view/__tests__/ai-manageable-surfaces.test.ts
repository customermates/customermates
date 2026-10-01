import { describe, expect, it } from "vitest";

import {
  AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS,
  OPERATOR_DATA_VIEW_SURFACE_KEYS,
  isAiManageableDataViewSurface,
} from "../ai-manageable-surfaces";
import { DATA_VIEW_SURFACE_KEYS, SURFACE } from "../data-view-keys";

describe("AI-manageable data-view surfaces", () => {
  it("keeps operator-console views outside hosted and MCP view management", () => {
    expect(OPERATOR_DATA_VIEW_SURFACE_KEYS).toEqual([
      SURFACE.operatorUsers,
      SURFACE.operatorWorkspaces,
      SURFACE.operatorAudit,
    ]);
    expect(AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS).toEqual(
      DATA_VIEW_SURFACE_KEYS.filter(
        (surfaceKey) =>
          !OPERATOR_DATA_VIEW_SURFACE_KEYS.includes(surfaceKey as never) &&
          ![SURFACE.contacts, SURFACE.organizations, SURFACE.deals, SURFACE.services, SURFACE.tasks].includes(
            surfaceKey as never,
          ),
      ),
    );
    for (const surfaceKey of OPERATOR_DATA_VIEW_SURFACE_KEYS)
      expect(isAiManageableDataViewSurface(surfaceKey)).toBe(false);
    expect(isAiManageableDataViewSurface(SURFACE.contacts)).toBe(false);
    expect(isAiManageableDataViewSurface("records:10000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isAiManageableDataViewSurface(SURFACE.entityTimeline)).toBe(true);
  });
});
