/**
 * Application dependency injection - single source of truth for everything wired
 * into the Next.js app AND the trigger.dev worker bundle.
 *
 * Structure:
 *   Section 1: Imports (concrete classes only, from specific files)
 *   Section 2: Repo getters (fresh per call)
 *   Section 3: Service getters (fresh per call)
 *   Section 4: Interactor getters (fresh per call, deps from getters)
 *
 * The auth chain returns `Redirect` outcomes instead of calling `redirect()`
 * from `next/navigation` directly, so it stays framework-agnostic and
 * trigger-worker-safe. Outcome translation lives in
 * `features/auth/next/require.ts` (page guards) and in
 * `core/utils/action-result.ts`'s `serializeResult` (server actions), both
 * imported only on the Next.js side. Never add an import here that pulls
 * `next/navigation` at module load.
 */

// ─── Section 1: Imports ─────────────────────────────────────────────────────
// Repos
import { PrismaContactRepo } from "@/features/contacts/prisma-contact.repository";
import { PrismaOrganizationRepo } from "@/features/organizations/prisma-organization.repository";
import { PrismaDealRepo } from "@/features/deals/prisma-deal.repository";
import { PrismaServiceRepo } from "@/features/services/prisma-service.repository";
import { PrismaTaskRepo } from "@/features/tasks/prisma-task.repository";
import { PrismaUserRepo } from "@/features/user/prisma-user.repository";
import { PrismaCompanyRepo } from "@/features/company/prisma-company.repository";
import { PrismaRoleRepo } from "@/features/role/prisma-role.repository";
import { PrismaCustomColumnRepo } from "@/features/custom-column/prisma-custom-column.repository";
import { PrismaP13nRepo } from "@/features/p13n/prisma-p13n.repository";
import { PrismaWidgetRepo } from "@/features/widget/prisma-widget.repository";
import { PrismaWidgetCalculatorRepo } from "@/features/widget/calculator/prisma-widget-calculator.repository";
import { PrismaWebhookRepo } from "@/features/webhook/prisma-webhook.repository";
import { PrismaWebhookDeliveryRepo } from "@/features/webhook/prisma-webhook-delivery.repository";
import { PrismaAuditLogRepo } from "@/ee/audit-log/prisma-audit-log.repository";
// Services
import { EmailService } from "@/features/email/email.service";
import { AuthService } from "@/features/auth/auth.service";
import { UserService } from "@/features/user/user.service";
import { RouteGuardService } from "@/features/auth/route-guard.service";
import { TaskService } from "@/features/tasks/task.service";
import { EventService } from "@/features/event/event.service";
import { WidgetService } from "@/features/widget/widget.service";
import { WidgetDataFetcher } from "@/features/widget/calculator/widget-data-fetcher.service";
import { WidgetGroupingService } from "@/features/widget/calculator/widget-grouping.service";
import { SubscriptionService } from "@/ee/subscription/subscription.service";
import { BackgroundTaskService } from "@/core/utils/background-task.service";
// Task Listeners
import { UserPendingAuthorizationTaskListener } from "@/features/tasks/listener/user-pending-authorization-task.listener";
import { WidgetRecalcEventListener } from "@/features/widget/widget-recalc.listener";
import { DomainEvent } from "@/features/event/domain-events";
// Contacts interactors
import { GetContactsInteractor } from "@/features/contacts/get/get-contacts.interactor";
import { GetContactsApiInteractor } from "@/features/contacts/get/get-contacts-api.interactor";
import { GetContactsConfigurationInteractor } from "@/features/contacts/get/get-contacts-configuration.interactor";
import { GetContactByIdInteractor } from "@/features/contacts/get/get-contact-by-id.interactor";
import { CreateContactInteractor } from "@/features/contacts/upsert/create-contact.interactor";
import { CreateManyContactsInteractor } from "@/features/contacts/upsert/create-many-contacts.interactor";
import { UpdateContactInteractor } from "@/features/contacts/upsert/update-contact.interactor";
import { UpdateManyContactsInteractor } from "@/features/contacts/upsert/update-many-contacts.interactor";
import { DeleteContactInteractor } from "@/features/contacts/delete/delete-contact.interactor";
import { DeleteManyContactsInteractor } from "@/features/contacts/delete/delete-many-contacts.interactor";
// Organizations interactors
import { GetOrganizationsInteractor } from "@/features/organizations/get/get-organizations.interactor";
import { GetOrganizationsApiInteractor } from "@/features/organizations/get/get-organizations-api.interactor";
import { GetOrganizationsConfigurationInteractor } from "@/features/organizations/get/get-organizations-configuration.interactor";
import { GetOrganizationByIdInteractor } from "@/features/organizations/get/get-organization-by-id.interactor";
import { CreateOrganizationInteractor } from "@/features/organizations/upsert/create-organization.interactor";
import { CreateManyOrganizationsInteractor } from "@/features/organizations/upsert/create-many-organizations.interactor";
import { UpdateOrganizationInteractor } from "@/features/organizations/upsert/update-organization.interactor";
import { UpdateManyOrganizationsInteractor } from "@/features/organizations/upsert/update-many-organizations.interactor";
import { DeleteOrganizationInteractor } from "@/features/organizations/delete/delete-organization.interactor";
import { DeleteManyOrganizationsInteractor } from "@/features/organizations/delete/delete-many-organizations.interactor";
// Deals interactors
import { GetDealsInteractor } from "@/features/deals/get/get-deals.interactor";
import { GetDealsApiInteractor } from "@/features/deals/get/get-deals-api.interactor";
import { GetDealsConfigurationInteractor } from "@/features/deals/get/get-deals-configuration.interactor";
import { GetDealByIdInteractor } from "@/features/deals/get/get-deal-by-id.interactor";
import { CreateDealInteractor } from "@/features/deals/upsert/create-deal.interactor";
import { CreateManyDealsInteractor } from "@/features/deals/upsert/create-many-deals.interactor";
import { UpdateDealInteractor } from "@/features/deals/upsert/update-deal.interactor";
import { UpdateManyDealsInteractor } from "@/features/deals/upsert/update-many-deals.interactor";
import { DeleteDealInteractor } from "@/features/deals/delete/delete-deal.interactor";
import { DeleteManyDealsInteractor } from "@/features/deals/delete/delete-many-deals.interactor";
// Services interactors
import { GetServicesInteractor } from "@/features/services/get/get-services.interactor";
import { GetServicesApiInteractor } from "@/features/services/get/get-services-api.interactor";
import { GetServicesConfigurationInteractor } from "@/features/services/get/get-services-configuration.interactor";
import { GetServiceByIdInteractor } from "@/features/services/get/get-service-by-id.interactor";
import { CreateServiceInteractor } from "@/features/services/upsert/create-service.interactor";
import { CreateManyServicesInteractor } from "@/features/services/upsert/create-many-services.interactor";
import { UpdateServiceInteractor } from "@/features/services/upsert/update-service.interactor";
import { UpdateManyServicesInteractor } from "@/features/services/upsert/update-many-services.interactor";
import { DeleteServiceInteractor } from "@/features/services/delete/delete-service.interactor";
import { DeleteManyServicesInteractor } from "@/features/services/delete/delete-many-services.interactor";
// Tasks interactors
import { GetTasksInteractor } from "@/features/tasks/get/get-tasks.interactor";
import { GetTasksApiInteractor } from "@/features/tasks/get/get-tasks-api.interactor";
import { GetTasksConfigurationInteractor } from "@/features/tasks/get/get-tasks-configuration.interactor";
import { GetTaskByIdInteractor } from "@/features/tasks/get/get-task-by-id.interactor";
import { CountUserTasksInteractor } from "@/features/tasks/count-user-tasks.interactor";
import { CountSystemTasksInteractor } from "@/features/tasks/count-system-tasks.interactor";
import { CreateTaskInteractor } from "@/features/tasks/upsert/create-task.interactor";
import { CreateManyTasksInteractor } from "@/features/tasks/upsert/create-many-tasks.interactor";
import { UpdateTaskInteractor } from "@/features/tasks/upsert/update-task.interactor";
import { UpdateManyTasksInteractor } from "@/features/tasks/upsert/update-many-tasks.interactor";
import { DeleteTaskInteractor } from "@/features/tasks/delete/delete-task.interactor";
import { DeleteManyTasksInteractor } from "@/features/tasks/delete/delete-many-tasks.interactor";
// User interactors
import { RegisterUserInteractor } from "@/features/user/register/register-user.interactor";
import { UpdateUserDetailsInteractor } from "@/features/user/upsert/update-user-details.interactor";
import { CompleteOnboardingWizardInteractor } from "@/features/onboarding-wizard/complete-onboarding-wizard.interactor";
import { SeedOnboardingDataInteractor } from "@/features/onboarding-wizard/seed-onboarding-data.interactor";
import { UpdateUserSettingsInteractor } from "@/features/user/upsert/update-user-settings.interactor";
import { GetUserDetailsInteractor } from "@/features/user/get/get-user-details.interactor";
import { GetUserByIdInteractor } from "@/features/user/get/get-user-by-id.interactor";
import { AdminUpdateUserDetailsInteractor } from "@/features/user/upsert/admin-update-user-details.interactor";
import { GetUsersInteractor } from "@/features/user/get/get-users.interactor";
import { GetUsersApiInteractor } from "@/features/user/get/get-users-api.interactor";
// Auth interactors
import { SignInWithEmailInteractor } from "@/features/auth/sign-in-with-email.interactor";
import { SignUpWithEmailInteractor } from "@/features/auth/sign-up-with-email.interactor";
import { RequestPasswordResetInteractor } from "@/features/auth/request-password-reset.interactor";
import { ResetPasswordInteractor } from "@/features/auth/reset-password.interactor";
import { ContinueWithSocialsInteractor } from "@/features/auth/continue-with-socials.interactor";
import { ResendVerificationEmailInteractor } from "@/features/auth/resend-verification-email.interactor";
import { SignOutInteractor } from "@/features/auth/sign-out.interactor";
// Company interactors
import { GetCompanyDetailsInteractor } from "@/features/company/get-company-details.interactor";
import { UpdateCompanyDetailsInteractor } from "@/features/company/update-company-details.interactor";
import { GetOrCreateInviteTokenInteractor } from "@/features/company/get-or-create-invite-token.interactor";
import { InviteUsersByEmailInteractor } from "@/features/company/invite-users-by-email.interactor";
import { InviteTokenValidationInteractor } from "@/features/company/invite-token-validation.interactor";
// Role interactors
import { UpsertRoleInteractor } from "@/features/role/upsert-role.interactor";
import { GetRolesInteractor } from "@/features/role/get-roles.interactor";
import { DeleteRoleInteractor } from "@/features/role/delete-role.interactor";
// Widget interactors
import { GetWidgetsInteractor } from "@/features/widget/get-widgets.interactor";
import { RecalculateUserWidgetsInteractor } from "@/features/widget/recalculate-user-widgets.interactor";
import { UpsertWidgetInteractor } from "@/features/widget/upsert-widget.interactor";
import { DeleteWidgetInteractor } from "@/features/widget/delete-widget.interactor";
import { UpdateWidgetLayoutsInteractor } from "@/features/widget/update-widget-layouts.interactor";
import { GetCompanyWidgetsInteractor } from "@/features/widget/get-company-widgets.interactor";
import { GetWidgetByIdInteractor } from "@/features/widget/get-widget-by-id.interactor";
import { GetWidgetFilterableFieldsInteractor } from "@/features/widget/get-widget-filterable-fields.interactor";
// Webhook interactors
import { GetWebhooksInteractor } from "@/features/webhook/get-webhooks.interactor";
import { UpsertWebhookInteractor } from "@/features/webhook/upsert-webhook.interactor";
import { DeleteWebhookInteractor } from "@/features/webhook/delete-webhook.interactor";
import { GetWebhookDeliveriesInteractor } from "@/features/webhook/get-webhook-deliveries.interactor";
import { ResendWebhookDeliveryInteractor } from "@/features/webhook/resend-webhook-delivery.interactor";
// Custom Column interactors
import { GetCustomColumnsInteractor } from "@/features/custom-column/get-custom-columns.interactor";
import { GetCustomColumnsByEntityTypeInteractor } from "@/features/custom-column/get-custom-columns-by-entity-type.interactor";
import { UpsertCustomColumnInteractor } from "@/features/custom-column/upsert-custom-column.interactor";
import { DeleteCustomColumnInteractor } from "@/features/custom-column/delete-custom-column.interactor";
// Search interactor
import { GlobalSearchInteractor } from "@/features/search/global-search.interactor";
// P13n interactors
import { UpsertP13nInteractor } from "@/features/p13n/upsert-p13n.interactor";
import { UpsertFilterPresetInteractor } from "@/features/p13n/upsert-filter-preset.interactor";
import { DeleteFilterPresetInteractor } from "@/features/p13n/delete-filter-preset.interactor";
// Feedback interactor
import { SendFeedbackInteractor } from "@/features/feedback/send-feedback.interactor";
import { SendContactInquiryInteractor } from "@/features/contact/send-contact-inquiry.interactor";
// API Key interactors
import { CreateApiKeyInteractor } from "@/features/api-key/create-api-key.interactor";
import { GetApiKeysInteractor } from "@/features/api-key/get-api-keys.interactor";
import { DeleteApiKeyInteractor } from "@/features/api-key/delete-api-key.interactor";
// EE Subscription interactors
import { CreateCheckoutSessionInteractor } from "@/ee/subscription/create-checkout-session.interactor";
import { GetSubscriptionInteractor } from "@/ee/subscription/get-subscription.interactor";
import { RefreshSubscriptionInteractor } from "@/ee/subscription/refresh-subscription.interactor";
// EE Lifecycle interactors (trigger.dev cron consumers)
import { SendWelcomeAndDemoInteractor } from "@/ee/lifecycle/send-welcome-and-demo.interactor";
import { SendTrialExtensionOfferInteractor } from "@/ee/lifecycle/send-trial-extension-offer.interactor";
import { SendTrialInactivationReminderInteractor } from "@/ee/lifecycle/send-trial-inactivation-reminder.interactor";
import { DeactivateTrialUsersAndSendNoticeInteractor } from "@/ee/lifecycle/deactivate-trial-users-and-send-notice.interactor";
import { DeactivateUsersAfterSubscriptionGracePeriodInteractor } from "@/ee/lifecycle/deactivate-users-after-subscription-grace-period.interactor";
// Webhook delivery interactor (trigger.dev task consumer)
import { DeliverWebhookInteractor } from "@/features/webhook/deliver-webhook.interactor";
// Widget recalc trigger.dev task consumer
import { RecalculateCompanyWidgetsInteractor } from "@/features/widget/recalculate-company-widgets.interactor";
// EE Audit Log interactors
import { GetAuditLogsByEntityIdInteractor } from "@/ee/audit-log/get/get-audit-logs-by-entity-id.interactor";
import { GetAuditLogsInteractor } from "@/ee/audit-log/get/get-audit-logs.interactor";
import { GetEntityChangeHistoryByIdInteractor } from "@/ee/audit-log/get/get-entity-change-history-by-id.interactor";
// Validators
import { ValidateQueryParamsValidator } from "@/core/base/validate-query-params.validator";

