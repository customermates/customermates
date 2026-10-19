import { describe, expect, it, vi } from "vitest";

import { SyncStaleWikiSectionsInteractor } from "../sync-stale-wiki-sections.interactor";

const vanished = (code: string) => Object.assign(new Error("Row vanished"), { code });

describe("syncing stale Knowledge Base sections", () => {
  it("skips a workspace deleted during the sync and goes on with the next one", async () => {
    const repo = {
      findCompaniesWithStaleSectionsUnscoped: vi.fn(() => Promise.resolve(["deleted", "gone", "kept"])),
      syncStaleSectionsUnscoped: vi.fn((companyId: string) => {
        if (companyId === "deleted") return Promise.reject(vanished("P2003"));
        if (companyId === "gone") return Promise.reject(vanished("P2025"));
        return Promise.resolve({ synced: 3, remaining: false });
      }),
    };

    const result = await new SyncStaleWikiSectionsInteractor(repo).invoke();

    expect(result).toEqual({ synced: 3, companies: 3, remaining: true });
    expect(repo.syncStaleSectionsUnscoped).toHaveBeenLastCalledWith("kept", expect.any(Number));
  });

  it("still fails on an unexpected error", async () => {
    const repo = {
      findCompaniesWithStaleSectionsUnscoped: vi.fn(() => Promise.resolve(["broken"])),
      syncStaleSectionsUnscoped: vi.fn(() => Promise.reject(new Error("disk full"))),
    };

    await expect(new SyncStaleWikiSectionsInteractor(repo).invoke()).rejects.toThrow("disk full");
  });
});
