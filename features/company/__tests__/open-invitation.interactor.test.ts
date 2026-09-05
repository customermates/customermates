import { beforeEach, describe, expect, it, vi } from "vitest";

import { OpenInvitationInteractor } from "../open-invitation.interactor";

describe("OpenInvitationInteractor", () => {
  const validation = { invoke: vi.fn() };
  const auth = { getSession: vi.fn() };
  const intents = { issueInvitation: vi.fn() };
  const expiresAt = new Date("2099-01-01T00:00:00Z");
  const interactor = new OpenInvitationInteractor(validation as never, auth as never, intents as never);

  beforeEach(() => {
    vi.clearAllMocks();
    validation.invoke.mockResolvedValue({ ok: true, data: { valid: true, expiresAt } });
    auth.getSession.mockResolvedValue(null);
    intents.issueInvitation.mockReturnValue("signed-invitation");
  });

  it.each([
    [null, "/auth/signup"],
    [{ user: { emailVerified: true } }, "/auth/invitation"],
    [{ user: { emailVerified: false } }, "/auth/invitation"],
  ])("retains the invitation for session %j", async (session, destination) => {
    auth.getSession.mockResolvedValue(session);

    await expect(interactor.invoke({ token: "invite-token" })).resolves.toEqual({
      redirect: `${destination}?intent=signed-invitation`,
    });
    expect(validation.invoke).toHaveBeenCalledExactlyOnceWith({ token: "invite-token" });
    expect(validation.invoke.mock.invocationCallOrder[0]).toBeLessThan(auth.getSession.mock.invocationCallOrder[0]);
    expect(intents.issueInvitation).toHaveBeenCalledExactlyOnceWith("invite-token", expiresAt);
  });

  it.each([
    [{ ok: false }, "invalidInviteLink"],
    [{ ok: true, data: { valid: false, errorMessage: "invalidInviteLink" } }, "invalidInviteLink"],
    [{ ok: true, data: { valid: false, errorMessage: "inviteLinkExpired" } }, "inviteLinkExpired"],
  ])("rejects invalid invitations before reading the session", async (result, error) => {
    validation.invoke.mockResolvedValue(result);
    await expect(interactor.invoke({ token: "invalid-token" })).resolves.toEqual({
      redirect: `/auth/error?type=${error}`,
    });
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(intents.issueInvitation).not.toHaveBeenCalled();
  });

  it("fails closed when the invitation expires before issuance", async () => {
    intents.issueInvitation.mockReturnValue(null);
    await expect(interactor.invoke({ token: "invite-token" })).resolves.toEqual({
      redirect: "/auth/error?type=inviteLinkExpired",
    });
  });
});
