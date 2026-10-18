import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkspaceTabChannel } from "../workspace-tab-channel";

const disposers: Array<() => void> = [];

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});

describe("WorkspaceTabChannel", () => {
  it("delivers a notice to every other tab but not back to the tab that posted it", async () => {
    const posting = new WorkspaceTabChannel();
    const listening = new WorkspaceTabChannel();
    const ownListener = vi.fn();
    const otherListener = vi.fn();
    disposers.push(posting.open(ownListener), listening.open(otherListener));

    posting.post({ companyId: "company-b", name: "Taxes" });

    await vi.waitFor(() => expect(otherListener).toHaveBeenCalledWith({ companyId: "company-b", name: "Taxes" }));
    expect(ownListener).not.toHaveBeenCalled();
  });

  it("posts from a tab that is not listening itself", async () => {
    const listener = vi.fn();
    disposers.push(new WorkspaceTabChannel().open(listener));

    new WorkspaceTabChannel().post({ companyId: null, name: null });

    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith({ companyId: null, name: null }));
  });

  it("ignores messages that are not workspace notices", async () => {
    const listener = vi.fn();
    disposers.push(new WorkspaceTabChannel().open(listener));
    const foreign = new BroadcastChannel("customermates:workspace");

    foreign.postMessage({ companyId: 42 });
    foreign.postMessage("reload");
    new WorkspaceTabChannel().post({ companyId: "company-c", name: null });
    foreign.close();

    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith({ companyId: "company-c", name: null }));
    expect(listener).toHaveBeenCalledOnce();
  });

  it("stops listening once closed", async () => {
    const closed = vi.fn();
    const open = vi.fn();
    const close = new WorkspaceTabChannel().open(closed);
    disposers.push(new WorkspaceTabChannel().open(open));
    close();

    new WorkspaceTabChannel().post({ companyId: "company-d", name: "Agents" });

    await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
    expect(closed).not.toHaveBeenCalled();
  });
});
