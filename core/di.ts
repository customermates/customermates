/**
 * Application dependency injection - single source of truth for everything wired
 * into the Next.js app, including the in-process workflow steps.
 *
 * Structure:
 *   Section 1: Imports (concrete classes only, from specific files)
 *   Section 2: Repo getters (fresh per call)
 *   Section 3: Service getters (fresh per call)
 *   Section 4: Interactor getters (fresh per call, deps from getters)
 *
 * The auth chain returns `Redirect` outcomes instead of calling `redirect()`
 * from `next/navigation` directly, so it stays framework-agnostic and
 * workflow-worker-safe. Outcome translation lives in
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
import { PrismaMessagingRepo } from "@/ee/messaging/persistence/prisma-messaging.repository";
import { PrismaConnectedAccountRepo } from "@/ee/messaging/persistence/prisma-connected-account.repository";
import { PrismaUnipileWebhookRepo } from "@/ee/messaging/persistence/prisma-unipile-webhook.repository";
import { PrismaCalendarRepo } from "@/ee/calendar/prisma-calendar.repository";
import { PrismaAgentChatRepo } from "@/features/agent-chat/prisma-agent-chat.repository";
import { PrismaAgentSkillRepo } from "@/features/agent-chat/prisma-agent-skill.repository";
// Agent chat interactors
import { ListEnabledAgentSkillsInteractor } from "@/features/agent-chat/list-enabled-agent-skills.interactor";
import { GetAgentSkillByNameInteractor } from "@/features/agent-chat/get-agent-skill-by-name.interactor";
import { ListAgentSkillsInteractor } from "@/features/agent-chat/list-agent-skills.interactor";
import { GetAgentSkillByIdInteractor } from "@/features/agent-chat/get-agent-skill-by-id.interactor";
import { CreateAgentSkillInteractor } from "@/features/agent-chat/create-agent-skill.interactor";
import { UpdateAgentSkillInteractor } from "@/features/agent-chat/update-agent-skill.interactor";
import { DeleteAgentSkillInteractor } from "@/features/agent-chat/delete-agent-skill.interactor";
import { ListAgentConversationsInteractor } from "@/features/agent-chat/list-agent-conversations.interactor";
import { GetAgentConversationInteractor } from "@/features/agent-chat/get-agent-conversation.interactor";
import { DeleteAgentConversationInteractor } from "@/features/agent-chat/delete-agent-conversation.interactor";
import { RenameAgentConversationInteractor } from "@/features/agent-chat/rename-agent-conversation.interactor";
import { SetPreAuthorizedToolsInteractor } from "@/features/agent-chat/set-pre-authorized-tools.interactor";
// Services
import { EmailService } from "@/features/email/email.service";
import { MessagingService } from "@/ee/messaging/messaging.service";
import { UnipileWebhookIngestService } from "@/ee/messaging/webhooks/unipile-webhook-ingest.service";
import { AuthService } from "@/features/auth/auth.service";
import { UserService } from "@/features/user/user.service";
import { RouteGuardService } from "@/features/auth/route-guard.service";
import { EventService } from "@/features/event/event.service";
import { WidgetDataFetcher } from "@/features/widget/calculator/widget-data-fetcher.service";
import { WidgetGroupingService } from "@/features/widget/calculator/widget-grouping.service";
import { SubscriptionService } from "@/ee/subscription/subscription.service";
import { BackgroundTaskService } from "@/core/utils/background-task.service";
// Task Listeners
import { UserPendingAuthorizationTaskListener } from "@/features/tasks/listener/user-pending-authorization-task.listener";
import { DomainEvent } from "@/features/event/domain-events";
// Contacts interactors
import { GetContactsInteractor } from "@/features/contacts/get/get-contacts.interactor";
import { GetContactsConfigurationInteractor } from "@/features/contacts/get/get-contacts-configuration.interactor";
import { GetContactByIdInteractor } from "@/features/contacts/get/get-contact-by-id.interactor";
import { CreateContactInteractor } from "@/features/contacts/upsert/create-contact.interactor";
import { ContactWritePrecheckInteractor } from "@/features/contacts/upsert/contact-write-precheck.interactor";
import { ValidateIdentifierConflictsInteractor } from "@/features/contacts/upsert/validate-identifier-conflicts.interactor";
import { OrganizationWritePrecheckInteractor } from "@/features/organizations/upsert/organization-write-precheck.interactor";
import { TaskWritePrecheckInteractor } from "@/features/tasks/upsert/task-write-precheck.interactor";
import { ValidateSystemTaskIdsInteractor } from "@/features/tasks/upsert/validate-system-task-ids.interactor";
import { ValidateSystemTaskNameInteractor } from "@/features/tasks/upsert/validate-system-task-name.interactor";
import { DealWritePrecheckInteractor } from "@/features/deals/upsert/deal-write-precheck.interactor";
import { ServiceWritePrecheckInteractor } from "@/features/services/upsert/service-write-precheck.interactor";
import { ValidateAssigneeGuardInteractor } from "@/core/validation/validators/validate-assignee-guard.interactor";
import { ValidateContactIdsInteractor } from "@/core/validation/validators/validate-contact-ids.interactor";
import { ValidateCustomColumnIdsInteractor } from "@/core/validation/validators/validate-custom-column-ids.interactor";
import { ValidateCustomFieldValuesInteractor } from "@/core/validation/validators/validate-custom-field-values.interactor";
import { ValidateDealIdsInteractor } from "@/core/validation/validators/validate-deal-ids.interactor";
import { ValidateOrganizationIdsInteractor } from "@/core/validation/validators/validate-organization-ids.interactor";
import { ValidateRoleIdsInteractor } from "@/core/validation/validators/validate-role-ids.interactor";
import { ValidateServiceIdsInteractor } from "@/core/validation/validators/validate-service-ids.interactor";
import { ValidateTaskIdsInteractor } from "@/core/validation/validators/validate-task-ids.interactor";
import { ValidateThreadIdsInteractor } from "@/core/validation/validators/validate-thread-ids.interactor";
import { ValidateUserIdsInteractor } from "@/core/validation/validators/validate-user-ids.interactor";
import { ValidateWebhookDeliveryIdsInteractor } from "@/core/validation/validators/validate-webhook-delivery-ids.interactor";
import { ValidateWebhookIdsInteractor } from "@/core/validation/validators/validate-webhook-ids.interactor";
import { ValidateWidgetIdsInteractor } from "@/core/validation/validators/validate-widget-ids.interactor";
import { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";
import { CheckChannelConflictInteractor } from "@/features/contacts/upsert/check-channel-conflict.interactor";
import { CreateManyContactsInteractor } from "@/features/contacts/upsert/create-many-contacts.interactor";
import { UpdateContactInteractor } from "@/features/contacts/upsert/update-contact.interactor";
import { UpdateManyContactsInteractor } from "@/features/contacts/upsert/update-many-contacts.interactor";
import { DeleteContactInteractor } from "@/features/contacts/delete/delete-contact.interactor";
import { DeleteManyContactsInteractor } from "@/features/contacts/delete/delete-many-contacts.interactor";
// Organizations interactors
import { GetOrganizationsInteractor } from "@/features/organizations/get/get-organizations.interactor";
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
import { UpsertWidgetInteractor } from "@/features/widget/upsert-widget.interactor";
import { DeleteWidgetInteractor } from "@/features/widget/delete-widget.interactor";
import { UpdateWidgetLayoutsInteractor } from "@/features/widget/update-widget-layouts.interactor";
import { GetCompanyWidgetsInteractor } from "@/features/widget/get-company-widgets.interactor";
import { GetWidgetByIdInteractor } from "@/features/widget/get-widget-by-id.interactor";
import { GetWidgetFilterableFieldsInteractor } from "@/features/widget/get-widget-filterable-fields.interactor";
// Messaging interactors
import { CreateHostedAuthLinkInteractor } from "@/ee/messaging/connect/create-hosted-auth-link.interactor";
import { GetMyConnectedAccountsInteractor } from "@/ee/messaging/connect/get-my-connected-accounts.interactor";
import { DeleteConnectedAccountInteractor } from "@/ee/messaging/connect/delete-connected-account.interactor";
import { ResyncConnectedAccountInteractor } from "@/ee/messaging/connect/resync-connected-account.interactor";
import { ResyncThreadInteractor } from "@/ee/messaging/inbox/resync-thread.interactor";
import { ReconnectConnectedAccountInteractor } from "@/ee/messaging/connect/reconnect-connected-account.interactor";
import { SetConnectedAccountVisibilityInteractor } from "@/ee/messaging/connect/set-connected-account-visibility.interactor";
import { ProcessAccountCallbackInteractor } from "@/ee/messaging/webhooks/process-account-callback.interactor";
import { ProcessAccountStatusWebhookInteractor } from "@/ee/messaging/webhooks/process-account-status-webhook.interactor";
import { ProcessMessagingWebhookInteractor } from "@/ee/messaging/webhooks/process-messaging-webhook.interactor";
import { ProcessEmailWebhookInteractor } from "@/ee/messaging/webhooks/process-email-webhook.interactor";
import { BackfillConnectedAccountInteractor } from "@/ee/messaging/ingest/backfill-connected-account.interactor";
import { ReleaseBackfillClaimInteractor } from "@/ee/messaging/ingest/release-backfill-claim.interactor";
import { BackfillEmailsInteractor } from "@/ee/messaging/ingest/backfill/backfill-emails.interactor";
import { BackfillChatsInteractor } from "@/ee/messaging/ingest/backfill/backfill-chats.interactor";
import { BackfillCalendarsInteractor } from "@/ee/messaging/ingest/backfill/backfill-calendars.interactor";
import { ProcessUsersWebhookInteractor } from "@/ee/messaging/webhooks/process-users-webhook.interactor";
import { SendChatMessageInteractor } from "@/ee/messaging/outbound/send-chat-message.interactor";
import { SendEmailInteractor } from "@/ee/messaging/outbound/send-email.interactor";
import { StartChatInteractor } from "@/ee/messaging/outbound/start-chat.interactor";
import { ResolveProviderProfileInteractor } from "@/ee/messaging/outbound/resolve-provider-profile.interactor";
import { SearchChannelCandidatesInteractor } from "@/ee/messaging/inbox/search-channel-candidates.interactor";
import { ProcessUnipileWebhookEventInteractor } from "@/ee/messaging/ingest/process-unipile-webhook-event.interactor";
import { ReprocessStuckWebhookEventsInteractor } from "@/ee/messaging/ingest/reprocess-stuck-webhook-events.interactor";
import { GetMessagingThreadsInteractor } from "@/ee/messaging/inbox/get-messaging-threads.interactor";
import { GetMessagingThreadInteractor } from "@/ee/messaging/inbox/get-messaging-thread.interactor";
import { GetMessageAttachmentInteractor } from "@/ee/messaging/inbox/get-message-attachment.interactor";
import { GetUnreadThreadCountInteractor } from "@/ee/messaging/inbox/get-unread-thread-count.interactor";
import { GetActivitiesInteractor } from "@/ee/messaging/activities/get-activities.interactor";
import { GetActivityThreadOptionsInteractor } from "@/ee/messaging/activities/get-activity-thread-options.interactor";
import { PrismaActivitiesRepo } from "@/ee/messaging/activities/prisma-activities.repository";
import { UpdateThreadInteractor } from "@/ee/messaging/thread-state/update-thread.interactor";
// Calendar interactors
import { ProcessCalendarWebhookInteractor } from "@/ee/messaging/webhooks/process-calendar-webhook.interactor";
// Webhook interactors
import { GetWebhooksInteractor } from "@/features/webhook/get-webhooks.interactor";
import { UpsertWebhookInteractor } from "@/features/webhook/upsert-webhook.interactor";
import { DeleteWebhookInteractor } from "@/features/webhook/delete-webhook.interactor";
import { GetWebhookDeliveriesInteractor } from "@/features/webhook/get-webhook-deliveries.interactor";
import { ResendWebhookDeliveryInteractor } from "@/features/webhook/resend-webhook-delivery.interactor";
import { GetWebhookByIdInteractor } from "@/features/webhook/get-webhook-by-id.interactor";
import { ModifyEntityRelationInteractor } from "@/features/relations/modify-entity-relation.interactor";
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
// EE Lifecycle interactors (cron consumers)
import { SendWelcomeAndDemoInteractor } from "@/ee/lifecycle/send-welcome-and-demo.interactor";
import { SendTrialExtensionOfferInteractor } from "@/ee/lifecycle/send-trial-extension-offer.interactor";
import { SendTrialInactivationReminderInteractor } from "@/ee/lifecycle/send-trial-inactivation-reminder.interactor";
import { DeactivateTrialUsersAndSendNoticeInteractor } from "@/ee/lifecycle/deactivate-trial-users-and-send-notice.interactor";
import { DeactivateUsersAfterSubscriptionGracePeriodInteractor } from "@/ee/lifecycle/deactivate-users-after-subscription-grace-period.interactor";
// Webhook delivery interactor (workflow task consumer)
import { DeliverWebhookInteractor } from "@/features/webhook/deliver-webhook.interactor";
// EE Audit Log interactors
import { GetAuditLogsInteractor } from "@/ee/audit-log/get/get-audit-logs.interactor";
// Validators

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
export const getMessagingRepo = () => new PrismaMessagingRepo();
export const getConnectedAccountRepo = () => new PrismaConnectedAccountRepo();
export const getUnipileWebhookRepo = () => new PrismaUnipileWebhookRepo();
export const getCalendarRepo = () => new PrismaCalendarRepo();

// ─── Section 3: Services ────────────────────────────────────────────────────

export const getEmailService = () => new EmailService();
export const getAuthService = () => new AuthService(getEmailService());
export const getUserService = () => new UserService(getAuthService(), getUserRepo());
export const getRouteGuardService = () => new RouteGuardService(getAuthService(), getUserService(), getCompanyRepo());
export const getBackgroundTaskService = () => new BackgroundTaskService();
export const getUserPendingAuthorizationTaskListener = () => new UserPendingAuthorizationTaskListener(getTaskRepo());

const EXPECTED_EVENT_LISTENERS = [
  {
    factory: getUserPendingAuthorizationTaskListener,
    events: [DomainEvent.USER_REGISTERED, DomainEvent.USER_UPDATED],
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
export const getWidgetDataFetcher = () => new WidgetDataFetcher();
export const getWidgetGroupingService = () => new WidgetGroupingService();
export const getSubscriptionService = () => new SubscriptionService(getCompanyRepo());
export const getMessagingService = () => new MessagingService();
export const getUnipileWebhookIngestService = () =>
  new UnipileWebhookIngestService(
    getUnipileWebhookRepo(),
    getConnectedAccountRepo(),
    getUserRepo(),
    getBackgroundTaskService(),
  );

// ─── Section 4: Interactors ─────────────────────────────────────────────────

// --- Contacts ---

export const getGetContactsInteractor = () =>
  new GetContactsInteractor(getContactRepo(), getP13nRepo(), "interactive", getQueryParamsPrecheck());

export const getGetContactsApiInteractor = () =>
  new GetContactsInteractor(getContactRepo(), getP13nRepo(), "api", getQueryParamsPrecheck());

export const getGetContactsConfigurationInteractor = () => new GetContactsConfigurationInteractor(getContactRepo());

export const getGetContactByIdInteractor = () => new GetContactByIdInteractor(getContactRepo(), getCustomColumnRepo());

export const getOrganizationIdsValidator = () => new ValidateOrganizationIdsInteractor(getOrganizationRepo());
export const getContactIdsValidator = () => new ValidateContactIdsInteractor(getContactRepo());
export const getUserIdsValidator = () => new ValidateUserIdsInteractor(getUserRepo());
export const getDealIdsValidator = () => new ValidateDealIdsInteractor(getDealRepo());
export const getTaskIdsValidator = () => new ValidateTaskIdsInteractor(getTaskRepo());
export const getCustomFieldValuesValidator = () => new ValidateCustomFieldValuesInteractor(getCustomColumnRepo());
export const getAssigneeGuardValidator = () => new ValidateAssigneeGuardInteractor(getUserService());
export const getIdentifierConflictsValidator = () => new ValidateIdentifierConflictsInteractor(getContactRepo());
export const getServiceIdsValidator = () => new ValidateServiceIdsInteractor(getServiceRepo());
export const getSystemTaskNameValidator = () => new ValidateSystemTaskNameInteractor(getTaskRepo());
export const getSystemTaskIdsValidator = () => new ValidateSystemTaskIdsInteractor(getTaskRepo());
export const getQueryParamsPrecheck = () =>
  new QueryParamsPrecheckInteractor(
    getOrganizationIdsValidator(),
    getContactIdsValidator(),
    getUserIdsValidator(),
    getDealIdsValidator(),
    getServiceIdsValidator(),
    getTaskIdsValidator(),
    getThreadIdsValidator(),
    getCustomColumnRepo(),
  );
export const getWidgetIdsValidator = () => new ValidateWidgetIdsInteractor(getWidgetRepo());
export const getCustomColumnIdsValidator = () => new ValidateCustomColumnIdsInteractor(getCustomColumnRepo());
export const getWebhookIdsValidator = () => new ValidateWebhookIdsInteractor(getWebhookRepo());
export const getWebhookDeliveryIdsValidator = () => new ValidateWebhookDeliveryIdsInteractor(getWebhookDeliveryRepo());
export const getRoleIdsValidator = () => new ValidateRoleIdsInteractor(getRoleRepo());
export const getThreadIdsValidator = () => new ValidateThreadIdsInteractor(getMessagingRepo());

export const getContactWritePrecheck = () =>
  new ContactWritePrecheckInteractor(
    getOrganizationIdsValidator(),
    getUserIdsValidator(),
    getDealIdsValidator(),
    getTaskIdsValidator(),
    getContactIdsValidator(),
    getCustomFieldValuesValidator(),
    getAssigneeGuardValidator(),
    getIdentifierConflictsValidator(),
    getContactRepo(),
  );

export const getOrganizationWritePrecheck = () =>
  new OrganizationWritePrecheckInteractor(
    getOrganizationIdsValidator(),
    getContactIdsValidator(),
    getUserIdsValidator(),
    getDealIdsValidator(),
    getTaskIdsValidator(),
    getCustomFieldValuesValidator(),
    getAssigneeGuardValidator(),
  );

export const getTaskWritePrecheck = () =>
  new TaskWritePrecheckInteractor(
    getOrganizationIdsValidator(),
    getUserIdsValidator(),
    getDealIdsValidator(),
    getTaskIdsValidator(),
    getContactIdsValidator(),
    getServiceIdsValidator(),
    getCustomFieldValuesValidator(),
    getAssigneeGuardValidator(),
    getSystemTaskNameValidator(),
    getSystemTaskIdsValidator(),
  );

export const getDealWritePrecheck = () =>
  new DealWritePrecheckInteractor(
    getOrganizationIdsValidator(),
    getUserIdsValidator(),
    getContactIdsValidator(),
    getServiceIdsValidator(),
    getTaskIdsValidator(),
    getDealIdsValidator(),
    getCustomFieldValuesValidator(),
    getAssigneeGuardValidator(),
  );

export const getServiceWritePrecheck = () =>
  new ServiceWritePrecheckInteractor(
    getUserIdsValidator(),
    getDealIdsValidator(),
    getTaskIdsValidator(),
    getServiceIdsValidator(),
    getCustomFieldValuesValidator(),
    getAssigneeGuardValidator(),
  );

export const getCreateContactInteractor = () =>
  new CreateContactInteractor(
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
    getContactWritePrecheck(),
  );

export const getCheckChannelConflictInteractor = () => new CheckChannelConflictInteractor(getContactRepo());

export const getCreateManyContactsInteractor = () =>
  new CreateManyContactsInteractor(
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
    getContactWritePrecheck(),
  );

export const getUpdateContactInteractor = () =>
  new UpdateContactInteractor(
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
    getContactWritePrecheck(),
  );

export const getUpdateManyContactsInteractor = () =>
  new UpdateManyContactsInteractor(
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
    getContactWritePrecheck(),
  );

export const getDeleteContactInteractor = () =>
  new DeleteContactInteractor(
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
    getContactWritePrecheck(),
  );

export const getDeleteManyContactsInteractor = () =>
  new DeleteManyContactsInteractor(
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
    getContactWritePrecheck(),
  );

// --- Organizations ---

export const getGetOrganizationsInteractor = () =>
  new GetOrganizationsInteractor(getOrganizationRepo(), getP13nRepo(), "interactive", getQueryParamsPrecheck());

export const getGetOrganizationsApiInteractor = () =>
  new GetOrganizationsInteractor(getOrganizationRepo(), getP13nRepo(), "api", getQueryParamsPrecheck());

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
    getOrganizationWritePrecheck(),
  );

export const getCreateManyOrganizationsInteractor = () =>
  new CreateManyOrganizationsInteractor(
    getOrganizationRepo(),
    getContactRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
    getOrganizationWritePrecheck(),
  );

export const getUpdateOrganizationInteractor = () =>
  new UpdateOrganizationInteractor(
    getOrganizationRepo(),
    getContactRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
    getOrganizationWritePrecheck(),
  );

export const getUpdateManyOrganizationsInteractor = () =>
  new UpdateManyOrganizationsInteractor(
    getOrganizationRepo(),
    getContactRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
    getOrganizationWritePrecheck(),
  );

export const getDeleteOrganizationInteractor = () =>
  new DeleteOrganizationInteractor(
    getOrganizationRepo(),
    getContactRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
    getOrganizationWritePrecheck(),
  );

export const getDeleteManyOrganizationsInteractor = () =>
  new DeleteManyOrganizationsInteractor(
    getOrganizationRepo(),
    getContactRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
    getOrganizationWritePrecheck(),
  );

// --- Deals ---

export const getGetDealsInteractor = () =>
  new GetDealsInteractor(getDealRepo(), getP13nRepo(), "interactive", getQueryParamsPrecheck());

export const getGetDealsApiInteractor = () =>
  new GetDealsInteractor(getDealRepo(), getP13nRepo(), "api", getQueryParamsPrecheck());

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
    getDealWritePrecheck(),
  );

export const getCreateManyDealsInteractor = () =>
  new CreateManyDealsInteractor(
    getDealRepo(),
    getOrganizationRepo(),
    getContactRepo(),
    getServiceRepo(),
    getTaskRepo(),
    getEventService(),
    getDealWritePrecheck(),
  );

export const getUpdateDealInteractor = () =>
  new UpdateDealInteractor(
    getDealRepo(),
    getOrganizationRepo(),
    getContactRepo(),
    getServiceRepo(),
    getTaskRepo(),
    getEventService(),
    getDealWritePrecheck(),
  );

export const getUpdateManyDealsInteractor = () =>
  new UpdateManyDealsInteractor(
    getDealRepo(),
    getOrganizationRepo(),
    getContactRepo(),
    getServiceRepo(),
    getTaskRepo(),
    getEventService(),
    getDealWritePrecheck(),
  );

export const getDeleteDealInteractor = () =>
  new DeleteDealInteractor(
    getDealRepo(),
    getOrganizationRepo(),
    getContactRepo(),
    getServiceRepo(),
    getTaskRepo(),
    getEventService(),
    getDealWritePrecheck(),
  );

export const getDeleteManyDealsInteractor = () =>
  new DeleteManyDealsInteractor(
    getDealRepo(),
    getOrganizationRepo(),
    getContactRepo(),
    getServiceRepo(),
    getTaskRepo(),
    getEventService(),
    getDealWritePrecheck(),
  );

// --- Services ---

export const getGetServicesInteractor = () =>
  new GetServicesInteractor(getServiceRepo(), getP13nRepo(), "interactive", getQueryParamsPrecheck());

export const getGetServicesApiInteractor = () =>
  new GetServicesInteractor(getServiceRepo(), getP13nRepo(), "api", getQueryParamsPrecheck());

export const getGetServicesConfigurationInteractor = () => new GetServicesConfigurationInteractor(getServiceRepo());

export const getGetServiceByIdInteractor = () => new GetServiceByIdInteractor(getServiceRepo(), getCustomColumnRepo());

export const getCreateServiceInteractor = () =>
  new CreateServiceInteractor(
    getServiceRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
    getServiceWritePrecheck(),
  );

export const getCreateManyServicesInteractor = () =>
  new CreateManyServicesInteractor(
    getServiceRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
    getServiceWritePrecheck(),
  );

export const getUpdateServiceInteractor = () =>
  new UpdateServiceInteractor(
    getServiceRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
    getServiceWritePrecheck(),
  );

export const getUpdateManyServicesInteractor = () =>
  new UpdateManyServicesInteractor(
    getServiceRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
    getServiceWritePrecheck(),
  );

export const getDeleteServiceInteractor = () =>
  new DeleteServiceInteractor(
    getServiceRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
    getServiceWritePrecheck(),
  );

export const getDeleteManyServicesInteractor = () =>
  new DeleteManyServicesInteractor(
    getServiceRepo(),
    getDealRepo(),
    getTaskRepo(),
    getEventService(),
    getServiceWritePrecheck(),
  );

// --- Tasks ---

export const getGetTasksInteractor = () =>
  new GetTasksInteractor(getTaskRepo(), getP13nRepo(), "interactive", getQueryParamsPrecheck());

export const getGetTasksApiInteractor = () =>
  new GetTasksInteractor(getTaskRepo(), getP13nRepo(), "api", getQueryParamsPrecheck());

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
    getTaskWritePrecheck(),
  );

export const getCreateManyTasksInteractor = () =>
  new CreateManyTasksInteractor(
    getTaskRepo(),
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getServiceRepo(),
    getEventService(),
    getTaskWritePrecheck(),
  );

export const getUpdateTaskInteractor = () =>
  new UpdateTaskInteractor(
    getTaskRepo(),
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getServiceRepo(),
    getEventService(),
    getTaskWritePrecheck(),
  );

export const getUpdateManyTasksInteractor = () =>
  new UpdateManyTasksInteractor(
    getTaskRepo(),
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getServiceRepo(),
    getEventService(),
    getTaskWritePrecheck(),
  );

export const getDeleteTaskInteractor = () =>
  new DeleteTaskInteractor(
    getTaskRepo(),
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getServiceRepo(),
    getEventService(),
    getTaskWritePrecheck(),
  );

export const getDeleteManyTasksInteractor = () =>
  new DeleteManyTasksInteractor(
    getTaskRepo(),
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getServiceRepo(),
    getEventService(),
    getTaskWritePrecheck(),
  );

// --- User ---

export const getRegisterUserInteractor = () =>
  new RegisterUserInteractor(getAuthService(), getUserRepo(), getEventService());

export const getUpdateUserDetailsInteractor = () => new UpdateUserDetailsInteractor(getUserRepo(), getEventService());

export const getSeedOnboardingDataInteractor = () => new SeedOnboardingDataInteractor(getUserRepo());

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

export const getGetUsersInteractor = () =>
  new GetUsersInteractor(getUserRepo(), getP13nRepo(), "interactive", getQueryParamsPrecheck());

export const getGetUsersApiInteractor = () =>
  new GetUsersInteractor(getUserRepo(), getP13nRepo(), "api", getQueryParamsPrecheck());

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

export const getUpsertRoleInteractor = () =>
  new UpsertRoleInteractor(getRoleRepo(), getEventService(), getRoleIdsValidator());

export const getGetRolesInteractor = () =>
  new GetRolesInteractor(getRoleRepo(), getP13nRepo(), "interactive", getQueryParamsPrecheck());
export const getGetRolesApiInteractor = () =>
  new GetRolesInteractor(getRoleRepo(), getP13nRepo(), "api", getQueryParamsPrecheck());

export const getDeleteRoleInteractor = () => new DeleteRoleInteractor(getRoleRepo(), getEventService());

// --- Widget ---

export const getGetWidgetsInteractor = () => new GetWidgetsInteractor(getWidgetRepo());

export const getUpsertWidgetInteractor = () =>
  new UpsertWidgetInteractor(getWidgetRepo(), getWidgetIdsValidator(), getCustomColumnIdsValidator());

export const getDeleteWidgetInteractor = () => new DeleteWidgetInteractor(getWidgetRepo(), getWidgetIdsValidator());

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

export const getGetWebhooksInteractor = () =>
  new GetWebhooksInteractor(getWebhookRepo(), getP13nRepo(), "interactive", getQueryParamsPrecheck());
export const getGetWebhooksApiInteractor = () =>
  new GetWebhooksInteractor(getWebhookRepo(), getP13nRepo(), "api", getQueryParamsPrecheck());

export const getUpsertWebhookInteractor = () =>
  new UpsertWebhookInteractor(getWebhookRepo(), getEventService(), getWebhookIdsValidator());

export const getGetWebhookByIdInteractor = () => new GetWebhookByIdInteractor(getWebhookRepo());

export const getModifyEntityRelationInteractor = () =>
  new ModifyEntityRelationInteractor(
    getContactRepo(),
    getOrganizationRepo(),
    getDealRepo(),
    getServiceRepo(),
    getTaskRepo(),
    getUpdateManyContactsInteractor(),
    getUpdateManyOrganizationsInteractor(),
    getUpdateManyDealsInteractor(),
    getUpdateManyServicesInteractor(),
    getUpdateManyTasksInteractor(),
    getContactIdsValidator(),
    getOrganizationIdsValidator(),
    getDealIdsValidator(),
    getServiceIdsValidator(),
    getTaskIdsValidator(),
  );

export const getDeleteWebhookInteractor = () =>
  new DeleteWebhookInteractor(getWebhookRepo(), getEventService(), getWebhookIdsValidator());

export const getGetWebhookDeliveriesInteractor = () =>
  new GetWebhookDeliveriesInteractor(getWebhookDeliveryRepo(), getP13nRepo(), "interactive", getQueryParamsPrecheck());
export const getGetWebhookDeliveriesApiInteractor = () =>
  new GetWebhookDeliveriesInteractor(getWebhookDeliveryRepo(), getP13nRepo(), "api", getQueryParamsPrecheck());

export const getResendWebhookDeliveryInteractor = () =>
  new ResendWebhookDeliveryInteractor(
    getWebhookDeliveryRepo(),
    getWebhookDeliveryRepo(),
    getBackgroundTaskService(),
    getWebhookDeliveryIdsValidator(),
  );

// --- Messaging ---

export const getCreateHostedAuthLinkInteractor = () =>
  new CreateHostedAuthLinkInteractor(getMessagingService(), getConnectedAccountRepo());

export const getGetMyConnectedAccountsInteractor = () =>
  new GetMyConnectedAccountsInteractor(getConnectedAccountRepo());

export const getDeleteConnectedAccountInteractor = () =>
  new DeleteConnectedAccountInteractor(getConnectedAccountRepo(), getMessagingService(), getEventService());

export const getResyncConnectedAccountInteractor = () =>
  new ResyncConnectedAccountInteractor(
    getConnectedAccountRepo(),
    getMessagingService(),
    getBackgroundTaskService(),
    getEventService(),
  );

export const getReconnectConnectedAccountInteractor = () =>
  new ReconnectConnectedAccountInteractor(getConnectedAccountRepo(), getMessagingService(), getEventService());

export const getResyncThreadInteractor = () => new ResyncThreadInteractor(getMessagingRepo(), getMessagingService());

export const getSetConnectedAccountVisibilityInteractor = () =>
  new SetConnectedAccountVisibilityInteractor(getConnectedAccountRepo(), getEventService());

export const getProcessAccountCallbackInteractor = () =>
  new ProcessAccountCallbackInteractor(
    getConnectedAccountRepo(),
    getUserRepo(),
    getMessagingService(),
    getBackgroundTaskService(),
    getEventService(),
  );

export const getBackfillEmailsInteractor = () =>
  new BackfillEmailsInteractor(getConnectedAccountRepo(), getMessagingService(), getMessagingRepo());

export const getBackfillChatsInteractor = () =>
  new BackfillChatsInteractor(getConnectedAccountRepo(), getMessagingService(), getMessagingRepo());

export const getBackfillCalendarsInteractor = () =>
  new BackfillCalendarsInteractor(getConnectedAccountRepo(), getMessagingService(), getCalendarRepo());

export const getBackfillConnectedAccountInteractor = () =>
  new BackfillConnectedAccountInteractor(
    getConnectedAccountRepo(),
    getMessagingService(),
    getMessagingRepo(),
    getBackfillEmailsInteractor(),
    getBackfillChatsInteractor(),
    getBackfillCalendarsInteractor(),
  );

export const getReleaseBackfillClaimInteractor = () => new ReleaseBackfillClaimInteractor(getConnectedAccountRepo());

export const getProcessAccountStatusWebhookInteractor = () =>
  new ProcessAccountStatusWebhookInteractor(getConnectedAccountRepo(), getBackgroundTaskService());

export const getProcessMessagingWebhookInteractor = () =>
  new ProcessMessagingWebhookInteractor(getMessagingRepo(), getConnectedAccountRepo(), getMessagingRepo());

export const getProcessEmailWebhookInteractor = () =>
  new ProcessEmailWebhookInteractor(getMessagingRepo(), getConnectedAccountRepo(), getMessagingRepo());

export const getProcessUsersWebhookInteractor = () =>
  new ProcessUsersWebhookInteractor(getMessagingRepo(), getConnectedAccountRepo());

export const getSendChatMessageInteractor = () =>
  new SendChatMessageInteractor(
    getMessagingRepo(),
    getConnectedAccountRepo(),
    getMessagingService(),
    getThreadIdsValidator(),
  );

export const getSendEmailInteractor = () =>
  new SendEmailInteractor(getMessagingRepo(), getConnectedAccountRepo(), getMessagingService());

export const getStartChatInteractor = () =>
  new StartChatInteractor(getConnectedAccountRepo(), getContactRepo(), getMessagingService());

export const getResolveProviderProfileInteractor = () =>
  new ResolveProviderProfileInteractor(getConnectedAccountRepo(), getMessagingService());

export const getSearchChannelCandidatesInteractor = () => new SearchChannelCandidatesInteractor(getMessagingRepo());

export const getGetMessagingThreadsInteractor = () =>
  new GetMessagingThreadsInteractor(getMessagingRepo(), getP13nRepo(), "interactive", getQueryParamsPrecheck());
export const getGetMessagingThreadsApiInteractor = () =>
  new GetMessagingThreadsInteractor(getMessagingRepo(), getP13nRepo(), "api", getQueryParamsPrecheck());

export const getGetMessagingThreadInteractor = () =>
  new GetMessagingThreadInteractor(getMessagingRepo(), getConnectedAccountRepo());

export const getGetMessageAttachmentInteractor = () =>
  new GetMessageAttachmentInteractor(getMessagingRepo(), getMessagingService());

export const getGetUnreadThreadCountInteractor = () => new GetUnreadThreadCountInteractor(getMessagingRepo());

export const getGetActivitiesInteractor = () =>
  new GetActivitiesInteractor(new PrismaActivitiesRepo(), getP13nRepo(), "interactive", getQueryParamsPrecheck());
export const getGetActivitiesApiInteractor = () =>
  new GetActivitiesInteractor(new PrismaActivitiesRepo(), getP13nRepo(), "api", getQueryParamsPrecheck());

export const getGetActivityThreadOptionsInteractor = () =>
  new GetActivityThreadOptionsInteractor(new PrismaActivitiesRepo());

export const getUpdateThreadInteractor = () => new UpdateThreadInteractor(getMessagingRepo(), getThreadIdsValidator());

// --- Calendar ---

export const getProcessCalendarWebhookInteractor = () =>
  new ProcessCalendarWebhookInteractor(getCalendarRepo(), getConnectedAccountRepo());

// --- Unipile Webhook Dispatch ---

export const getProcessUnipileWebhookEventInteractor = () =>
  new ProcessUnipileWebhookEventInteractor(
    getUnipileWebhookRepo(),
    getProcessAccountStatusWebhookInteractor(),
    getProcessAccountCallbackInteractor(),
    getProcessMessagingWebhookInteractor(),
    getProcessEmailWebhookInteractor(),
    getProcessCalendarWebhookInteractor(),
    getProcessUsersWebhookInteractor(),
  );

export const getReprocessStuckWebhookEventsInteractor = () =>
  new ReprocessStuckWebhookEventsInteractor(getUnipileWebhookRepo(), getProcessUnipileWebhookEventInteractor());

// --- Custom Column ---

export const getGetCustomColumnsInteractor = () => new GetCustomColumnsInteractor(getCustomColumnRepo());

export const getGetCustomColumnsByEntityTypeInteractor = () =>
  new GetCustomColumnsByEntityTypeInteractor(getCustomColumnRepo());

export const getUpsertCustomColumnInteractor = () =>
  new UpsertCustomColumnInteractor(
    getCustomColumnRepo(),
    getUserService(),
    getEventService(),
    getCustomColumnIdsValidator(),
  );

export const getDeleteCustomColumnInteractor = () =>
  new DeleteCustomColumnInteractor(
    getCustomColumnRepo(),
    getUserService(),
    getEventService(),
    getCustomColumnIdsValidator(),
  );

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

export const getGetAuditLogsInteractor = () => new GetAuditLogsInteractor(getAuditLogRepo(), getP13nRepo());

// --- EE Lifecycle (workflow cron) ---

export const getSendWelcomeAndDemoInteractor = () => new SendWelcomeAndDemoInteractor(getUserRepo(), getEmailService());

export const getSendTrialExtensionOfferInteractor = () =>
  new SendTrialExtensionOfferInteractor(getUserRepo(), getEmailService());

export const getSendTrialInactivationReminderInteractor = () =>
  new SendTrialInactivationReminderInteractor(getUserRepo(), getEmailService());

export const getDeactivateTrialUsersAndSendNoticeInteractor = () =>
  new DeactivateTrialUsersAndSendNoticeInteractor(getUserRepo(), getEmailService());

export const getDeactivateUsersAfterSubscriptionGracePeriodInteractor = () =>
  new DeactivateUsersAfterSubscriptionGracePeriodInteractor(getUserRepo(), getEmailService());

// --- Webhook delivery (workflow task) ---

export const getDeliverWebhookInteractor = () => new DeliverWebhookInteractor(getWebhookDeliveryRepo());

// --- Agent chat ---

export const getAgentChatRepo = () => new PrismaAgentChatRepo();
export const getAgentSkillRepo = () => new PrismaAgentSkillRepo();

export const getListEnabledAgentSkillsInteractor = () => new ListEnabledAgentSkillsInteractor(getAgentSkillRepo());
export const getGetAgentSkillByNameInteractor = () => new GetAgentSkillByNameInteractor(getAgentSkillRepo());
export const getListAgentSkillsInteractor = () => new ListAgentSkillsInteractor(getAgentSkillRepo());
export const getGetAgentSkillByIdInteractor = () => new GetAgentSkillByIdInteractor(getAgentSkillRepo());
export const getCreateAgentSkillInteractor = () => new CreateAgentSkillInteractor(getAgentSkillRepo());
export const getUpdateAgentSkillInteractor = () => new UpdateAgentSkillInteractor(getAgentSkillRepo());
export const getDeleteAgentSkillInteractor = () => new DeleteAgentSkillInteractor(getAgentSkillRepo());

export const getListAgentConversationsInteractor = () => new ListAgentConversationsInteractor(getAgentChatRepo());
export const getGetAgentConversationInteractor = () => new GetAgentConversationInteractor(getAgentChatRepo());
export const getDeleteAgentConversationInteractor = () => new DeleteAgentConversationInteractor(getAgentChatRepo());
export const getRenameAgentConversationInteractor = () => new RenameAgentConversationInteractor(getAgentChatRepo());
export const getSetPreAuthorizedToolsInteractor = () => new SetPreAuthorizedToolsInteractor(getAgentChatRepo());
