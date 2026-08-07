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
import { PrismaCalendarEventsRepo } from "@/ee/calendar/prisma-calendar-events.repository";
import { GetCalendarsInteractor } from "@/ee/calendar/get-calendars.interactor";
import { GetCalendarByIdInteractor } from "@/ee/calendar/get-calendar-by-id.interactor";
import { GetCalendarEventsInteractor } from "@/ee/calendar/get-calendar-events.interactor";
import { GetCalendarEventByIdInteractor } from "@/ee/calendar/get-calendar-event-by-id.interactor";
// Services
import { EmailService } from "@/features/email/email.service";
import { MessagingService } from "@/ee/messaging/messaging.service";
import { IngestUnipileWebhookInteractor } from "@/ee/messaging/webhooks/ingest-unipile-webhook.interactor";
import { AuthService } from "@/features/auth/auth.service";
import { UserService } from "@/features/user/user.service";
import { RouteGuardService } from "@/features/auth/route-guard.service";
import { EventService } from "@/features/event/event.service";
import { WidgetDataFetcher } from "@/features/widget/calculator/widget-data-fetcher.service";
import { WidgetGroupingService } from "@/features/widget/calculator/widget-grouping.service";
import { SubscriptionService } from "@/ee/subscription/subscription.service";
import { EntitlementService } from "@/ee/subscription/entitlement.service";
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
import { ValidateConnectedAccountIdsInteractor } from "@/core/validation/validators/validate-connected-account-ids.interactor";
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
import { GetCompanySettingsInteractor } from "@/features/company/get-company-settings.interactor";
import { UpdateCompanySettingsInteractor } from "@/features/company/update-company-settings.interactor";
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
import { CreateAuthLinkInteractor } from "@/ee/messaging/connect/create-auth-link.interactor";
import { GetMyConnectedAccountsInteractor } from "@/ee/messaging/connect/get-my-connected-accounts.interactor";
import { RefreshInboxInteractor } from "@/ee/messaging/inbox/refresh-inbox.interactor";
import { DeleteConnectedAccountInteractor } from "@/ee/messaging/connect/delete-connected-account.interactor";
import { ResyncConnectedAccountInteractor } from "@/ee/messaging/connect/resync-connected-account.interactor";
import { ResyncThreadInteractor } from "@/ee/messaging/inbox/resync-thread.interactor";
import { ReconnectConnectedAccountInteractor } from "@/ee/messaging/connect/reconnect-connected-account.interactor";
import { SetConnectedAccountVisibilityInteractor } from "@/ee/messaging/connect/set-connected-account-visibility.interactor";
import { SetSelectedFoldersInteractor } from "@/ee/messaging/connect/set-selected-folders.interactor";
import { DeleteAccountForBillingService } from "@/ee/messaging/connect/delete-account-for-billing.service";
import { DeleteAccountsForPlanInteractor } from "@/ee/messaging/connect/delete-accounts-for-plan.interactor";
import { ProcessUnipileWebhookInteractor } from "@/ee/messaging/webhooks/process-unipile-webhook.interactor";
import type { UnipileWebhookHandlerMap } from "@/ee/messaging/webhooks/process-unipile-webhook.interactor";
import { ProcessMessageNewWebhookInteractor } from "@/ee/messaging/webhooks/message/process-message-new-webhook.interactor";
import { ProcessMessageDeleteWebhookInteractor } from "@/ee/messaging/webhooks/message/process-message-delete-webhook.interactor";
import { ProcessMessageReactionWebhookInteractor } from "@/ee/messaging/webhooks/message/process-message-reaction-webhook.interactor";
import { ProcessEmailNewWebhookInteractor } from "@/ee/messaging/webhooks/email/process-email-new-webhook.interactor";
import { ProcessEmailDeleteWebhookInteractor } from "@/ee/messaging/webhooks/email/process-email-delete-webhook.interactor";
import { ProcessEmailFolderWebhookInteractor } from "@/ee/messaging/webhooks/email/process-email-folder-webhook.interactor";
import { ProcessChatUpdateWebhookInteractor } from "@/ee/messaging/webhooks/chat/process-chat-update-webhook.interactor";
import { ProcessChatDeleteWebhookInteractor } from "@/ee/messaging/webhooks/chat/process-chat-delete-webhook.interactor";
import { ProcessRelationWebhookInteractor } from "@/ee/messaging/webhooks/relation/process-relation-webhook.interactor";
import { ProcessCalendarUpsertWebhookInteractor } from "@/ee/messaging/webhooks/calendar/process-calendar-upsert-webhook.interactor";
import { ProcessCalendarDeleteWebhookInteractor } from "@/ee/messaging/webhooks/calendar/process-calendar-delete-webhook.interactor";
import { ProcessCalendarEventUpsertWebhookInteractor } from "@/ee/messaging/webhooks/calendar/process-calendar-event-upsert-webhook.interactor";
import { ProcessCalendarEventDeleteWebhookInteractor } from "@/ee/messaging/webhooks/calendar/process-calendar-event-delete-webhook.interactor";
import { ProcessAccountAddWebhookInteractor } from "@/ee/messaging/webhooks/account/process-account-add-webhook.interactor";
import { ProcessAccountReadyWebhookInteractor } from "@/ee/messaging/webhooks/account/process-account-ready-webhook.interactor";
import { ProcessAccountReconnectWebhookInteractor } from "@/ee/messaging/webhooks/account/process-account-reconnect-webhook.interactor";
import { ProcessAccountRemoveWebhookInteractor } from "@/ee/messaging/webhooks/account/process-account-remove-webhook.interactor";
import { ProcessAccountStatusWebhookInteractor } from "@/ee/messaging/webhooks/account/process-account-status-webhook.interactor";
import { ReprocessStuckWebhookEventsInteractor } from "@/ee/messaging/ingest/reprocess-stuck-webhook-events.interactor";
import { PrepareBackfillInteractor } from "@/ee/messaging/ingest/backfill/prepare-backfill.interactor";
import { ClaimBackfillInteractor } from "@/ee/messaging/ingest/claim-backfill.interactor";
import { ReleaseBackfillClaimInteractor } from "@/ee/messaging/ingest/release-backfill-claim.interactor";
import { BackfillEmailsInteractor } from "@/ee/messaging/ingest/backfill/backfill-emails.interactor";
import { BackfillChatsInteractor } from "@/ee/messaging/ingest/backfill/backfill-chats.interactor";
import { BackfillCalendarsInteractor } from "@/ee/messaging/ingest/backfill/backfill-calendars.interactor";
import { SendChatMessageInteractor } from "@/ee/messaging/outbound/send-chat-message.interactor";
import { SendEmailInteractor } from "@/ee/messaging/outbound/send-email.interactor";
import { SaveDraftInteractor } from "@/ee/messaging/outbound/save-draft.interactor";
import { DiscardDraftInteractor } from "@/ee/messaging/outbound/discard-draft.interactor";
import { StartChatInteractor } from "@/ee/messaging/outbound/start-chat.interactor";
import { ResolveProviderProfileInteractor } from "@/ee/messaging/outbound/resolve-provider-profile.interactor";
import { SearchChannelCandidatesInteractor } from "@/ee/messaging/inbox/search-channel-candidates.interactor";
import { GetMessagingThreadsInteractor } from "@/ee/messaging/inbox/get-messaging-threads.interactor";
import { GetMessagingThreadInteractor } from "@/ee/messaging/inbox/get-messaging-thread.interactor";
import { GetMessageAttachmentInteractor } from "@/ee/messaging/inbox/get-message-attachment.interactor";
import { GetUnreadThreadCountInteractor } from "@/ee/messaging/inbox/get-unread-thread-count.interactor";
import { GetActivitiesInteractor } from "@/ee/messaging/activities/get-activities.interactor";
import { GetActivityThreadOptionsInteractor } from "@/ee/messaging/activities/get-activity-thread-options.interactor";
import { PrismaActivitiesRepo } from "@/ee/messaging/activities/prisma-activities.repository";
import { UpdateThreadInteractor } from "@/ee/messaging/thread-state/update-thread.interactor";
import { ListSocialPostsInteractor } from "@/ee/messaging/posts/list-social-posts.interactor";
import { GetSocialPostInteractor } from "@/ee/messaging/posts/get-social-post.interactor";
import { ListSocialPostCommentsInteractor } from "@/ee/messaging/posts/list-social-post-comments.interactor";
import { ListSocialCommentReactionsInteractor } from "@/ee/messaging/posts/list-social-comment-reactions.interactor";
import { ListSocialPostReactionsInteractor } from "@/ee/messaging/posts/list-social-post-reactions.interactor";
import { GetSocialProfileInteractor } from "@/ee/messaging/posts/get-social-profile.interactor";
import { LinkedinListSalesListsInteractor } from "@/ee/messaging/sales-navigator/linkedin-list-sales-lists.interactor";
import { LinkedinBrowseSalesListInteractor } from "@/ee/messaging/sales-navigator/linkedin-browse-sales-list.interactor";
import { LinkedinSaveToSalesListInteractor } from "@/ee/messaging/sales-navigator/linkedin-save-to-sales-list.interactor";
import { LinkedinSearchSalesNavigatorInteractor } from "@/ee/messaging/sales-navigator/linkedin-search-sales-navigator.interactor";
import { LinkedinSearchSalesPeopleInteractor } from "@/ee/messaging/sales-navigator/linkedin-search-sales-people.interactor";
import { LinkedinSearchSalesCompaniesInteractor } from "@/ee/messaging/sales-navigator/linkedin-search-sales-companies.interactor";
import { LinkedinListSalesSearchParametersInteractor } from "@/ee/messaging/sales-navigator/linkedin-list-sales-search-parameters.interactor";
import { ListRelationRequestsInteractor } from "@/ee/messaging/posts/list-relation-requests.interactor";
import { CreateRelationRequestInteractor } from "@/ee/messaging/posts/create-relation-request.interactor";
import { AcceptRelationRequestInteractor } from "@/ee/messaging/posts/accept-relation-request.interactor";
import { CancelRelationRequestInteractor } from "@/ee/messaging/posts/cancel-relation-request.interactor";
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
// Entity Terminology
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
import { DeleteConnectedAccountsForExpiredTrialsInteractor } from "@/ee/lifecycle/delete-connected-accounts-for-expired-trials.interactor";
import { DeleteConnectedAccountsForInactiveOwnersInteractor } from "@/ee/lifecycle/delete-connected-accounts-for-inactive-owners.interactor";
import { DeleteOrphanedUnipileAccountsInteractor } from "@/ee/lifecycle/delete-orphaned-unipile-accounts.interactor";
import { SendLegalDocumentNoticesInteractor } from "@/ee/lifecycle/send-legal-document-notices.interactor";
import { LegalStatusService } from "@/features/legal/legal-status.service";
import { AcceptLegalDocumentsInteractor } from "@/features/legal/accept-legal-documents.interactor";
// Webhook delivery interactor (workflow task consumer)
import { DeliverWebhookInteractor } from "@/features/webhook/deliver-webhook.interactor";
// EE Audit Log interactors
import { GetAuditLogsInteractor } from "@/ee/audit-log/get/get-audit-logs.interactor";
import { PrismaSupportRepo } from "@/features/support/prisma-support.repository";
import { CreateSupportTicketInteractor } from "@/features/support/create-support-ticket.interactor";
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
export const getCalendarEventsRepo = () => new PrismaCalendarEventsRepo();
export const getSupportRepo = () => new PrismaSupportRepo();