// ─── Section 2: Repos ───────────────────────────────────────────────────────

export const getContactRepo = () => new PrismaContactRepo();
export const getOrganizationRepo = () => new PrismaOrganizationRepo();
export const getDealRepo = () => new PrismaDealRepo();
export const getServiceRepo = () => new PrismaServiceRepo();
export const getTaskRepo = () => new PrismaTaskRepo();
export const getUserRepo = () => new PrismaUserRepo();
export const getCompanyRepo = () => new PrismaCompanyRepo();
export const getRoleRepo = () => new PrismaRoleRepo();
export const getCustomColumnRepo = () => new PrismaCustomColumnRepo();
export const getP13nRepo = () => new PrismaP13nRepo();
export const getWidgetRepo = () => new PrismaWidgetRepo();
export const getWidgetCalculatorRepo = () => new PrismaWidgetCalculatorRepo();
export const getWebhookRepo = () => new PrismaWebhookRepo();
export const getWebhookDeliveryRepo = () => new PrismaWebhookDeliveryRepo();
export const getAuditLogRepo = () => new PrismaAuditLogRepo();

// ─── Section 3: Services ────────────────────────────────────────────────────

export const getEmailService = () => new EmailService();
export const getAuthService = () => new AuthService(getEmailService());
export const getUserService = () => new UserService(getAuthService(), getUserRepo());
export const getRouteGuardService = () => new RouteGuardService(getAuthService(), getUserService(), getCompanyRepo());
export const getTaskService = () => new TaskService(getTaskRepo());
export const getValidateQueryParams = () => new ValidateQueryParamsValidator();
export const getBackgroundTaskService = () => new BackgroundTaskService();
export const getUserPendingAuthorizationTaskListener = () => new UserPendingAuthorizationTaskListener(getTaskService());
export const getWidgetRecalcEventListener = () => new WidgetRecalcEventListener(getBackgroundTaskService());

