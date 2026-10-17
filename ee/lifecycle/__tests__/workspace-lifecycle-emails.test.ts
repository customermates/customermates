import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { Locale } from "@/generated/prisma";
import type { LifecycleRecipient } from "../lifecycle-recipient";

import { APP_LOCALES, type AppLocale } from "@/i18n/locale-registry";

const templates = vi.hoisted(() => ({
  offer: vi.fn((props: unknown) => ({ type: "trial-expired-offer", props })),
  reminder: vi.fn((props: unknown) => ({ type: "trial-inactivation-reminder", props })),
  trialNotice: vi.fn((props: unknown) => ({ type: "trial-inactivation-notice", props })),
  subscriptionNotice: vi.fn((props: unknown) => ({ type: "subscription-inactivation-notice", props })),
}));

vi.mock("@/core/decorators/system-interactor.decorator", () => ({
  SystemInteractor: (target: unknown) => target,
}));
vi.mock("@/components/emails/trial-expired-offer", () => ({ default: templates.offer }));
vi.mock("@/components/emails/trial-inactivation-reminder", () => ({ default: templates.reminder }));
vi.mock("@/components/emails/trial-inactivation-notice", () => ({ default: templates.trialNotice }));
vi.mock("@/components/emails/subscription-inactivation-notice", () => ({ default: templates.subscriptionNotice }));

import deMessages from "@/i18n/locales/de.json";
import enMessages from "@/i18n/locales/en.json";
import esMessages from "@/i18n/locales/es.json";
import frMessages from "@/i18n/locales/fr.json";
import itMessages from "@/i18n/locales/it.json";
import { createMockUser } from "@/tests/helpers/mock-user";

import { DeactivateTrialUsersAndSendNoticeInteractor } from "../deactivate-trial-users-and-send-notice.interactor";
import { DeactivateUsersAfterSubscriptionGracePeriodInteractor } from "../deactivate-users-after-subscription-grace-period.interactor";
import { SendTrialExtensionOfferInteractor } from "../send-trial-extension-offer.interactor";
import { SendTrialInactivationReminderInteractor } from "../send-trial-inactivation-reminder.interactor";

const CATALOGS: Record<AppLocale, typeof enMessages> = {
  de: deMessages,
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  it: itMessages,
};
const WORKSPACE = "Bergmann Steuern";

type Namespace =
  | "TrialExpiredOffer"
  | "TrialInactivationReminder"
  | "TrialInactivationNotice"
  | "SubscriptionInactivationNotice";
type SendEmail = (email: unknown) => Promise<boolean>;
type DeactivateUser = (userId: string) => Promise<void>;
type ReleaseOwnerRoutines = (args: { companyId: string; ownerUserId: string }) => Promise<void>;
type EmailService = { send: Mock<SendEmail> };
type Collaborators = {
  deactivateUserOrThrow: Mock<DeactivateUser>;
  releaseOwnerRoutines: { invoke: Mock<ReleaseOwnerRoutines> };
};

function emailServiceMock(): EmailService {
  return { send: vi.fn<SendEmail>().mockResolvedValue(true) };
}

function collaboratorMocks(): Collaborators {
  return {
    deactivateUserOrThrow: vi.fn<DeactivateUser>().mockResolvedValue(undefined),
    releaseOwnerRoutines: { invoke: vi.fn<ReleaseOwnerRoutines>().mockResolvedValue(undefined) },
  };
}

function recipient(companyName: string | null, displayLanguage: Locale = "en"): LifecycleRecipient {
  return {
    ...createMockUser({ id: "member-1", companyId: "company-1", email: "member@example.com", displayLanguage }),
    welcomeEmailSentAt: null,
    trialExpiredOfferSentAt: null,
    trialInactivationReminderSentAt: null,
    trialInactivationNoticeSentAt: null,
    company: { name: companyName },
  } as unknown as LifecycleRecipient;
}

