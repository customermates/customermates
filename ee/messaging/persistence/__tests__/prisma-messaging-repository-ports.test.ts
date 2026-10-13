import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_PRISMA_DB_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

const { PrismaMessagingRepo } = await import("../prisma-messaging.repository");

describe("messaging repository collaborators", () => {
  it("reads inbox filter options from the injected connected account port", async () => {
    const options = {
      accounts: [{ value: "account-1", label: "Sales inbox" }],
      folders: [{ value: "folder-1", label: "Inbox" }],
    };
    const filterOptions = { listInboxFilterOptions: vi.fn().mockResolvedValue(options) };
    const repo = new PrismaMessagingRepo(undefined, undefined, undefined, filterOptions);

    const fields = await repo.getFilterableFields();

    expect(filterOptions.listInboxFilterOptions).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(fields)).toContain("Sales inbox");
    expect(JSON.stringify(fields)).toContain("folder-1");
  });

  it("refuses to read filter options when no connected account port is configured", async () => {
    await expect(new PrismaMessagingRepo().getFilterableFields()).rejects.toThrow(
      "Messaging inbox filter options are not configured",
    );
  });
});