// ─── Section 3: Services ────────────────────────────────────────────────────

export const getEmailService = () => new EmailService();
export const getAuthService = () => new AuthService(getEmailService());
export const getUserService = () => new UserService(getAuthService(), getUserRepo());
export const getLegalStatusService = () => new LegalStatusService(getAuditLogRepo());
export const getRouteGuardService = () =>
  new RouteGuardService(getAuthService(), getUserService(), getCompanyRepo(), getLegalStatusService());
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
export const getEntitlementService = () => new EntitlementService(getCompanyRepo());
export const getMessagingService = () => new MessagingService();
export const getDeleteAccountForBillingService = () =>
  new DeleteAccountForBillingService(getConnectedAccountRepo(), getMessagingService());
export const getIngestUnipileWebhookInteractor = () =>
  new IngestUnipileWebhookInteractor(getUnipileWebhookRepo(), getProcessUnipileWebhookInteractor());

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
    getConnectedAccountIdsValidator(),
    getCustomColumnRepo(),
  );
export const getWidgetIdsValidator = () => new ValidateWidgetIdsInteractor(getWidgetRepo());
export const getCustomColumnIdsValidator = () => new ValidateCustomColumnIdsInteractor(getCustomColumnRepo());
export const getWebhookIdsValidator = () => new ValidateWebhookIdsInteractor(getWebhookRepo());
export const getWebhookDeliveryIdsValidator = () => new ValidateWebhookDeliveryIdsInteractor(getWebhookDeliveryRepo());
export const getRoleIdsValidator = () => new ValidateRoleIdsInteractor(getRoleRepo());
export const getThreadIdsValidator = () => new ValidateThreadIdsInteractor(getMessagingRepo());
export const getConnectedAccountIdsValidator = () =>
  new ValidateConnectedAccountIdsInteractor(getConnectedAccountRepo());

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

