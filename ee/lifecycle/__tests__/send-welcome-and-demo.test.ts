import { describe, it, expect, vi, beforeEach } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/core/decorators/system-interactor.decorator", () => ({
  SystemInteractor: (target: unknown) => target,
}));

describe("SendWelcomeAndDemoInteractor (e2e translation + send)", () => {
  let repo: any;
  let emailService: any;

  beforeEach(() => {
    repo = {
      findProspectUsers: vi.fn(),
      claimWelcomeEmailSent: vi.fn().mockResolvedValue(true),
    };
    emailService = { send: vi.fn().mockResolvedValue(undefined) };
  });

  it("loads English translations via getTranslator and sends an email with a real subject", async () => {
    const user = createMockUser({ id: "u1", displayLanguage: "en" as never });
    repo.findProspectUsers.mockResolvedValue([user]);

    const { SendWelcomeAndDemoInteractor } = await import("../send-welcome-and-demo.interactor");
    const interactor = new SendWelcomeAndDemoInteractor(repo, emailService);

    await interactor.invoke();

    expect(emailService.send).toHaveBeenCalledTimes(1);
    const call = emailService.send.mock.calls[0][0];
    expect(call.to).toBe(user.email);
    expect(typeof call.subject).toBe("string");
    expect(call.subject.length).toBeGreaterThan(0);
    expect(call.subject).not.toContain("TrialWelcome.");
  });

  it("loads German translations when the user's language is 'de'", async () => {
    const user = createMockUser({ id: "u2", displayLanguage: "de" as never });
    repo.findProspectUsers.mockResolvedValue([user]);

    const { SendWelcomeAndDemoInteractor } = await import("../send-welcome-and-demo.interactor");
    const interactor = new SendWelcomeAndDemoInteractor(repo, emailService);

    await interactor.invoke();

    expect(emailService.send).toHaveBeenCalledTimes(1);
    const enUser = createMockUser({ id: "u-en", displayLanguage: "en" as never });
    (repo.findProspectUsers as ReturnType<typeof vi.fn>).mockResolvedValue([enUser]);
    emailService.send.mockClear();

    const interactor2 = new SendWelcomeAndDemoInteractor(repo, emailService);
    await interactor2.invoke();

    expect(emailService.send).toHaveBeenCalledTimes(1);
  });

  it("falls back to the default locale when the user's displayLanguage is 'system'", async () => {
    const user = createMockUser({ id: "u3", displayLanguage: "system" as never });
    repo.findProspectUsers.mockResolvedValue([user]);

    const { SendWelcomeAndDemoInteractor } = await import("../send-welcome-and-demo.interactor");
    const interactor = new SendWelcomeAndDemoInteractor(repo, emailService);

    await interactor.invoke();

    expect(emailService.send).toHaveBeenCalledTimes(1);
    const call = emailService.send.mock.calls[0][0];
    expect(call.subject).toBeTruthy();
  });

  it("skips users whose claim returned false (already sent by a parallel worker)", async () => {
    const user = createMockUser({ id: "u4", displayLanguage: "en" as never });
    repo.findProspectUsers.mockResolvedValue([user]);
    repo.claimWelcomeEmailSent.mockResolvedValueOnce(false);

    const { SendWelcomeAndDemoInteractor } = await import("../send-welcome-and-demo.interactor");
    const interactor = new SendWelcomeAndDemoInteractor(repo, emailService);

    await interactor.invoke();

    expect(emailService.send).not.toHaveBeenCalled();
  });

  it("skips users that already have welcomeEmailSentAt set", async () => {
    const user = createMockUser({ id: "u5", welcomeEmailSentAt: new Date() } as never);
    repo.findProspectUsers.mockResolvedValue([user]);

    const { SendWelcomeAndDemoInteractor } = await import("../send-welcome-and-demo.interactor");
    const interactor = new SendWelcomeAndDemoInteractor(repo, emailService);

    await interactor.invoke();

    expect(repo.claimWelcomeEmailSent).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
  });
});