const EXPECTED_EVENT_LISTENERS = [
  {
    factory: getUserPendingAuthorizationTaskListener,
    events: [DomainEvent.USER_REGISTERED, DomainEvent.USER_UPDATED],
  },
  {
    factory: getWidgetRecalcEventListener,
    events: [
      DomainEvent.CONTACT_CREATED,
      DomainEvent.CONTACT_UPDATED,
      DomainEvent.CONTACT_DELETED,
      DomainEvent.ORGANIZATION_CREATED,
      DomainEvent.ORGANIZATION_UPDATED,
      DomainEvent.ORGANIZATION_DELETED,
      DomainEvent.DEAL_CREATED,
      DomainEvent.DEAL_UPDATED,
      DomainEvent.DEAL_DELETED,
      DomainEvent.SERVICE_CREATED,
      DomainEvent.SERVICE_UPDATED,
      DomainEvent.SERVICE_DELETED,
      DomainEvent.TASK_CREATED,
      DomainEvent.TASK_UPDATED,
      DomainEvent.TASK_DELETED,
      DomainEvent.ROLE_CREATED,
      DomainEvent.ROLE_UPDATED,
      DomainEvent.ROLE_DELETED,
      DomainEvent.CUSTOM_COLUMN_CREATED,
      DomainEvent.CUSTOM_COLUMN_UPDATED,
      DomainEvent.CUSTOM_COLUMN_DELETED,
    ],
  },
] as const;

