import { describe, it, expect, vi, beforeEach } from "vitest";
import { mcpToolResultText } from "../mcp-tool";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

const spies = vi.hoisted(() => ({
  searchSalesNavigator: vi.fn(),
  searchSalesPeople: vi.fn(),
  browseSalesList: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getLinkedinSearchSalesNavigatorInteractor: () => ({ invoke: spies.searchSalesNavigator }),
  getLinkedinSearchSalesPeopleInteractor: () => ({ invoke: spies.searchSalesPeople }),
  getLinkedinSearchSalesCompaniesInteractor: () => ({ invoke: vi.fn() }),
  getLinkedinListSalesSearchParametersInteractor: () => ({ invoke: vi.fn() }),
  getLinkedinListSalesListsInteractor: () => ({ invoke: vi.fn() }),
  getLinkedinBrowseSalesListInteractor: () => ({ invoke: spies.browseSalesList }),
  getLinkedinSaveToSalesListInteractor: () => ({ invoke: vi.fn() }),
}));

import { manageSalesListsTool, searchSalesCompaniesTool, searchSalesLeadsTool } from "../sales-navigator.mcp-tools";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const SEARCH_URL = "https://www.linkedin.com/sales/search/people?query=test";

function runLeadSearch(args: Record<string, unknown>) {
  return searchSalesLeadsTool.execute(searchSalesLeadsTool.inputSchema.parse(args));
}

function leadResult(item: Record<string, unknown>) {
  return { ok: true as const, data: { data: [item], total_count: 1 } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("linkedin_search_sales_leads lead rows", () => {
  it("documents the explicit company-profile handoff", () => {
    expect(searchSalesLeadsTool.description).toContain("get_social_profile and profileType=company");
    expect(searchSalesLeadsTool.description).toContain(
      "linkedin_search_sales_leads.items[].current_positions[].company_id",
    );
    expect(searchSalesCompaniesTool.description).toContain("get_social_profile and profileType=company");
    expect(searchSalesCompaniesTool.description).toContain("items[].id");
    expect(manageSalesListsTool.description).toContain("get_social_profile with profileType=company");
    expect(manageSalesListsTool.description).toContain(
      "linkedin_search_sales_leads.items[].id or get_social_profile.id",
    );
    expect(manageSalesListsTool.description).toContain("linkedin_search_sales_companies.items[].id");
    expect(manageSalesListsTool.description).toContain("get_messaging_threads.items[].participants[].identifier");
    expect(manageSalesListsTool.description).toContain("get_messaging_threads.thread.participants[].identifier");
  });

  it("includes current_positions with company, role and company identifiers", async () => {
    spies.searchSalesNavigator.mockResolvedValue(
      leadResult({
        id: "1",
        has_been_saved: true,
        current_positions: [
          {
            company: "Acme",
            role: "CEO",
            company_id: "acme-123",
            company_url: "https://www.linkedin.com/company/acme",
          },
        ],
      }),
    );

    const output = await runLeadSearch({ connectedAccountId: ACCOUNT_ID, url: SEARCH_URL });

    expect(mcpToolResultText(output)).toContain("current_positions");
    expect(mcpToolResultText(output)).toContain("Acme");
    expect(mcpToolResultText(output)).toContain("CEO");
    expect(mcpToolResultText(output)).toContain("acme-123");
    expect(mcpToolResultText(output)).toContain("linkedin.com/company/acme");
    expect(mcpToolResultText(output)).toContain("has_been_saved");
  });

  it("omits current_positions when the provider sends none", async () => {
    spies.searchSalesNavigator.mockResolvedValue(leadResult({ id: "1", current_positions: null }));

    const output = await runLeadSearch({ connectedAccountId: ACCOUNT_ID, url: SEARCH_URL });

    expect(mcpToolResultText(output)).not.toContain("current_positions");
  });

  it("omits current_positions when every entry is empty", async () => {
    spies.searchSalesNavigator.mockResolvedValue(
      leadResult({ id: "1", current_positions: [{ company: null, role: null }] }),
    );

    const output = await runLeadSearch({ connectedAccountId: ACCOUNT_ID, url: SEARCH_URL });

    expect(mcpToolResultText(output)).not.toContain("current_positions");
  });
});

describe("linkedin_manage_sales_lists browse rows", () => {
  it("keeps the established public MCP save input backwards compatible", () => {
    expect(
      manageSalesListsTool.inputSchema.parse({
        action: "save",
        connectedAccountId: ACCOUNT_ID,
        listId: "list-1",
        providerId: "lead-1",
      }),
    ).toMatchObject({ action: "save", listId: "list-1", providerId: "lead-1" });
  });

  it("rejects browse and save calls missing their operational ids before execution", () => {
    expect(() => manageSalesListsTool.inputSchema.parse({ action: "browse", connectedAccountId: ACCOUNT_ID })).toThrow(
      /listId/,
    );
    expect(() =>
      manageSalesListsTool.inputSchema.parse({
        action: "save",
        connectedAccountId: ACCOUNT_ID,
        listId: "list-1",
      }),
    ).toThrow(/providerId/);
  });

  it("maps the browse wire shape work_experience into current_positions", async () => {
    spies.browseSalesList.mockResolvedValue(
      leadResult({
        id: "1",
        member_id: "326109300",
        work_experience: [
          {
            company: {
              name: "Globex",
              id: "globex-9",
              public_identifier: "globex",
              profile_url: "https://www.linkedin.com/company/globex",
            },
            job_title: "CTO",
          },
          { company: { name: "OldCorp", id: "old-1" }, job_title: "Intern", ended_on: "01/01/2020" },
        ],
      }),
    );

    const output = await manageSalesListsTool.execute(
      manageSalesListsTool.inputSchema.parse({ action: "browse", connectedAccountId: ACCOUNT_ID, listId: "list-1" }),
    );

    expect(mcpToolResultText(output)).toContain("current_positions");
    expect(mcpToolResultText(output)).toContain("Globex");
    expect(mcpToolResultText(output)).toContain("globex-9");
    expect(mcpToolResultText(output)).toContain("CTO");
    expect(mcpToolResultText(output)).not.toContain("member_id");
    expect(mcpToolResultText(output)).not.toContain("326109300");
    expect(mcpToolResultText(output)).not.toContain("OldCorp");
  });
});
