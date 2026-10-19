import { describe, expect, it, vi } from "vitest";

import type { WorkspaceSetupPatch, WorkspaceSetupRecord } from "../workspace-setup.schema";

import { SETUP_SENT_NOTICES_ARTIFACT, notifyWorkspaceSetupOnce } from "../workspace-setup-notice-marker";

vi.mock("../workspace-setup-notifier", () => ({
  dueSetupNotice: (setup: { status: string }, stage: string) =>
    setup.status === "failed" && stage === "build"
      ? "workspaceFailed"
      : setup.status === "planned" && stage === "plan"
        ? "planReady"
        : null,
}));

function repoWith(setup: Partial<WorkspaceSetupRecord>, deleting = false) {
  const store = { setup: { artifacts: {}, planRevision: 1, finishedAt: null, ...setup } as WorkspaceSetupRecord };
  return {
    store,
    workspaceDeleting: vi.fn(() => Promise.resolve(deleting)),
    mutate: vi.fn((_id: string, change: (current: WorkspaceSetupRecord) => WorkspaceSetupPatch | null) => {
      const patch = change(store.setup);
      if (patch) store.setup = { ...store.setup, ...patch };
      return Promise.resolve({ setup: store.setup, changed: Boolean(patch) });
    }),
  };
}

const sender = () => ({ send: vi.fn(() => Promise.resolve(true)) });

describe("sending each workspace setup notice once", () => {
  it("marks a build notice before mailing it, so a repeated step does not mail it again", async () => {
    const repo = repoWith({ status: "failed", finishedAt: new Date("2026-10-19T10:00:00Z") });
    const notifier = {
      send: vi.fn(() => {
        expect(repo.store.setup.artifacts[SETUP_SENT_NOTICES_ARTIFACT]).toEqual({
          workspaceFailed: "build:2026-10-19T10:00:00.000Z",
        });
        return Promise.resolve(true);
      }),
    };

    expect(await notifyWorkspaceSetupOnce(repo, notifier, "setup-1", "build")).toBe("workspaceFailed");
    expect(await notifyWorkspaceSetupOnce(repo, notifier, "setup-1", "build")).toBeNull();
    expect(notifier.send).toHaveBeenCalledTimes(1);
  });

  it("mails once when two runs reach the notice at the same time", async () => {
    const repo = repoWith({ status: "failed", finishedAt: new Date("2026-10-19T10:00:00Z") });
    const notifier = sender();

    const sent = await Promise.all([0, 1].map(() => notifyWorkspaceSetupOnce(repo, notifier, "setup-1", "build")));

    expect(sent.filter(Boolean)).toEqual(["workspaceFailed"]);
    expect(notifier.send).toHaveBeenCalledTimes(1);
  });

  it("mails again for a later build outcome or a new plan revision", async () => {
    const repo = repoWith({ status: "failed", finishedAt: new Date("2026-10-19T10:00:00Z") });
    const notifier = sender();
    await notifyWorkspaceSetupOnce(repo, notifier, "setup-1", "build");

    repo.store.setup = { ...repo.store.setup, finishedAt: new Date("2026-10-19T11:00:00Z") };
    expect(await notifyWorkspaceSetupOnce(repo, notifier, "setup-1", "build")).toBe("workspaceFailed");

    repo.store.setup = { ...repo.store.setup, status: "planned", planRevision: 2 };
    expect(await notifyWorkspaceSetupOnce(repo, notifier, "setup-1", "plan")).toBe("planReady");
    repo.store.setup = { ...repo.store.setup, planRevision: 3 };
    expect(await notifyWorkspaceSetupOnce(repo, notifier, "setup-1", "plan")).toBe("planReady");
    expect(await notifyWorkspaceSetupOnce(repo, notifier, "setup-1", "plan")).toBeNull();
    expect(notifier.send).toHaveBeenCalledTimes(4);
  });

  it("releases the mark when the mail could not be sent, so the next try still sends", async () => {
    const repo = repoWith({ status: "failed", finishedAt: new Date("2026-10-19T10:00:00Z") });
    const notifier = { send: vi.fn(() => Promise.resolve(false)) };

    expect(await notifyWorkspaceSetupOnce(repo, notifier, "setup-1", "build")).toBeNull();
    expect(repo.store.setup.artifacts[SETUP_SENT_NOTICES_ARTIFACT]).toEqual({});
    notifier.send.mockResolvedValueOnce(true);
    expect(await notifyWorkspaceSetupOnce(repo, notifier, "setup-1", "build")).toBe("workspaceFailed");
  });

  it("mails nothing for a stage without a due notice or a workspace being deleted", async () => {
    const notifier = sender();
    expect(await notifyWorkspaceSetupOnce(repoWith({ status: "failed" }), notifier, "setup-1", "plan")).toBeNull();
    const deleting = repoWith({ status: "failed", finishedAt: new Date() }, true);
    expect(await notifyWorkspaceSetupOnce(deleting, notifier, "setup-1", "build")).toBeNull();
    expect(deleting.mutate).not.toHaveBeenCalled();
    expect(notifier.send).not.toHaveBeenCalled();
  });
});