export const getEventService = () => {
  const listeners = EXPECTED_EVENT_LISTENERS.map(({ factory, events }) => {
    const listener = factory();
    for (const event of events) {
      if (!listener.handles(event)) {
        throw new Error(
          `Event listener ${listener.constructor.name} is missing handler for "${event}". ` +
            `Check its declarative \`handlers\` field.`,
        );
      }
    }
    return listener;
  });

  return new EventService(
    listeners,
    getWebhookRepo(),
    getWebhookDeliveryRepo(),
    getAuditLogRepo(),
    getBackgroundTaskService(),
  );
};
export const getWidgetService = () => new WidgetService(getWidgetRepo());
export const getWidgetDataFetcher = () => new WidgetDataFetcher();
export const getWidgetGroupingService = () => new WidgetGroupingService();
export const getSubscriptionService = () => new SubscriptionService(getCompanyRepo());

// ─── Section 4: Interactors ─────────────────────────────────────────────────

// --- Contacts ---

export const getGetContactsInteractor = () => new GetContactsInteractor(getContactRepo(), getP13nRepo());

export const getGetContactsApiInteractor = () => new GetContactsApiInteractor(getContactRepo(), getP13nRepo());

export const getGetContactsConfigurationInteractor = () => new GetContactsConfigurationInteractor(getContactRepo());

