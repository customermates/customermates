import { describe, it, expect, vi, beforeEach } from "vitest";
import { mcpToolResultText } from "../mcp-tool";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

const spies = vi.hoisted(() => ({
  updateManyContacts: vi.fn(),
  getContactById: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getUpdateManyContactsInteractor: () => ({ invoke: spies.updateManyContacts }),
  getGetContactByIdInteractor: () => ({ invoke: spies.getContactById }),
}));

import { getRecordsTool, updateRecordNotesTool } from "../entity-generic.mcp-tools";

const CONTACT_ID = "00000000-0000-4000-8000-000000000001";
const NOTES_MD =
  "| Name | Role |\n| --- | --- |\n| Ada | **CTO** |\n| Bo | Eng |\n\n![logo](https://example.com/y.png)";

beforeEach(() => vi.clearAllMocks());

describe("MCP notes round-trip for tables and images (regression for CUSTOMERMATES-3P)", () => {
  it("parses table/image markdown on write and serializes it back on read without crashing", async () => {
    let capturedNotes: unknown;
    spies.updateManyContacts.mockImplementation((args: { contacts: { id: string; notes: unknown }[] }) => {
      capturedNotes = args.contacts[0].notes;
      return Promise.resolve({ ok: true, data: {} });
    });

    const writeResult = await updateRecordNotesTool.execute(
      updateRecordNotesTool.inputSchema.parse({
        entity: "contact",
        mode: "replace",
        items: [{ id: CONTACT_ID, notes: NOTES_MD }],
      }),
    );

    expect(typeof mcpToolResultText(writeResult)).toBe("string");
    expect(spies.updateManyContacts).toHaveBeenCalledTimes(1);

    const capturedJson = JSON.stringify(capturedNotes);
    expect(capturedJson).toContain('"table"');
    expect(capturedJson).toContain('"image"');

    spies.getContactById.mockResolvedValue({ ok: true, data: { contact: { id: CONTACT_ID, notes: capturedNotes } } });

    const readResult = await getRecordsTool.execute(
      getRecordsTool.inputSchema.parse({ items: [{ entity: "contact", id: CONTACT_ID, include: "withNotes" }] }),
    );

    expect(typeof mcpToolResultText(readResult)).toBe("string");
    expect(mcpToolResultText(readResult)).toContain("| Name | Role |");
    expect(mcpToolResultText(readResult)).toContain("**CTO**");
    expect(mcpToolResultText(readResult)).toContain("![logo](https://example.com/y.png)");
  });
});