export const getCompleteOnboardingWizardInteractor = () => new CompleteOnboardingWizardInteractor(getUserRepo());

export const getGetUserDetailsInteractor = () => new GetUserDetailsInteractor();

export const getGetUserByIdInteractor = () => new GetUserByIdInteractor(getUserRepo());

export const getAdminUpdateUserDetailsInteractor = () =>
  new AdminUpdateUserDetailsInteractor(
    getUserRepo(),
    getRoleRepo(),
    getEventService(),
    getSubscriptionService(),
    getCompanyRepo(),
    getUserRepo(),
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

export const getGetCompanySettingsInteractor = () => new GetCompanySettingsInteractor(getCompanyRepo());

export const getUpdateCompanySettingsInteractor = () =>
  new UpdateCompanySettingsInteractor(getCompanyRepo(), getEventService());

export const getGetOrCreateInviteTokenInteractor = () => new GetOrCreateInviteTokenInteractor(getCompanyRepo());

export const getInviteUsersByEmailInteractor = () =>
  new InviteUsersByEmailInteractor(getEmailService(), getGetOrCreateInviteTokenInteractor());

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

export const getCreateAuthLinkInteractor = () =>
  new CreateAuthLinkInteractor(
    getMessagingService(),
    getConnectedAccountRepo(),
    getCompanyRepo(),
    getEntitlementService(),
  );

export const getGetMyConnectedAccountsInteractor = () =>
  new GetMyConnectedAccountsInteractor(getConnectedAccountRepo());

export const getDeleteConnectedAccountInteractor = () =>
  new DeleteConnectedAccountInteractor(getConnectedAccountRepo(), getMessagingService(), getEventService());

export const getResyncConnectedAccountInteractor = () =>
  new ResyncConnectedAccountInteractor(
    getConnectedAccountRepo(),
    getBackgroundTaskService(),
    getEventService(),
    getEntitlementService(),
  );

export const getReconnectConnectedAccountInteractor = () =>
  new ReconnectConnectedAccountInteractor(
    getConnectedAccountRepo(),
    getMessagingService(),
    getEventService(),
    getEntitlementService(),
  );

export const getDeleteAccountsForPlanInteractor = () =>
  new DeleteAccountsForPlanInteractor(
    getConnectedAccountRepo(),
    getUserRepo(),
    getDeleteAccountForBillingService(),
    getEmailService(),
  );

export const getResyncThreadInteractor = () =>
  new ResyncThreadInteractor(getMessagingRepo(), getMessagingService(), getEntitlementService());

export const getSetConnectedAccountVisibilityInteractor = () =>
  new SetConnectedAccountVisibilityInteractor(getConnectedAccountRepo(), getEventService(), getEntitlementService());

export const getSetSelectedFoldersInteractor = () =>
  new SetSelectedFoldersInteractor(getConnectedAccountRepo(), getBackgroundTaskService(), getEntitlementService());

export const getBackfillEmailsInteractor = () =>
  new BackfillEmailsInteractor(getConnectedAccountRepo(), getMessagingService(), getMessagingRepo());

export const getBackfillChatsInteractor = () =>
  new BackfillChatsInteractor(getConnectedAccountRepo(), getMessagingService(), getMessagingRepo());

export const getBackfillCalendarsInteractor = () =>
  new BackfillCalendarsInteractor(getConnectedAccountRepo(), getMessagingService(), getCalendarRepo());

export const getPrepareBackfillInteractor = () =>
  new PrepareBackfillInteractor(getConnectedAccountRepo(), getMessagingService());

export const getClaimBackfillInteractor = () => new ClaimBackfillInteractor(getConnectedAccountRepo());
export const getReleaseBackfillClaimInteractor = () => new ReleaseBackfillClaimInteractor(getConnectedAccountRepo());

export const getRefreshInboxInteractor = () =>
  new RefreshInboxInteractor(
    getConnectedAccountRepo(),
    getPrepareBackfillInteractor(),
    getBackfillChatsInteractor(),
    getBackfillEmailsInteractor(),
    getEntitlementService(),
  );

export const getProcessMessageNewWebhookInteractor = () =>
  new ProcessMessageNewWebhookInteractor(getMessagingRepo(), getConnectedAccountRepo(), getEventService());
export const getProcessMessageDeleteWebhookInteractor = () =>
  new ProcessMessageDeleteWebhookInteractor(getMessagingRepo(), getConnectedAccountRepo(), getEventService());
export const getProcessMessageReactionWebhookInteractor = () =>
  new ProcessMessageReactionWebhookInteractor(getMessagingRepo(), getConnectedAccountRepo(), getEventService());
export const getProcessEmailNewWebhookInteractor = () =>
  new ProcessEmailNewWebhookInteractor(getMessagingRepo(), getConnectedAccountRepo(), getEventService());
export const getProcessEmailDeleteWebhookInteractor = () =>
  new ProcessEmailDeleteWebhookInteractor(
    getMessagingRepo(),
    getConnectedAccountRepo(),
    getEventService(),
    getMessagingService(),
    getUnipileWebhookRepo(),
  );
export const getProcessEmailFolderWebhookInteractor = () =>
  new ProcessEmailFolderWebhookInteractor(getConnectedAccountRepo(), getMessagingService());
export const getProcessChatUpdateWebhookInteractor = () =>
  new ProcessChatUpdateWebhookInteractor(getMessagingRepo(), getConnectedAccountRepo(), getEventService());
export const getProcessChatDeleteWebhookInteractor = () =>
  new ProcessChatDeleteWebhookInteractor(getMessagingRepo(), getConnectedAccountRepo(), getEventService());
export const getProcessRelationWebhookInteractor = () =>
  new ProcessRelationWebhookInteractor(getConnectedAccountRepo(), getConnectedAccountRepo(), getEventService());
export const getProcessCalendarUpsertWebhookInteractor = () =>
  new ProcessCalendarUpsertWebhookInteractor(getCalendarRepo(), getConnectedAccountRepo(), getEventService());
export const getProcessCalendarDeleteWebhookInteractor = () =>
  new ProcessCalendarDeleteWebhookInteractor(getCalendarRepo(), getConnectedAccountRepo(), getEventService());
export const getProcessCalendarEventUpsertWebhookInteractor = () =>
  new ProcessCalendarEventUpsertWebhookInteractor(getCalendarRepo(), getConnectedAccountRepo(), getEventService());
export const getProcessCalendarEventDeleteWebhookInteractor = () =>
  new ProcessCalendarEventDeleteWebhookInteractor(getCalendarRepo(), getConnectedAccountRepo(), getEventService());
export const getGetCalendarsApiInteractor = () =>
  new GetCalendarsInteractor(
    getCalendarRepo(),
    getP13nRepo(),
    "api",
    getQueryParamsPrecheck(),
    getEntitlementService(),
  );
export const getGetCalendarByIdInteractor = () =>
  new GetCalendarByIdInteractor(getCalendarRepo(), getEntitlementService());
export const getGetCalendarEventsApiInteractor = () =>
  new GetCalendarEventsInteractor(
    getCalendarEventsRepo(),
    getP13nRepo(),
    "api",
    getQueryParamsPrecheck(),
    getEntitlementService(),
  );
export const getGetCalendarEventByIdInteractor = () =>
  new GetCalendarEventByIdInteractor(getCalendarEventsRepo(), getEntitlementService());
export const getProcessAccountAddWebhookInteractor = () =>
  new ProcessAccountAddWebhookInteractor(
    getMessagingService(),
    getConnectedAccountRepo(),
    getUserRepo(),
    getBackgroundTaskService(),
    getEventService(),
  );
export const getProcessAccountReadyWebhookInteractor = () =>
  new ProcessAccountReadyWebhookInteractor(getConnectedAccountRepo(), getBackgroundTaskService());
export const getProcessAccountReconnectWebhookInteractor = () =>
  new ProcessAccountReconnectWebhookInteractor(
    getMessagingService(),
    getConnectedAccountRepo(),
    getBackgroundTaskService(),
  );
export const getProcessAccountRemoveWebhookInteractor = () =>
  new ProcessAccountRemoveWebhookInteractor(getConnectedAccountRepo());
export const getProcessAccountStatusWebhookInteractor = () =>
  new ProcessAccountStatusWebhookInteractor(getConnectedAccountRepo());

export const getProcessUnipileWebhookInteractor = () => {
  const messageNew = getProcessMessageNewWebhookInteractor();
  const emailNew = getProcessEmailNewWebhookInteractor();
  const accountStatus = getProcessAccountStatusWebhookInteractor();
  const calendarUpsert = getProcessCalendarUpsertWebhookInteractor();
  const calendarEventUpsert = getProcessCalendarEventUpsertWebhookInteractor();
  const relation = getProcessRelationWebhookInteractor();

  const ignoreEvent = { invoke: () => Promise.resolve() };
  const emailFolder = getProcessEmailFolderWebhookInteractor();

  const handlers: UnipileWebhookHandlerMap = {
    "message.new": messageNew,
    "message.update": messageNew,
    "message.delete": getProcessMessageDeleteWebhookInteractor(),
    "message.reaction.new": getProcessMessageReactionWebhookInteractor(),
    "message.receipt.read": ignoreEvent,
    "message.receipt.delivery": ignoreEvent,
    "email.new": emailNew,
    "email.new.bounce": emailNew,
    "email.delete": getProcessEmailDeleteWebhookInteractor(),
    "email.draft.new": ignoreEvent,
    "email.draft.delete": ignoreEvent,
    "email.folder.update": emailFolder,
    "email.folder.create": emailFolder,
    "email.folder.delete": emailFolder,
    "tracking.open": ignoreEvent,
    "tracking.click": ignoreEvent,
    "account.add": getProcessAccountAddWebhookInteractor(),
    "account.initial_sync.running": ignoreEvent,
    "account.initial_sync.failed": ignoreEvent,
    "account.initial_sync.completed": getProcessAccountReadyWebhookInteractor(),
    "account.reconnect": getProcessAccountReconnectWebhookInteractor(),
    "account.remove": getProcessAccountRemoveWebhookInteractor(),
    "account.status.disconnected": accountStatus,
    "account.status.errored": accountStatus,
    "account.status.paused": accountStatus,
    "account.status.running": accountStatus,
    "chat.update": getProcessChatUpdateWebhookInteractor(),
    "chat.delete": getProcessChatDeleteWebhookInteractor(),
    "calendar.create": calendarUpsert,
    "calendar.update": calendarUpsert,
    "calendar.delete": getProcessCalendarDeleteWebhookInteractor(),
    "calendar.event.new": calendarEventUpsert,
    "calendar.event.update": calendarEventUpsert,
    "calendar.event.delete": getProcessCalendarEventDeleteWebhookInteractor(),
    "relation.new": relation,
    "relation.request.accept": relation,
  };

  return new ProcessUnipileWebhookInteractor(getUnipileWebhookRepo(), handlers);
};

export const getReprocessStuckWebhookEventsInteractor = () =>
  new ReprocessStuckWebhookEventsInteractor(getUnipileWebhookRepo(), getProcessUnipileWebhookInteractor());

export const getSendChatMessageInteractor = () =>
  new SendChatMessageInteractor(
    getMessagingRepo(),
    getConnectedAccountRepo(),
    getMessagingService(),
    getThreadIdsValidator(),
    getEntitlementService(),
  );

export const getSendEmailInteractor = () =>
  new SendEmailInteractor(
    getMessagingRepo(),
    getConnectedAccountRepo(),
    getMessagingService(),
    getEntitlementService(),
  );

export const getSaveDraftInteractor = () =>
  new SaveDraftInteractor(getMessagingRepo(), getConnectedAccountRepo(), getEntitlementService());

export const getDiscardDraftInteractor = () => new DiscardDraftInteractor(getMessagingRepo(), getEntitlementService());

export const getStartChatInteractor = () =>
  new StartChatInteractor(
    getConnectedAccountRepo(),
    getContactRepo(),
    getMessagingService(),
    getMessagingRepo(),
    getEntitlementService(),
  );

export const getResolveProviderProfileInteractor = () =>
  new ResolveProviderProfileInteractor(getConnectedAccountRepo(), getMessagingService(), getEntitlementService());

export const getSearchChannelCandidatesInteractor = () =>
  new SearchChannelCandidatesInteractor(getMessagingRepo(), getEntitlementService());

export const getGetMessagingThreadsInteractor = () =>
  new GetMessagingThreadsInteractor(
    getMessagingRepo(),
    getP13nRepo(),
    "interactive",
    getQueryParamsPrecheck(),
    getEntitlementService(),
  );
export const getGetMessagingThreadsApiInteractor = () =>
  new GetMessagingThreadsInteractor(
    getMessagingRepo(),
    getP13nRepo(),
    "api",
    getQueryParamsPrecheck(),
    getEntitlementService(),
  );

export const getGetMessagingThreadInteractor = () =>
  new GetMessagingThreadInteractor(getMessagingRepo(), getConnectedAccountRepo(), getEntitlementService());

export const getGetMessageAttachmentInteractor = () =>
  new GetMessageAttachmentInteractor(getMessagingRepo(), getMessagingService(), getEntitlementService());

export const getGetUnreadThreadCountInteractor = () => new GetUnreadThreadCountInteractor(getMessagingRepo());

export const getGetActivitiesInteractor = () =>
  new GetActivitiesInteractor(new PrismaActivitiesRepo(), getP13nRepo(), "interactive", getQueryParamsPrecheck());
export const getGetActivitiesApiInteractor = () =>
  new GetActivitiesInteractor(new PrismaActivitiesRepo(), getP13nRepo(), "api", getQueryParamsPrecheck());

export const getGetActivityThreadOptionsInteractor = () =>
  new GetActivityThreadOptionsInteractor(new PrismaActivitiesRepo(), getEntitlementService());

export const getUpdateThreadInteractor = () =>
  new UpdateThreadInteractor(getMessagingRepo(), getThreadIdsValidator(), getEntitlementService());

export const getListSocialPostsInteractor = () =>
  new ListSocialPostsInteractor(getConnectedAccountRepo(), getMessagingService(), getEntitlementService());

export const getGetSocialPostInteractor = () =>
  new GetSocialPostInteractor(getConnectedAccountRepo(), getMessagingService(), getEntitlementService());

export const getListSocialPostCommentsInteractor = () =>
  new ListSocialPostCommentsInteractor(getConnectedAccountRepo(), getMessagingService(), getEntitlementService());

export const getListSocialCommentReactionsInteractor = () =>
  new ListSocialCommentReactionsInteractor(getConnectedAccountRepo(), getMessagingService(), getEntitlementService());

export const getListSocialPostReactionsInteractor = () =>
  new ListSocialPostReactionsInteractor(getConnectedAccountRepo(), getMessagingService(), getEntitlementService());

export const getGetSocialProfileInteractor = () =>
  new GetSocialProfileInteractor(getConnectedAccountRepo(), getMessagingService(), getEntitlementService());

export const getLinkedinListSalesListsInteractor = () =>
  new LinkedinListSalesListsInteractor(getConnectedAccountRepo(), getMessagingService(), getEntitlementService());

export const getLinkedinBrowseSalesListInteractor = () =>
  new LinkedinBrowseSalesListInteractor(getConnectedAccountRepo(), getMessagingService(), getEntitlementService());

export const getLinkedinSaveToSalesListInteractor = () =>
  new LinkedinSaveToSalesListInteractor(getConnectedAccountRepo(), getMessagingService(), getEntitlementService());

export const getLinkedinSearchSalesNavigatorInteractor = () =>
  new LinkedinSearchSalesNavigatorInteractor(getConnectedAccountRepo(), getMessagingService(), getEntitlementService());

export const getLinkedinSearchSalesPeopleInteractor = () =>
  new LinkedinSearchSalesPeopleInteractor(getConnectedAccountRepo(), getMessagingService(), getEntitlementService());

export const getLinkedinSearchSalesCompaniesInteractor = () =>
  new LinkedinSearchSalesCompaniesInteractor(getConnectedAccountRepo(), getMessagingService(), getEntitlementService());

export const getLinkedinListSalesSearchParametersInteractor = () =>
  new LinkedinListSalesSearchParametersInteractor(
    getConnectedAccountRepo(),
    getMessagingService(),
    getEntitlementService(),
  );

export const getListRelationRequestsInteractor = () =>
  new ListRelationRequestsInteractor(getConnectedAccountRepo(), getMessagingService(), getEntitlementService());

export const getCreateRelationRequestInteractor = () =>
  new CreateRelationRequestInteractor(getConnectedAccountRepo(), getMessagingService(), getEntitlementService());

export const getAcceptRelationRequestInteractor = () =>
  new AcceptRelationRequestInteractor(getConnectedAccountRepo(), getMessagingService(), getEntitlementService());

export const getCancelRelationRequestInteractor = () =>
  new CancelRelationRequestInteractor(getConnectedAccountRepo(), getMessagingService(), getEntitlementService());

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
  new CreateCheckoutSessionInteractor(getSubscriptionService(), getCompanyRepo(), getUserRepo());

export const getGetSubscriptionInteractor = () =>
  new GetSubscriptionInteractor(getCompanyRepo(), getUserRepo(), getSubscriptionService());

export const getRefreshSubscriptionInteractor = () =>
  new RefreshSubscriptionInteractor(getCompanyRepo(), getSubscriptionService(), getDeleteAccountsForPlanInteractor());

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

export const getDeleteConnectedAccountsForExpiredTrialsInteractor = () =>
  new DeleteConnectedAccountsForExpiredTrialsInteractor(getConnectedAccountRepo(), getDeleteAccountForBillingService());

export const getDeleteConnectedAccountsForInactiveOwnersInteractor = () =>
  new DeleteConnectedAccountsForInactiveOwnersInteractor(
    getConnectedAccountRepo(),
    getDeleteAccountForBillingService(),
  );

export const getDeleteOrphanedUnipileAccountsInteractor = () =>
  new DeleteOrphanedUnipileAccountsInteractor(getConnectedAccountRepo(), getMessagingService());

export const getSendLegalDocumentNoticesInteractor = () =>
  new SendLegalDocumentNoticesInteractor(getUserRepo(), getAuditLogRepo(), getEmailService(), getEventService());

export const getAcceptLegalDocumentsInteractor = () =>
  new AcceptLegalDocumentsInteractor(getUserService(), getAuditLogRepo(), getEventService());

// --- Webhook delivery (workflow task) ---

export const getDeliverWebhookInteractor = () =>
  new DeliverWebhookInteractor(getWebhookDeliveryRepo(), getWebhookRepo());

export const getCreateSupportTicketInteractor = () =>
  new CreateSupportTicketInteractor(getSupportRepo(), getEmailService());