export const getGetContactByIdInteractor = () => new GetContactByIdInteractor(getContactRepo(), getCustomColumnRepo());

export const getCreateContactInteractor = () =>
  new CreateContactInteractor(getContactRepo(), getOrganizationRepo(), getDealRepo(), getTaskRepo(), getEventService());

export const getCreateManyContactsInteractor = () =>
  new CreateManyContactsInteractor(
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
  );

export const getUpdateContactInteractor = () =>
  new UpdateContactInteractor(getContactRepo(), getOrganizationRepo(), getDealRepo(), getTaskRepo(), getEventService());

export const getUpdateManyContactsInteractor = () =>
  new UpdateManyContactsInteractor(
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
  );

export const getDeleteContactInteractor = () =>
  new DeleteContactInteractor(getContactRepo(), getOrganizationRepo(), getDealRepo(), getTaskRepo(), getEventService());

export const getDeleteManyContactsInteractor = () =>
  new DeleteManyContactsInteractor(
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
  );

// --- Organizations ---

export const getGetOrganizationsInteractor = () => new GetOrganizationsInteractor(getOrganizationRepo(), getP13nRepo());

export const getGetOrganizationsApiInteractor = () =>
  new GetOrganizationsApiInteractor(getOrganizationRepo(), getP13nRepo());

export const getGetOrganizationsConfigurationInteractor = () =>
  new GetOrganizationsConfigurationInteractor(getOrganizationRepo());

export const getGetOrganizationByIdInteractor = () =>
  new GetOrganizationByIdInteractor(getOrganizationRepo(), getCustomColumnRepo());

export const getCreateOrganizationInteractor = () =>
  new CreateOrganizationInteractor(
    getOrganizationRepo(),
    getContactRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
  );

export const getCreateManyOrganizationsInteractor = () =>
  new CreateManyOrganizationsInteractor(
    getOrganizationRepo(),
    getContactRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
  );

export const getUpdateOrganizationInteractor = () =>
  new UpdateOrganizationInteractor(
    getOrganizationRepo(),
    getContactRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
  );

export const getUpdateManyOrganizationsInteractor = () =>
  new UpdateManyOrganizationsInteractor(
    getOrganizationRepo(),
    getContactRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
  );

export const getDeleteOrganizationInteractor = () =>
  new DeleteOrganizationInteractor(
    getOrganizationRepo(),
    getContactRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
  );

export const getDeleteManyOrganizationsInteractor = () =>
  new DeleteManyOrganizationsInteractor(
    getOrganizationRepo(),
    getContactRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
  );

// --- Deals ---

export const getGetDealsInteractor = () => new GetDealsInteractor(getDealRepo(), getP13nRepo());

export const getGetDealsApiInteractor = () => new GetDealsApiInteractor(getDealRepo(), getP13nRepo());

