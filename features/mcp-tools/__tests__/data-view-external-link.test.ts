import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({ getManageDataViewsInteractor: () => ({ invoke }) }));
vi.mock("../mcp-workspace-slug", () => ({ mcpWorkspaceSlug: () => Promise.resolve("acme") }));

import { manageDataViewsTool } from "../data-view.mcp-tools";

const VIEW_ID = "30000000-0000-4000-8000-000000000001";
const TYPE_ID = "60000000-0000-4000-8000-000000000002";

describe("manage_data_views links for external MCP clients", () => {
  it("returns an absolute link into the authenticated request's workspace", async () => {
    invoke.mockResolvedValue({ ok: true, data: { viewKey: VIEW_ID, link: `/records/${TYPE_ID}?view=${VIEW_ID}` } });
    const result = await manageDataViewsTool.execute(
      { action: "select", surfaceKey: "dashboard", viewKey: VIEW_ID },
      {
        requestId: 1,
      },
    );
    expect(result).toMatchObject({
      structuredContent: { link: `${MOCK_ENV_MODULE.env.BASE_URL}/w/acme/records/${TYPE_ID}?view=${VIEW_ID}` },
    });
  });

  it("keeps the relative link for the in-app assistant", async () => {
    invoke.mockResolvedValue({ ok: true, data: { viewKey: VIEW_ID, link: `/records/${TYPE_ID}?view=${VIEW_ID}` } });
    const result = await manageDataViewsTool.execute({ action: "select", surfaceKey: "dashboard", viewKey: VIEW_ID });
    expect(result).toMatchObject({ structuredContent: { link: `/records/${TYPE_ID}?view=${VIEW_ID}` } });
  });
});
