import { describe, expect, it, vi } from "vitest";

const COMPANY = "company-1";
const VIEWER = "user-viewer";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@/prisma/db", () => ({ prisma: { connectedAccount: { findFirst } } }));
vi.mock("@/core/di", () => ({}));

const { runWithTenant } = await import("@/core/decorators/tenant-context");
const { PrismaConnectedAccountRepo } = await import("../prisma-connected-account.repository");

const asViewer = <T>(fn: () => Promise<T>) =>
  runWithTenant({ id: VIEWER, companyId: COMPANY, role: "member" } as never, fn);

describe("findFolderContextById access scope", () => {
  it("never scopes on company alone, so a colleague's private mailbox stays private", async () => {
    findFirst.mockResolvedValueOnce(null);
    await asViewer(() => new PrismaConnectedAccountRepo().findFolderContextById("someone-elses-account"));

    const where = findFirst.mock.calls.at(-1)?.[0].where;

    expect(where.companyId).toBe(COMPANY);
    expect(where.OR, `folder context scoped by company alone: ${JSON.stringify(where)}`).toEqual([
      { userId: VIEWER },
      { shared: true },
    ]);
  });

  it("returns nothing when the account is not accessible to the viewer", async () => {
    findFirst.mockResolvedValueOnce(null);

    await expect(asViewer(() => new PrismaConnectedAccountRepo().findFolderContextById("hidden"))).resolves.toBeNull();
  });
});