export const getGetDealsConfigurationInteractor = () => new GetDealsConfigurationInteractor(getDealRepo());

export const getGetDealByIdInteractor = () => new GetDealByIdInteractor(getDealRepo(), getCustomColumnRepo());

export const getCreateDealInteractor = () =>
  new CreateDealInteractor(
    getDealRepo(),
    getOrganizationRepo(),
    getContactRepo(),
    getServiceRepo(),
    getTaskRepo(),
    getEventService(),
  );

export const getCreateManyDealsInteractor = () =>
  new CreateManyDealsInteractor(
    getDealRepo(),
    getOrganizationRepo(),
    getContactRepo(),
    getServiceRepo(),
    getTaskRepo(),
    getEventService(),
  );

export const getUpdateDealInteractor = () =>
  new UpdateDealInteractor(
    getDealRepo(),
    getOrganizationRepo(),
    getContactRepo(),
    getServiceRepo(),
    getTaskRepo(),
    getEventService(),
  );

export const getUpdateManyDealsInteractor = () =>
  new UpdateManyDealsInteractor(
    getDealRepo(),
    getOrganizationRepo(),
    getContactRepo(),
    getServiceRepo(),
    getTaskRepo(),
    getEventService(),
  );

export const getDeleteDealInteractor = () =>
  new DeleteDealInteractor(
    getDealRepo(),
    getOrganizationRepo(),
    getContactRepo(),
    getServiceRepo(),
    getTaskRepo(),
    getEventService(),
  );

export const getDeleteManyDealsInteractor = () =>
  new DeleteManyDealsInteractor(
    getDealRepo(),
    getOrganizationRepo(),
    getContactRepo(),
    getServiceRepo(),
    getTaskRepo(),
    getEventService(),
  );

// --- Services ---

export const getGetServicesInteractor = () => new GetServicesInteractor(getServiceRepo(), getP13nRepo());

export const getGetServicesApiInteractor = () => new GetServicesApiInteractor(getServiceRepo(), getP13nRepo());

export const getGetServicesConfigurationInteractor = () => new GetServicesConfigurationInteractor(getServiceRepo());

export const getGetServiceByIdInteractor = () => new GetServiceByIdInteractor(getServiceRepo(), getCustomColumnRepo());

export const getCreateServiceInteractor = () =>
  new CreateServiceInteractor(getServiceRepo(), getDealRepo(), getTaskRepo(), getEventService());

export const getCreateManyServicesInteractor = () =>
  new CreateManyServicesInteractor(getServiceRepo(), getDealRepo(), getTaskRepo(), getEventService());

export const getUpdateServiceInteractor = () =>
  new UpdateServiceInteractor(getServiceRepo(), getDealRepo(), getTaskRepo(), getEventService());

export const getUpdateManyServicesInteractor = () =>
  new UpdateManyServicesInteractor(getServiceRepo(), getDealRepo(), getTaskRepo(), getEventService());

export const getDeleteServiceInteractor = () =>
  new DeleteServiceInteractor(getServiceRepo(), getDealRepo(), getTaskRepo(), getEventService());

export const getDeleteManyServicesInteractor = () =>
  new DeleteManyServicesInteractor(getServiceRepo(), getDealRepo(), getTaskRepo(), getEventService());

// --- Tasks ---

export const getGetTasksInteractor = () => new GetTasksInteractor(getTaskRepo(), getP13nRepo());

export const getGetTasksApiInteractor = () => new GetTasksApiInteractor(getTaskRepo(), getP13nRepo());

export const getGetTasksConfigurationInteractor = () => new GetTasksConfigurationInteractor(getTaskRepo());

export const getGetTaskByIdInteractor = () => new GetTaskByIdInteractor(getTaskRepo(), getCustomColumnRepo());

export const getCountUserTasksInteractor = () => new CountUserTasksInteractor(getTaskRepo());

export const getCountSystemTasksInteractor = () => new CountSystemTasksInteractor(getTaskRepo());

export const getCreateTaskInteractor = () =>
  new CreateTaskInteractor(
    getTaskRepo(),
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getServiceRepo(),
    getEventService(),
  );

export const getCreateManyTasksInteractor = () =>
  new CreateManyTasksInteractor(
    getTaskRepo(),
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getServiceRepo(),
    getEventService(),
  );

export const getUpdateTaskInteractor = () =>
  new UpdateTaskInteractor(
    getTaskRepo(),
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getServiceRepo(),
    getEventService(),
  );

export const getUpdateManyTasksInteractor = () =>
  new UpdateManyTasksInteractor(
    getTaskRepo(),
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getServiceRepo(),
    getEventService(),
  );