const CASES: Array<{
  name: string;
  namespace: Namespace;
  template: ReturnType<typeof vi.fn>;
  run: (users: LifecycleRecipient[], emailService: EmailService, collaborators: Collaborators) => Promise<void>;
}> = [
  {
    name: "trial extension offer",
    namespace: "TrialExpiredOffer",
    template: templates.offer,
    run: (users, emailService) =>
      new SendTrialExtensionOfferInteractor(
        {
          findUsersWithTrialEndedLast24Hours: vi.fn().mockResolvedValue(users),
          claimTrialExpiredOfferSent: vi.fn().mockResolvedValue(true),
        },
        emailService as never,
      ).invoke(),
  },
  {
    name: "trial inactivation reminder",
    namespace: "TrialInactivationReminder",
    template: templates.reminder,
    run: (users, emailService) =>
      new SendTrialInactivationReminderInteractor(
        {
          findUsersWithTrialEndedBetween3And4Days: vi.fn().mockResolvedValue(users),
          claimTrialInactivationReminderSent: vi.fn().mockResolvedValue(true),
        },
        emailService as never,
      ).invoke(),
  },
  {
    name: "trial inactivation notice",
    namespace: "TrialInactivationNotice",
    template: templates.trialNotice,
    run: (users, emailService, collaborators) =>
      new DeactivateTrialUsersAndSendNoticeInteractor(
        {
          findUsersWithTrialEndedBetween6And7Days: vi.fn().mockResolvedValue(users),
          claimTrialInactivationNoticeSent: vi.fn().mockResolvedValue(true),
          deactivateUserOrThrow: collaborators.deactivateUserOrThrow,
        },
        emailService as never,
        collaborators.releaseOwnerRoutines as never,
      ).invoke(),
  },
  {
    name: "subscription grace-period notice",
    namespace: "SubscriptionInactivationNotice",
    template: templates.subscriptionNotice,
    run: (users, emailService, collaborators) =>
      new DeactivateUsersAfterSubscriptionGracePeriodInteractor(
        {
          findUsersPastSubscriptionGracePeriod: vi.fn().mockResolvedValue(users),
          deactivateUserOrThrow: collaborators.deactivateUserOrThrow,
        },
        emailService as never,
        collaborators.releaseOwnerRoutines as never,
      ).invoke(),
  },
];

describe.each(CASES)("$name names the workspace it is about", (definition) => {
  let emailService: EmailService;
  let collaborators: Collaborators;

  beforeEach(() => {
    vi.clearAllMocks();
    emailService = emailServiceMock();
    collaborators = collaboratorMocks();
  });

  it.each(APP_LOCALES)("puts the workspace name into the %s subject and body", async (locale) => {
    await definition.run([recipient(WORKSPACE, locale)], emailService, collaborators);

    const copy = CATALOGS[locale][definition.namespace];
    const [email] = emailService.send.mock.calls[0] as [{ subject: string }];
    const props = definition.template.mock.calls.at(-1)?.[0] as { subject: string; body: string; locale: string };
    expect(email.subject).toBe(copy.subjectNamed.replace("{workspace}", WORKSPACE));
    expect(props.subject).toBe(email.subject);
    expect(props.body).toBe(copy.bodyNamed.replace("{workspace}", WORKSPACE));
    expect(props.locale).toBe(locale);
    expect(`${email.subject} ${props.body}`).not.toContain("{workspace}");
  });

  it("keeps the generic localized copy when the workspace has no name", async () => {
    await definition.run([recipient(null, "de")], emailService, collaborators);

    const copy = CATALOGS.de[definition.namespace];
    const [email] = emailService.send.mock.calls[0] as [{ subject: string }];
    const props = definition.template.mock.calls.at(-1)?.[0] as { subject: string; body: string };
    expect(email.subject).toBe(copy.subject);
    expect(props.body).toBe(copy.body);
  });
});

describe("workspace deactivation notices", () => {
  it.each([CASES[2], CASES[3]])("$name deactivates only the membership of that workspace", async (definition) => {
    const emailService = emailServiceMock();
    const collaborators = collaboratorMocks();

    await definition.run([recipient(WORKSPACE)], emailService, collaborators);

    expect(collaborators.deactivateUserOrThrow).toHaveBeenCalledExactlyOnceWith("member-1");
    expect(collaborators.releaseOwnerRoutines.invoke).toHaveBeenCalledExactlyOnceWith({
      companyId: "company-1",
      ownerUserId: "member-1",
    });
  });
});
