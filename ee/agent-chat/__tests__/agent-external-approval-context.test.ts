import { beforeEach, describe, expect, it, vi } from "vitest";

const spies = vi.hoisted(() => ({
  getSocialProfile: vi.fn(),
  listRelationRequests: vi.fn(),
  listSalesLists: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getGetSocialProfileInteractor: () => ({ invoke: spies.getSocialProfile }),
  getListRelationRequestsInteractor: () => ({
    invoke: spies.listRelationRequests,
  }),
  getLinkedinListSalesListsInteractor: () => ({ invoke: spies.listSalesLists }),
}));

import { resolveAgentApprovalContext } from "../agent-external-approval-context";

const CONNECTED_ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("external approval context", () => {
  it("leaves unrelated approval inputs unchanged without provider reads", async () => {
    const input = { to: ["ada@example.com"] };

    await expect(resolveAgentApprovalContext("send_email", input)).resolves.toEqual({ ok: true, input });
    expect(spies.getSocialProfile).not.toHaveBeenCalled();
    expect(spies.listRelationRequests).not.toHaveBeenCalled();
    expect(spies.listSalesLists).not.toHaveBeenCalled();
  });

  it("binds a social invite approval to the profile resolved from its operational identifier", async () => {
    spies.getSocialProfile.mockResolvedValue({
      ok: true,
      data: {
        id: "provider-ada",
        display_name: "Ada Lovelace",
        public_identifier: "ada",
      },
    });
    const input = {
      action: "invite",
      connectedAccountId: CONNECTED_ACCOUNT_ID,
      identifier: "provider-ada",
      targetLabel: "Mallory",
      message: "Let's connect.",
    };

    await expect(resolveAgentApprovalContext("manage_social_relations", input)).resolves.toEqual({
      ok: true,
      input: { ...input, targetLabel: "Ada Lovelace" },
    });
    expect(spies.getSocialProfile).toHaveBeenCalledWith({
      connectedAccountId: CONNECTED_ACCOUNT_ID,
      identifier: "provider-ada",
    });
  });

  it("binds accept and cancel approvals without requiring repeated page metadata", async () => {
    spies.listRelationRequests
      .mockResolvedValueOnce({
        ok: true,
        data: {
          data: [
            {
              id: "invite-1",
              user: { id: "ada", display_name: "Ada Lovelace" },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          data: [
            {
              id: "invite-2",
              user: { id: "grace", public_identifier: "grace-hopper" },
            },
          ],
        },
      });

    await expect(
      resolveAgentApprovalContext("manage_social_relations", {
        action: "accept",
        connectedAccountId: CONNECTED_ACCOUNT_ID,
        invitationId: "invite-1",
        direction: "received",
      }),
    ).resolves.toMatchObject({
      ok: true,
      input: { targetLabel: "Ada Lovelace" },
    });
    await expect(
      resolveAgentApprovalContext("manage_social_relations", {
        action: "cancel",
        connectedAccountId: CONNECTED_ACCOUNT_ID,
        invitationId: "invite-2",
      }),
    ).resolves.toMatchObject({
      ok: true,
      input: { targetLabel: "grace-hopper" },
    });
    expect(spies.listRelationRequests).toHaveBeenNthCalledWith(1, {
      connectedAccountId: CONNECTED_ACCOUNT_ID,
      direction: "received",
      cursor: undefined,
      offset: undefined,
      limit: 100,
    });
    expect(spies.listRelationRequests).toHaveBeenNthCalledWith(2, {
      connectedAccountId: CONNECTED_ACCOUNT_ID,
      direction: "sent",
      cursor: undefined,
      offset: undefined,
      limit: 100,
    });
  });

  it("never verifies an accept action against outgoing requests", async () => {
    spies.listRelationRequests.mockImplementation((input) =>
      Promise.resolve({
        ok: true,
        data: {
          data:
            input.direction === "sent"
              ? [
                  {
                    id: "invite-sent",
                    user: { id: "ada", display_name: "Ada Lovelace" },
                  },
                ]
              : [],
        },
      }),
    );

    await expect(
      resolveAgentApprovalContext("manage_social_relations", {
        action: "accept",
        connectedAccountId: CONNECTED_ACCOUNT_ID,
        invitationId: "invite-sent",
        direction: "sent",
        offset: 100,
      }),
    ).resolves.toMatchObject({ ok: false });
    expect(spies.listRelationRequests).toHaveBeenCalledTimes(2);
    expect(spies.listRelationRequests.mock.calls.every(([input]) => input.direction === "received")).toBe(true);
  });

  it("binds a Sales save approval to both authoritative provider records", async () => {
    spies.getSocialProfile.mockResolvedValue({
      ok: true,
      data: { id: "lead-1", first_name: "Grace", last_name: "Hopper" },
    });
    spies.listSalesLists.mockResolvedValue({
      ok: true,
      data: { data: [{ id: "list-1", name: "Priority Leads" }] },
    });
    const input = {
      action: "save",
      connectedAccountId: CONNECTED_ACCOUNT_ID,
      kind: "leads",
      listId: "list-1",
      providerId: "lead-1",
      targetLabel: "Mallory",
      listLabel: "Wrong List",
    };

    await expect(resolveAgentApprovalContext("linkedin_manage_sales_lists", input)).resolves.toEqual({
      ok: true,
      input: {
        ...input,
        targetLabel: "Grace Hopper",
        listLabel: "Priority Leads",
      },
    });
    expect(spies.getSocialProfile).toHaveBeenCalledWith({
      connectedAccountId: CONNECTED_ACCOUNT_ID,
      identifier: "lead-1",
    });
    expect(spies.listSalesLists).toHaveBeenCalledWith({
      connectedAccountId: CONNECTED_ACCOUNT_ID,
      kind: "leads",
      offset: undefined,
      limit: 100,
    });
  });

  it("fails closed when an operational id is absent or cannot be resolved", async () => {
    spies.getSocialProfile.mockResolvedValue({ ok: false, error: {} });
    spies.listRelationRequests.mockResolvedValue({
      ok: true,
      data: { data: [] },
    });

    await expect(
      resolveAgentApprovalContext("manage_social_relations", {
        action: "invite",
        connectedAccountId: CONNECTED_ACCOUNT_ID,
      }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      resolveAgentApprovalContext("manage_social_relations", {
        action: "cancel",
        connectedAccountId: CONNECTED_ACCOUNT_ID,
        invitationId: "missing",
        direction: "sent",
      }),
    ).resolves.toMatchObject({ ok: false });
  });

  it("caps relation verification at three unique provider pages", async () => {
    const fullPage = Array.from({ length: 100 }, (_, index) => ({
      id: `other-${index}`,
      user: { id: `user-${index}`, display_name: `User ${index}` },
    }));
    spies.listRelationRequests.mockResolvedValue({
      ok: true,
      data: { data: fullPage },
    });

    await expect(
      resolveAgentApprovalContext("manage_social_relations", {
        action: "cancel",
        connectedAccountId: CONNECTED_ACCOUNT_ID,
        invitationId: "missing",
      }),
    ).resolves.toMatchObject({ ok: false });

    expect(spies.listRelationRequests).toHaveBeenCalledTimes(3);
    const pages = spies.listRelationRequests.mock.calls.map(([input]) =>
      JSON.stringify({
        direction: input.direction,
        cursor: input.cursor,
        offset: input.offset ?? 0,
      }),
    );
    expect(new Set(pages).size).toBe(3);
  });

  it("caps Sales-list verification at three unique pages while resolving account targets", async () => {
    spies.getSocialProfile.mockResolvedValue({
      ok: true,
      data: {
        id: "account-1",
        type: "organization",
        display_name: "Analytical Engines Ltd.",
      },
    });
    const fullPage = Array.from({ length: 100 }, (_, index) => ({
      id: `other-list-${index}`,
      name: `List ${index}`,
    }));
    spies.listSalesLists.mockResolvedValue({
      ok: true,
      data: { data: fullPage },
    });

    await expect(
      resolveAgentApprovalContext("linkedin_manage_sales_lists", {
        action: "save",
        connectedAccountId: CONNECTED_ACCOUNT_ID,
        kind: "accounts",
        listId: "missing",
        providerId: "account-1",
        offset: 100,
      }),
    ).resolves.toMatchObject({ ok: false });

    expect(spies.listSalesLists).toHaveBeenCalledTimes(3);
    const offsets = spies.listSalesLists.mock.calls.map(([input]) => input.offset ?? 0);
    expect(new Set(offsets).size).toBe(3);
  });
});