export const getDeleteTaskInteractor = () =>
  new DeleteTaskInteractor(
    getTaskRepo(),
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getServiceRepo(),
    getEventService(),
  );

export const getDeleteManyTasksInteractor = () =>
  new DeleteManyTasksInteractor(
    getTaskRepo(),
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getServiceRepo(),
    getEventService(),
  );

// --- User ---

export const getRegisterUserInteractor = () =>
  new RegisterUserInteractor(getAuthService(), getUserRepo(), getEventService());

export const getUpdateUserDetailsInteractor = () => new UpdateUserDetailsInteractor(getUserRepo(), getEventService());

export const getSeedOnboardingDataInteractor = () =>
  new SeedOnboardingDataInteractor(getUserRepo(), getWidgetService());

export const getCompleteOnboardingWizardInteractor = () => new CompleteOnboardingWizardInteractor(getUserRepo());

export const getUpdateUserSettingsInteractor = () => new UpdateUserSettingsInteractor(getUserRepo());

export const getGetUserDetailsInteractor = () => new GetUserDetailsInteractor();

export const getGetUserByIdInteractor = () => new GetUserByIdInteractor(getUserRepo());

export const getAdminUpdateUserDetailsInteractor = () =>
  new AdminUpdateUserDetailsInteractor(
    getUserRepo(),
    getRoleRepo(),
    getEventService(),
    getSubscriptionService(),
    getCompanyRepo(),
  );

export const getGetUsersInteractor = () => new GetUsersInteractor(getCompanyRepo(), getP13nRepo());

export const getGetUsersApiInteractor = () => new GetUsersApiInteractor(getCompanyRepo(), getP13nRepo());

// --- Auth ---

export const getSignInWithEmailInteractor = () => new SignInWithEmailInteractor(getAuthService());

export const getSignUpWithEmailInteractor = () => new SignUpWithEmailInteractor(getAuthService());

export const getRequestPasswordResetInteractor = () => new RequestPasswordResetInteractor(getAuthService());

export const getResetPasswordInteractor = () => new ResetPasswordInteractor(getAuthService());

export const getContinueWithSocialsInteractor = () =>
  new ContinueWithSocialsInteractor(getAuthService(), getUserRepo());

export const getResendVerificationEmailInteractor = () => new ResendVerificationEmailInteractor(getAuthService());

export const getSignOutInteractor = () => new SignOutInteractor(getAuthService());

// --- Company ---

export const getGetCompanyDetailsInteractor = () => new GetCompanyDetailsInteractor(getCompanyRepo());

export const getUpdateCompanyDetailsInteractor = () =>
  new UpdateCompanyDetailsInteractor(getCompanyRepo(), getEventService());

export const getGetOrCreateInviteTokenInteractor = () => new GetOrCreateInviteTokenInteractor(getCompanyRepo());

export const getInviteUsersByEmailInteractor = () =>
  new InviteUsersByEmailInteractor(
    getEmailService(),
    getGetOrCreateInviteTokenInteractor(),
    getGetCompanyDetailsInteractor(),
  );

export const getInviteTokenValidationInteractor = () => new InviteTokenValidationInteractor(getCompanyRepo());

// --- Role ---

export const getUpsertRoleInteractor = () => new UpsertRoleInteractor(getRoleRepo(), getEventService());

export const getGetRolesInteractor = () => new GetRolesInteractor(getRoleRepo(), getP13nRepo());

export const getDeleteRoleInteractor = () => new DeleteRoleInteractor(getRoleRepo(), getEventService());

// --- Widget ---

export const getGetWidgetsInteractor = () => new GetWidgetsInteractor(getWidgetRepo());
export const getRecalculateUserWidgetsInteractor = () =>
  new RecalculateUserWidgetsInteractor(getWidgetService(), getWidgetRepo());

export const getUpsertWidgetInteractor = () => new UpsertWidgetInteractor(getWidgetRepo());

export const getDeleteWidgetInteractor = () => new DeleteWidgetInteractor(getWidgetRepo());

export const getUpdateWidgetLayoutsInteractor = () => new UpdateWidgetLayoutsInteractor(getWidgetRepo());

export const getGetCompanyWidgetsInteractor = () => new GetCompanyWidgetsInteractor(getWidgetRepo());

export const getGetWidgetByIdInteractor = () => new GetWidgetByIdInteractor(getWidgetRepo());

export const getGetWidgetFilterableFieldsInteractor = () =>
  new GetWidgetFilterableFieldsInteractor(
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getServiceRepo(),
    getTaskRepo(),
  );

