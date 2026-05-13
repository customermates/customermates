/**
 * Trigger worker dependency injection - single source of truth for everything that
 * runs inside the trigger.dev worker bundle.
 *
 * Structure:
 *   Section 1: Imports (concrete classes only, from specific files)
 *   Section 2: Repo getters (fresh per call)
 *   Section 3: Service getters (fresh per call)
 *   Section 4: Interactor getters (fresh per call, deps from getters)
 *
 * Why this exists separately from `core/app-di.ts`:
 * The trigger build uses esbuild's `react-server` package export condition (required
 * for `next-intl/server.getTranslations()` to resolve to its server-only variant).
 * Under that condition `React.createContext` is undefined, so any module that calls
 * it at load time crashes the worker. `core/app-di.ts` transitively imports the auth
 * chain, which imports `next/navigation`, which calls `createContext` at module load.
 * This file wires only the trigger-worker dependencies directly, avoiding that chain.
 */

// ─── Section 1: Imports ─────────────────────────────────────────────────────
// Repos
import { PrismaUserRepo } from "@/features/user/prisma-user.repository";
import { PrismaWebhookDeliveryRepo } from "@/features/webhook/prisma-webhook-delivery.repository";
// Services
import { EmailService } from "@/features/email/email.service";
// Interactors
import { DeliverWebhookInteractor } from "@/features/webhook/deliver-webhook.interactor";
import { SendWelcomeAndDemoInteractor } from "@/ee/lifecycle/send-welcome-and-demo.interactor";
import { SendTrialExtensionOfferInteractor } from "@/ee/lifecycle/send-trial-extension-offer.interactor";
import { SendTrialInactivationReminderInteractor } from "@/ee/lifecycle/send-trial-inactivation-reminder.interactor";
import { DeactivateTrialUsersAndSendNoticeInteractor } from "@/ee/lifecycle/deactivate-trial-users-and-send-notice.interactor";
import { DeactivateUsersAfterSubscriptionGracePeriodInteractor } from "@/ee/lifecycle/deactivate-users-after-subscription-grace-period.interactor";

// ─── Section 2: Repos ───────────────────────────────────────────────────────

export const getUserRepo = () => new PrismaUserRepo();
export const getWebhookDeliveryRepo = () => new PrismaWebhookDeliveryRepo();

// ─── Section 3: Services ────────────────────────────────────────────────────

export const getEmailService = () => new EmailService();

// ─── Section 4: Interactors ─────────────────────────────────────────────────

export const getDeliverWebhookInteractor = () => new DeliverWebhookInteractor(getWebhookDeliveryRepo());

export const getSendWelcomeAndDemoInteractor = () => new SendWelcomeAndDemoInteractor(getUserRepo(), getEmailService());

export const getSendTrialExtensionOfferInteractor = () =>
  new SendTrialExtensionOfferInteractor(getUserRepo(), getEmailService());

export const getSendTrialInactivationReminderInteractor = () =>
  new SendTrialInactivationReminderInteractor(getUserRepo(), getEmailService());

export const getDeactivateTrialUsersAndSendNoticeInteractor = () =>
  new DeactivateTrialUsersAndSendNoticeInteractor(getUserRepo(), getEmailService());

export const getDeactivateUsersAfterSubscriptionGracePeriodInteractor = () =>
  new DeactivateUsersAfterSubscriptionGracePeriodInteractor(getUserRepo(), getEmailService());