// --- Webhook ---

export const getGetWebhooksInteractor = () => new GetWebhooksInteractor(getWebhookRepo(), getP13nRepo());

export const getUpsertWebhookInteractor = () => new UpsertWebhookInteractor(getWebhookRepo(), getEventService());

export const getDeleteWebhookInteractor = () => new DeleteWebhookInteractor(getWebhookRepo(), getEventService());

export const getGetWebhookDeliveriesInteractor = () =>
  new GetWebhookDeliveriesInteractor(getWebhookDeliveryRepo(), getP13nRepo());

export const getResendWebhookDeliveryInteractor = () =>
  new ResendWebhookDeliveryInteractor(getWebhookDeliveryRepo(), getWebhookDeliveryRepo(), getBackgroundTaskService());

// --- Custom Column ---

export const getGetCustomColumnsInteractor = () => new GetCustomColumnsInteractor(getCustomColumnRepo());

export const getGetCustomColumnsByEntityTypeInteractor = () =>
  new GetCustomColumnsByEntityTypeInteractor(getCustomColumnRepo());

export const getUpsertCustomColumnInteractor = () =>
  new UpsertCustomColumnInteractor(getCustomColumnRepo(), getUserService(), getEventService());

export const getDeleteCustomColumnInteractor = () =>
  new DeleteCustomColumnInteractor(getCustomColumnRepo(), getUserService(), getEventService());

// --- Search ---

export const getGlobalSearchInteractor = () => new GlobalSearchInteractor();

// --- P13n ---

export const getUpsertP13nInteractor = () => new UpsertP13nInteractor(getP13nRepo());

export const getUpsertFilterPresetInteractor = () => new UpsertFilterPresetInteractor(getP13nRepo());

export const getDeleteFilterPresetInteractor = () => new DeleteFilterPresetInteractor(getP13nRepo());

// --- Feedback ---

export const getSendFeedbackInteractor = () => new SendFeedbackInteractor(getEmailService());

// --- Contact ---

export const getSendContactInquiryInteractor = () => new SendContactInquiryInteractor(getEmailService());

// --- API Key ---

export const getCreateApiKeyInteractor = () => new CreateApiKeyInteractor(getAuthService());

export const getGetApiKeysInteractor = () => new GetApiKeysInteractor(getAuthService());

export const getDeleteApiKeyInteractor = () => new DeleteApiKeyInteractor(getAuthService());

// --- EE Subscription ---

export const getCreateCheckoutSessionInteractor = () =>
  new CreateCheckoutSessionInteractor(getSubscriptionService(), getCompanyRepo());

export const getGetSubscriptionInteractor = () =>
  new GetSubscriptionInteractor(getCompanyRepo(), getSubscriptionService());

export const getRefreshSubscriptionInteractor = () =>
  new RefreshSubscriptionInteractor(getCompanyRepo(), getSubscriptionService());

// --- EE Audit Log ---

export const getGetAuditLogsByEntityIdInteractor = () => new GetAuditLogsByEntityIdInteractor(getAuditLogRepo());

export const getGetAuditLogsInteractor = () => new GetAuditLogsInteractor(getAuditLogRepo(), getP13nRepo());

export const getGetEntityChangeHistoryByIdInteractor = () =>
  new GetEntityChangeHistoryByIdInteractor(getAuditLogRepo(), getCustomColumnRepo());

// --- EE Lifecycle (trigger.dev cron) ---

export const getSendWelcomeAndDemoInteractor = () => new SendWelcomeAndDemoInteractor(getUserRepo(), getEmailService());

export const getSendTrialExtensionOfferInteractor = () =>
  new SendTrialExtensionOfferInteractor(getUserRepo(), getEmailService());

export const getSendTrialInactivationReminderInteractor = () =>
  new SendTrialInactivationReminderInteractor(getUserRepo(), getEmailService());

export const getDeactivateTrialUsersAndSendNoticeInteractor = () =>
  new DeactivateTrialUsersAndSendNoticeInteractor(getUserRepo(), getEmailService());

export const getDeactivateUsersAfterSubscriptionGracePeriodInteractor = () =>
  new DeactivateUsersAfterSubscriptionGracePeriodInteractor(getUserRepo(), getEmailService());

// --- Webhook delivery (trigger.dev task) ---

export const getDeliverWebhookInteractor = () => new DeliverWebhookInteractor(getWebhookDeliveryRepo());

// --- Widget recalc (trigger.dev task) ---

export const getRecalculateCompanyWidgetsInteractor = () =>
  new RecalculateCompanyWidgetsInteractor(getUserRepo(), getWidgetService());
