import { GetRecordActivityPresentationInteractor } from "@/ee/messaging/activities/get-record-activity-presentation.interactor";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { GetRecordActivitiesInteractor } from "@/ee/messaging/activities/get-record-activities.interactor";
import { PrismaRecordActivitiesRepo } from "@/ee/messaging/activities/prisma-record-activities.repository";
import { SearchChannelCandidatesInteractor } from "@/ee/messaging/inbox/search-channel-candidates.interactor";
import { RoutineAdmission } from "@/ee/routines/routine-admission";
import { ManageDataViewsInteractor } from "@/features/data-view/manage-data-views.interactor";
import { ResetDataViewStateInteractor } from "@/features/data-view/reset-data-view-state.interactor";
import { CountSystemTasksInteractor } from "@/features/records/count-system-tasks.interactor";
import { CheckRecordIdentityInteractor } from "@/features/records/check-record-identity.interactor";
import { GetIdentityRecordChoicesInteractor } from "@/features/records/get-identity-record-choices.interactor";
import { GetRecordNavigationInteractor } from "@/features/records/get-record-navigation.interactor";
import { GetRecordPresentationInteractor } from "@/features/records/get-record-presentation.interactor";
import { PrismaEventOutboxRepo } from "@/features/event/prisma-event-outbox.repository";
import { PrismaRecordOperationQueueRepo } from "@/features/records/prisma-record-operation-queue.repository";
import { PrismaRecordEventSubscriptionRepo } from "@/features/records/prisma-record-event-subscription.repository";
import { ProcessDueEventsInteractor } from "@/features/event/process-due-events.interactor";
import { ProcessEventInteractor } from "@/features/event/process-event.interactor";
import { ProviderAvatarService } from "@/features/records/provider-avatar.service";
import { EventAdmissionGroup } from "@/features/event/event-admission-group";
import type { EventAdmission } from "@/features/event/event-admission";
import { RecordHistoryReader } from "@/features/records/record-history-reader";
import { RecordIdentityReader } from "@/features/records/record-identity-reader";
import { RecordRecipientReader } from "@/features/records/record-recipient-reader";
import { RecordViewPolicy } from "@/features/records/record-view-policy";
import { ResolveRecordIdentitiesInteractor } from "@/features/records/resolve-record-identities.interactor";
import { StartChatRecordChannelRepo } from "@/features/records/start-chat-record-channel.repository";
import { SweepRecordDeliveriesInteractor } from "@/features/records/sweep-record-deliveries.interactor";
import { PrismaWebhookDeliveryQueueRepo } from "@/features/webhook/prisma-webhook-delivery-queue.repository";
import { WebhookAdmission } from "@/features/webhook/webhook-admission";
import { WebhookTransport } from "@/features/webhook/webhook-transport.service";
import { GetRecordWidgetsInteractor } from "@/features/widget/get-record-widgets.interactor";
import { GetRecordWidgetInteractor } from "@/features/widget/get-record-widget.interactor";
import { PrismaRecordActivityWidgetRepo } from "@/features/widget/prisma-record-activity-widget.repository";
import { PrismaRecordWidgetRepo } from "@/features/widget/prisma-record-widget.repository";
import { UpsertRecordActivityWidgetInteractor } from "@/features/widget/record-activity-widget.interactor";
import { RecordActivityWidgetReader } from "@/features/widget/record-activity-widget-reader";
import { UpsertRecordWidgetInteractor } from "@/features/widget/record-widget.interactor";
import { RecordWidgetReader } from "@/features/widget/record-widget-reader";
import { GetWidgetGalleryInteractor } from "@/features/widget/get-widget-gallery.interactor";
import { PreviewRecordWidgetInteractor } from "@/features/widget/preview-record-widget.interactor";
import { wikiWebsiteNetwork } from "@/ee/wiki-crawl/wiki-website-network";
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
import { GetCalendarByIdInteractor } from "@/ee/calendar/get-calendar-by-id.interactor";
import { GetCalendarEventByIdInteractor } from "@/ee/calendar/get-calendar-event-by-id.interactor";
import { GetCalendarEventsInteractor } from "@/ee/calendar/get-calendar-events.interactor";
import { GetCalendarsInteractor } from "@/ee/calendar/get-calendars.interactor";
import { PrismaCalendarEventsRepo } from "@/ee/calendar/prisma-calendar-events.repository";
import { PrismaCalendarRepo } from "@/ee/calendar/prisma-calendar.repository";
import { PrismaConnectedAccountRepo } from "@/ee/messaging/persistence/prisma-connected-account.repository";
import { PrismaMessagingRepo } from "@/ee/messaging/persistence/prisma-messaging.repository";
import { PrismaUnipileWebhookRepo } from "@/ee/messaging/persistence/prisma-unipile-webhook.repository";
import { DeleteRoutineInteractor } from "@/ee/routines/delete-routine.interactor";
import { FailRoutineRunInteractor } from "@/ee/routines/fail-routine-run.interactor";
import { GetRoutineRunsInteractor } from "@/ee/routines/get-routine-runs.interactor";
import { GetRoutinesInteractor } from "@/ee/routines/get-routines.interactor";
import { PauseRoutineInteractor } from "@/ee/routines/pause-routine.interactor";
import { PrismaRoutineRepo } from "@/ee/routines/prisma-routine.repository";
import { PruneRoutineRunsInteractor } from "@/ee/routines/prune-routine-runs.interactor";
import { ReconcileRoutineRunsInteractor } from "@/ee/routines/reconcile-routine-runs.interactor";
import { ReleaseOwnerRoutinesInteractor } from "@/ee/routines/release-owner-routines.interactor";
import { PrismaRoutineEventAccess } from "@/ee/routines/prisma-routine-event-access";
import { RunRoutineNowInteractor } from "@/ee/routines/run-routine-now.interactor";
import { StartRoutineRunInteractor } from "@/ee/routines/start-routine-run.interactor";
import { SweepDueRoutinesInteractor } from "@/ee/routines/sweep-due-routines.interactor";
import { UpsertRoutineInteractor } from "@/ee/routines/upsert-routine.interactor";
import { PrismaEventLogRepo } from "@/features/event/prisma-event-log.repository";
import { PrismaCompanyRepo } from "@/features/company/prisma-company.repository";
import { PrismaDataViewRepo } from "@/features/data-view/prisma-data-view.repository";
import { PrismaP13nRepo } from "@/features/p13n/prisma-p13n.repository";
import { RecordConfigurationService } from "@/features/records/configuration.service";
import { ConfigureRecordsProviderInteractor } from "@/features/records/configure-records-provider.interactor";
import { ApplyRecordConfigurationInteractor } from "@/features/records/configure-records.interactor";
import { RecordConfigurationWriter } from "@/features/records/record-configuration-writer";
import { PreviewRecordConfigurationInteractor } from "@/features/records/preview-record-configuration.interactor";
import { GetRecordModelInteractor } from "@/features/records/get-record-model.interactor";
import { DiscoverRecordTypesInteractor } from "@/features/records/discover-record-types.interactor";
import { GetRecordChoicesInteractor } from "@/features/records/get-record-choices.interactor";
import { GetRecordEditorInteractor } from "@/features/records/get-record-editor.interactor";
import { InitializeRecordModelService } from "@/features/records/initialize-record-model.service";
import { MembershipTaskService } from "@/features/records/membership-task.service";
import { MutateRecordInteractor } from "@/features/records/mutate-record.interactor";
import { PreviewRecordDeletionInteractor } from "@/features/records/preview-record-deletion.interactor";
import { PrismaMembershipTaskRepo } from "@/features/records/prisma-membership-task.repository";
import { PrismaRecordRepo } from "@/features/records/prisma-record.repository";
import { QueryRecordMeasureInteractor } from "@/features/records/query-record-measure.interactor";
import { QueryRecordsInteractor } from "@/features/records/query-records.interactor";
import { GetRecordInteractor } from "@/features/records/get-record.interactor";
import { RecordAccessPolicy } from "@/features/records/record-access";
import { PermissionService } from "@/core/base/permission.service";
import { RecordCalculationService } from "@/features/records/record-calculation.service";
import { SaveRecordDetailLayoutInteractor } from "@/features/records/record-detail-layout.interactor";
import { RecordDetailLayoutReader } from "@/features/records/record-detail-layout-reader";
import { ReadRecordDetailLayoutInteractor } from "@/features/records/read-record-detail-layout.interactor";
import { ResumeRecordOperationInteractor } from "@/features/records/record-operation.interactor";
import { GetRecordOperationInteractor } from "@/features/records/get-record-operation.interactor";
import { CancelRecordOperationInteractor } from "@/features/records/cancel-record-operation.interactor";
import { RecordOperationService } from "@/features/records/record-operation.service";
import { RecordWriteService } from "@/features/records/record-write.service";
import { PrismaRoleRepo } from "@/features/role/prisma-role.repository";
import { PrismaUserRepo } from "@/features/user/prisma-user.repository";
import { PrismaWebhookDeliveryRepo } from "@/features/webhook/prisma-webhook-delivery.repository";
import { PrismaWebhookRepo } from "@/features/webhook/prisma-webhook.repository";
import { PrismaWidgetRepo } from "@/features/widget/prisma-widget.repository";
import { PrismaWikiPageRepo } from "@/features/wiki/prisma-wiki-page.repository";
// Services
import { BackgroundTaskService } from "@/core/utils/background-task.service";
import { MessagingService } from "@/ee/messaging/messaging.service";
import { IngestUnipileWebhookInteractor } from "@/ee/messaging/webhooks/ingest-unipile-webhook.interactor";
import { EntitlementService } from "@/ee/subscription/entitlement.service";
import { SubscriptionService } from "@/ee/subscription/subscription.service";
import { CaptureAdClickInteractor } from "@/features/acquisition/capture-ad-click.interactor";
import { DecideAdAttributionConsentInteractor } from "@/features/acquisition/decide-ad-attribution-consent.interactor";
import { NextAdAttributionCookieRepo } from "@/features/acquisition/next/ad-attribution-cookie";
import { ReadAdAttributionConsentInteractor } from "@/features/acquisition/read-ad-attribution-consent.interactor";
import { WithdrawAdAttributionInteractor } from "@/features/acquisition/withdraw-ad-attribution.interactor";
import { AuthService } from "@/features/auth/auth.service";
import { RouteGuardService } from "@/features/auth/route-guard.service";
import { NextInviteTokenCookieRepo } from "@/features/company/next/invite-token-cookie";
import { OnboardingIntentService } from "@/features/company/onboarding-intent.service";
import { EmailService } from "@/features/email/email.service";
import { EventService } from "@/features/event/event.service";
import { UserService } from "@/features/user/user.service";
// Task Listeners
import { DomainEvent } from "@/features/event/domain-events";
import { UserPendingAuthorizationTaskListener } from "@/features/records/membership-task.listener";
// Contacts interactors
// Data transfer interactors
import { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";
import { ValidateAssigneeGuardInteractor } from "@/core/validation/validators/validate-assignee-guard.interactor";
import { ValidateConnectedAccountIdsInteractor } from "@/core/validation/validators/validate-connected-account-ids.interactor";
import { ValidateThreadIdsInteractor } from "@/core/validation/validators/validate-thread-ids.interactor";
import { ValidateUserIdsInteractor } from "@/core/validation/validators/validate-user-ids.interactor";
import { ValidateWebhookDeliveryIdsInteractor } from "@/core/validation/validators/validate-webhook-delivery-ids.interactor";
import { ValidateWebhookIdsInteractor } from "@/core/validation/validators/validate-webhook-ids.interactor";
import { ValidateWidgetIdsInteractor } from "@/core/validation/validators/validate-widget-ids.interactor";
import { ExportRecordsInteractor } from "@/features/data-transfer/export/export-records.interactor";
import { ImportRecordsInteractor } from "@/features/data-transfer/import/import-records.interactor";
// Organizations interactors
// Deals interactors
// Services interactors
// Tasks interactors
// User interactors
import { CompleteOnboardingWizardInteractor } from "@/features/onboarding-wizard/complete-onboarding-wizard.interactor";
import { GetOnboardingWizardProgressInteractor } from "@/features/onboarding-wizard/get-onboarding-wizard-progress.interactor";
import { SaveOnboardingWizardProgressInteractor } from "@/features/onboarding-wizard/save-onboarding-wizard-progress.interactor";
import { CompleteOnboardingWikiStepInteractor } from "@/features/onboarding-wizard/complete-onboarding-wiki-step.interactor";
import { GetTeamMemberInteractor } from "@/features/user/get/get-team-member.interactor";
import { GetUserByIdInteractor } from "@/features/user/get/get-user-by-id.interactor";
import { GetUserDetailsInteractor } from "@/features/user/get/get-user-details.interactor";
import { GetUsersInteractor } from "@/features/user/get/get-users.interactor";
import { ResolveUserOptionsInteractor } from "@/features/user/get/resolve-user-options.interactor";
import { RegisterOnboardingProfileInteractor } from "@/features/user/register/register-onboarding-profile.interactor";
import { RegisterUserInteractor } from "@/features/user/register/register-user.interactor";
import { AdminUpdateUserDetailsInteractor } from "@/features/user/upsert/admin-update-user-details.interactor";
import { UpdateUserDetailsInteractor } from "@/features/user/upsert/update-user-details.interactor";
// Auth interactors
import { ContinueWithSocialsInteractor } from "@/features/auth/continue-with-socials.interactor";
import { DecideMcpConsentInteractor } from "@/features/auth/decide-mcp-consent.interactor";
import { RequestPasswordResetInteractor } from "@/features/auth/request-password-reset.interactor";
import { ResendVerificationEmailInteractor } from "@/features/auth/resend-verification-email.interactor";
import { ResetPasswordInteractor } from "@/features/auth/reset-password.interactor";
import { SignInWithEmailInteractor } from "@/features/auth/sign-in-with-email.interactor";
import { SignOutInteractor } from "@/features/auth/sign-out.interactor";
import { SignUpWithEmailInteractor } from "@/features/auth/sign-up-with-email.interactor";
// Company interactors
import { env } from "@/env";
import { ChooseWorkspaceOnboardingInteractor } from "@/features/company/choose-workspace-onboarding.interactor";
import { GetCompanySettingsInteractor } from "@/features/company/get-company-settings.interactor";
import { GetOrCreateInviteTokenInteractor } from "@/features/company/get-or-create-invite-token.interactor";
import { InviteTokenValidationInteractor } from "@/features/company/invite-token-validation.interactor";
import { InviteUsersByEmailInteractor } from "@/features/company/invite-users-by-email.interactor";
import { OpenInvitationInteractor } from "@/features/company/open-invitation.interactor";
import { UpdateCompanySettingsInteractor } from "@/features/company/update-company-settings.interactor";
// Role interactors
import { DeleteRoleInteractor } from "@/features/role/delete-role.interactor";
import { GetRoleEditorInteractor } from "@/features/role/get-role-editor.interactor";
import { GetRolesInteractor } from "@/features/role/get-roles.interactor";
import { RoleManagementService } from "@/features/role/role-management.service";
import { UpsertRoleInteractor } from "@/features/role/upsert-role.interactor";
// Widget interactors
import { DeleteWidgetInteractor } from "@/features/widget/delete-widget.interactor";
import { GetCompanyWidgetsInteractor } from "@/features/widget/get-company-widgets.interactor";
import { GetWidgetByIdInteractor } from "@/features/widget/get-widget-by-id.interactor";
import { GetWidgetsInteractor } from "@/features/widget/get-widgets.interactor";
import { UpdateWidgetLayoutsInteractor } from "@/features/widget/update-widget-layouts.interactor";
// Messaging interactors
import { CountChannelsNeedingActionInteractor } from "@/ee/messaging/connect/count-channels-needing-action.interactor";
import { CreateAuthLinkInteractor } from "@/ee/messaging/connect/create-auth-link.interactor";
import { DeleteAccountForBillingService } from "@/ee/messaging/connect/delete-account-for-billing.service";
import { DeleteAccountsForPlanInteractor } from "@/ee/messaging/connect/delete-accounts-for-plan.interactor";
import { DeleteConnectedAccountInteractor } from "@/ee/messaging/connect/delete-connected-account.interactor";
import { GetMyConnectedAccountsApiInteractor } from "@/ee/messaging/connect/get-my-connected-accounts-api.interactor";
import { GetMyConnectedAccountsContextInteractor } from "@/ee/messaging/connect/get-my-connected-accounts-context.interactor";
import { GetMyConnectedAccountsInteractor } from "@/ee/messaging/connect/get-my-connected-accounts.interactor";
import { ReconnectConnectedAccountInteractor } from "@/ee/messaging/connect/reconnect-connected-account.interactor";
import { ResyncConnectedAccountInteractor } from "@/ee/messaging/connect/resync-connected-account.interactor";
import { SetConnectedAccountSignatureInteractor } from "@/ee/messaging/connect/set-connected-account-signature.interactor";
import { SetConnectedAccountVisibilityInteractor } from "@/ee/messaging/connect/set-connected-account-visibility.interactor";
import { SetSelectedFoldersInteractor } from "@/ee/messaging/connect/set-selected-folders.interactor";
import { GetMessageAttachmentInteractor } from "@/ee/messaging/inbox/get-message-attachment.interactor";
import { GetMessagingFilterOptionsInteractor } from "@/ee/messaging/inbox/get-messaging-filter-options.interactor";
import { GetMessagingThreadInteractor } from "@/ee/messaging/inbox/get-messaging-thread.interactor";
import { GetMessagingThreadsInteractor } from "@/ee/messaging/inbox/get-messaging-threads.interactor";
import { GetUnreadThreadCountInteractor } from "@/ee/messaging/inbox/get-unread-thread-count.interactor";
import { MoveEmailThreadInteractor } from "@/ee/messaging/inbox/move-email-thread.interactor";
import { RefreshInboxInteractor } from "@/ee/messaging/inbox/refresh-inbox.interactor";
import { ResyncThreadInteractor } from "@/ee/messaging/inbox/resync-thread.interactor";
import { BackfillCalendarsInteractor } from "@/ee/messaging/ingest/backfill/backfill-calendars.interactor";
import { BackfillChatsInteractor } from "@/ee/messaging/ingest/backfill/backfill-chats.interactor";
import { BackfillEmailsInteractor } from "@/ee/messaging/ingest/backfill/backfill-emails.interactor";
import { PrepareBackfillInteractor } from "@/ee/messaging/ingest/backfill/prepare-backfill.interactor";
import { ClaimBackfillInteractor } from "@/ee/messaging/ingest/claim-backfill.interactor";
import { ReleaseBackfillClaimInteractor } from "@/ee/messaging/ingest/release-backfill-claim.interactor";
import { ReprocessStuckWebhookEventsInteractor } from "@/ee/messaging/ingest/reprocess-stuck-webhook-events.interactor";
import { DiscardDraftInteractor } from "@/ee/messaging/outbound/discard-draft.interactor";
import { ResolveProviderProfileInteractor } from "@/ee/messaging/outbound/resolve-provider-profile.interactor";
import { SaveDraftInteractor } from "@/ee/messaging/outbound/save-draft.interactor";
import { SaveNewThreadDraftInteractor } from "@/ee/messaging/outbound/save-new-thread-draft.interactor";
import { SaveReplyDraftInteractor } from "@/ee/messaging/outbound/save-reply-draft.interactor";
import { SendChatMessageInteractor } from "@/ee/messaging/outbound/send-chat-message.interactor";
import { SendEmailInteractor } from "@/ee/messaging/outbound/send-email.interactor";
import { StartChatInteractor } from "@/ee/messaging/outbound/start-chat.interactor";
import { AcceptRelationRequestInteractor } from "@/ee/messaging/posts/accept-relation-request.interactor";
import { CancelRelationRequestInteractor } from "@/ee/messaging/posts/cancel-relation-request.interactor";
import { CreateRelationRequestInteractor } from "@/ee/messaging/posts/create-relation-request.interactor";
import { GetSocialPostInteractor } from "@/ee/messaging/posts/get-social-post.interactor";
import { GetSocialProfileInteractor } from "@/ee/messaging/posts/get-social-profile.interactor";
import { ListRelationRequestsInteractor } from "@/ee/messaging/posts/list-relation-requests.interactor";
import { ListSocialCommentReactionsInteractor } from "@/ee/messaging/posts/list-social-comment-reactions.interactor";
import { ListSocialPostCommentsInteractor } from "@/ee/messaging/posts/list-social-post-comments.interactor";
import { ListSocialPostReactionsInteractor } from "@/ee/messaging/posts/list-social-post-reactions.interactor";
import { ListSocialPostsInteractor } from "@/ee/messaging/posts/list-social-posts.interactor";
import { LinkedinBrowseSalesListInteractor } from "@/ee/messaging/sales-navigator/linkedin-browse-sales-list.interactor";
import { LinkedinListSalesListsInteractor } from "@/ee/messaging/sales-navigator/linkedin-list-sales-lists.interactor";
import { LinkedinListSalesSearchParametersInteractor } from "@/ee/messaging/sales-navigator/linkedin-list-sales-search-parameters.interactor";
import { LinkedinSaveToSalesListInteractor } from "@/ee/messaging/sales-navigator/linkedin-save-to-sales-list.interactor";
import { LinkedinSearchSalesCompaniesInteractor } from "@/ee/messaging/sales-navigator/linkedin-search-sales-companies.interactor";
import { LinkedinSearchSalesNavigatorInteractor } from "@/ee/messaging/sales-navigator/linkedin-search-sales-navigator.interactor";
import { LinkedinSearchSalesPeopleInteractor } from "@/ee/messaging/sales-navigator/linkedin-search-sales-people.interactor";
import { UpdateThreadInteractor } from "@/ee/messaging/thread-state/update-thread.interactor";
import { ProcessAccountAddWebhookInteractor } from "@/ee/messaging/webhooks/account/process-account-add-webhook.interactor";
import { ProcessAccountReadyWebhookInteractor } from "@/ee/messaging/webhooks/account/process-account-ready-webhook.interactor";
import { ProcessAccountReconnectWebhookInteractor } from "@/ee/messaging/webhooks/account/process-account-reconnect-webhook.interactor";
import { ProcessAccountRemoveWebhookInteractor } from "@/ee/messaging/webhooks/account/process-account-remove-webhook.interactor";
import { ProcessAccountStatusWebhookInteractor } from "@/ee/messaging/webhooks/account/process-account-status-webhook.interactor";
import { ProcessCalendarDeleteWebhookInteractor } from "@/ee/messaging/webhooks/calendar/process-calendar-delete-webhook.interactor";
import { ProcessCalendarEventDeleteWebhookInteractor } from "@/ee/messaging/webhooks/calendar/process-calendar-event-delete-webhook.interactor";
import { ProcessCalendarEventUpsertWebhookInteractor } from "@/ee/messaging/webhooks/calendar/process-calendar-event-upsert-webhook.interactor";
import { ProcessCalendarUpsertWebhookInteractor } from "@/ee/messaging/webhooks/calendar/process-calendar-upsert-webhook.interactor";
import { ProcessChatDeleteWebhookInteractor } from "@/ee/messaging/webhooks/chat/process-chat-delete-webhook.interactor";
import { ProcessChatUpdateWebhookInteractor } from "@/ee/messaging/webhooks/chat/process-chat-update-webhook.interactor";
import { ProcessEmailDeleteWebhookInteractor } from "@/ee/messaging/webhooks/email/process-email-delete-webhook.interactor";
import { ProcessEmailFolderWebhookInteractor } from "@/ee/messaging/webhooks/email/process-email-folder-webhook.interactor";
import { ProcessEmailNewWebhookInteractor } from "@/ee/messaging/webhooks/email/process-email-new-webhook.interactor";
import { ProcessMessageDeleteWebhookInteractor } from "@/ee/messaging/webhooks/message/process-message-delete-webhook.interactor";
import { ProcessMessageNewWebhookInteractor } from "@/ee/messaging/webhooks/message/process-message-new-webhook.interactor";
import { ProcessMessageReactionWebhookInteractor } from "@/ee/messaging/webhooks/message/process-message-reaction-webhook.interactor";
import type { UnipileWebhookHandlerMap } from "@/ee/messaging/webhooks/process-unipile-webhook.interactor";
import { ProcessUnipileWebhookInteractor } from "@/ee/messaging/webhooks/process-unipile-webhook.interactor";
import { ProcessRelationWebhookInteractor } from "@/ee/messaging/webhooks/relation/process-relation-webhook.interactor";
// Webhook interactors
import { DeleteWebhookInteractor } from "@/features/webhook/delete-webhook.interactor";
import { GetWebhookByIdInteractor } from "@/features/webhook/get-webhook-by-id.interactor";
import { GetWebhookDeliveriesInteractor } from "@/features/webhook/get-webhook-deliveries.interactor";
import { GetWebhooksInteractor } from "@/features/webhook/get-webhooks.interactor";
import { ResendWebhookDeliveryInteractor } from "@/features/webhook/resend-webhook-delivery.interactor";
import { UpsertWebhookInteractor } from "@/features/webhook/upsert-webhook.interactor";
import { GetWikiPagesInteractor } from "@/features/wiki/get-wiki-pages.interactor";
import { GetWikiCatalogInteractor } from "@/features/wiki/get-wiki-catalog.interactor";
import { SearchWikiPagesInteractor, sharedWikiSearchOrders } from "@/features/wiki/search-wiki-pages.interactor";
import { GetWikiPageInteractor } from "@/features/wiki/get-wiki-page.interactor";
import { CreateWikiPagesInteractor } from "@/features/wiki/create-wiki-pages.interactor";
import { MoveWikiPageInteractor } from "@/features/wiki/move-wiki-page.interactor";
import { UpdateWikiPageInteractor } from "@/features/wiki/update-wiki-page.interactor";
import { DeleteWikiPageInteractor } from "@/features/wiki/delete-wiki-page.interactor";
import { StartWikiHomepageSetupInteractor } from "@/features/wiki/start-wiki-homepage-setup.interactor";
import { GetWikiHomepageSetupStateInteractor } from "@/features/wiki/get-wiki-homepage-setup-state.interactor";
import { FailWikiWebsiteCrawlInteractor } from "@/ee/wiki-crawl/fail-wiki-website-crawl.interactor";
// Custom Column interactors
// Search interactor
import { ResolveRecordSearchInteractor } from "@/features/records/resolve-record-search.interactor";
import { SearchRecordsInteractor } from "@/features/records/search-records.interactor";
// P13n interactors
import { DeleteDataViewInteractor } from "@/features/data-view/delete-data-view.interactor";
import { GetDataViewsInteractor } from "@/features/data-view/get-data-views.interactor";
import { SaveDataViewStateInteractor } from "@/features/data-view/save-data-view-state.interactor";
import { SelectDataViewInteractor } from "@/features/data-view/select-data-view.interactor";
import { UpsertDataViewInteractor } from "@/features/data-view/upsert-data-view.interactor";
import { GetP13nInteractor } from "@/features/p13n/get-p13n.interactor";
import { UpsertP13nInteractor } from "@/features/p13n/upsert-p13n.interactor";
// Feedback interactor
import { SendContactInquiryInteractor } from "@/features/contact/send-contact-inquiry.interactor";
import { SendFeedbackInteractor } from "@/features/feedback/send-feedback.interactor";
// API Key interactors
import { CreateApiKeyInteractor } from "@/features/api-key/create-api-key.interactor";
import { DeleteApiKeyInteractor } from "@/features/api-key/delete-api-key.interactor";
import { GetApiKeysInteractor } from "@/features/api-key/get-api-keys.interactor";
// EE Subscription interactors
import { CreateCheckoutSessionInteractor } from "@/ee/subscription/create-checkout-session.interactor";
import { GetBillingPortalUrlInteractor } from "@/ee/subscription/get-billing-portal-url.interactor";
import { GetSubscriptionInteractor } from "@/ee/subscription/get-subscription.interactor";
import { RefreshSubscriptionInteractor } from "@/ee/subscription/refresh-subscription.interactor";
// EE Lifecycle interactors (cron consumers)
import { DeactivateTrialUsersAndSendNoticeInteractor } from "@/ee/lifecycle/deactivate-trial-users-and-send-notice.interactor";
import { DeactivateUsersAfterSubscriptionGracePeriodInteractor } from "@/ee/lifecycle/deactivate-users-after-subscription-grace-period.interactor";
import { DeleteConnectedAccountsForExpiredTrialsInteractor } from "@/ee/lifecycle/delete-connected-accounts-for-expired-trials.interactor";
import { DeleteConnectedAccountsForInactiveOwnersInteractor } from "@/ee/lifecycle/delete-connected-accounts-for-inactive-owners.interactor";
import { DeleteOrphanedUnipileAccountsInteractor } from "@/ee/lifecycle/delete-orphaned-unipile-accounts.interactor";
import { ExpireAdAttributionInteractor } from "@/ee/lifecycle/expire-ad-attribution.interactor";
import { SendLegalDocumentNoticesInteractor } from "@/ee/lifecycle/send-legal-document-notices.interactor";
import { SendTrialExtensionOfferInteractor } from "@/ee/lifecycle/send-trial-extension-offer.interactor";
import { SendTrialInactivationReminderInteractor } from "@/ee/lifecycle/send-trial-inactivation-reminder.interactor";
import { SendWelcomeAndDemoInteractor } from "@/ee/lifecycle/send-welcome-and-demo.interactor";
import { AcceptLegalDocumentsInteractor } from "@/features/legal/accept-legal-documents.interactor";
import { GetLegalStatusInteractor } from "@/features/legal/get-legal-status.interactor";
// Webhook delivery interactor (workflow task consumer)
import { DeliverWebhookInteractor } from "@/features/webhook/deliver-webhook.interactor";
// Audit log interactors
import { AgentUsageService } from "@/ee/agent-chat/agent-usage.service";
import { ArchiveAgentConversationInteractor } from "@/ee/agent-chat/archive-agent-conversation.interactor";
import { ReconcileRetrievalReservationsInteractor } from "@/ee/agent-chat/reconcile-retrieval-reservations.interactor";
import { CancelAgentTurnInteractor } from "@/ee/agent-chat/cancel-agent-turn.interactor";
import { CreateChatSupportTicketInteractor } from "@/ee/agent-chat/create-chat-support-ticket.interactor";
import { DeleteAgentConversationInteractor } from "@/ee/agent-chat/delete-agent-conversation.interactor";
import { GetAgentConfigInteractor } from "@/ee/agent-chat/get-agent-config.interactor";
import { GetAgentConversationInteractor } from "@/ee/agent-chat/get-agent-conversation.interactor";
import { GetAgentRunStreamInteractor } from "@/ee/agent-chat/get-agent-run-stream.interactor";
import { ListAgentConversationsInteractor } from "@/ee/agent-chat/list-agent-conversations.interactor";
import { PrismaAgentChatRepo } from "@/ee/agent-chat/prisma-agent-chat.repository";
import { RecordSuggestionSignals } from "@/ee/agent-chat/record-suggestion-signals";
import { RespondToApprovalInteractor } from "@/ee/agent-chat/respond-to-approval.interactor";
import { RespondToUiCommandInteractor } from "@/ee/agent-chat/respond-to-ui-command.interactor";
import { RestoreAgentConversationInteractor } from "@/ee/agent-chat/restore-agent-conversation.interactor";
import { SendAgentMessageInteractor } from "@/ee/agent-chat/send-agent-message.interactor";
import { CorrectOperatorSubscriptionSnapshotInteractor } from "@/ee/operator/correct-operator-subscription-snapshot.interactor";
import { CreateAgentCreditAdjustmentInteractor } from "@/ee/operator/create-agent-credit-adjustment.interactor";
import { DeleteOperatorWorkspaceInteractor } from "@/ee/operator/delete-operator-workspace.interactor";
import { GetAdConversionExportInteractor } from "@/ee/operator/get/get-ad-conversion-export.interactor";
import { GetHostedAiOperatorOverviewInteractor } from "@/ee/operator/get/get-hosted-ai-operator-overview.interactor";
import { GetOperatorAuditLogsInteractor } from "@/ee/operator/get/get-operator-audit-logs.interactor";
import { GetOperatorConsoleVisibilityInteractor } from "@/ee/operator/get/get-operator-console-visibility.interactor";
import { GetOperatorRiskSummaryInteractor } from "@/ee/operator/get/get-operator-risk-summary.interactor";
import { GetOperatorUserDetailInteractor } from "@/ee/operator/get/get-operator-user-detail.interactor";
import { GetOperatorUserSummaryInteractor } from "@/ee/operator/get/get-operator-user-summary.interactor";
import { GetOperatorUsersInteractor } from "@/ee/operator/get/get-operator-users.interactor";
import { GetOperatorWorkspaceStatsInteractor } from "@/ee/operator/get/get-operator-workspace-stats.interactor";
import { GetOperatorWorkspaceTagsInteractor } from "@/ee/operator/get/get-operator-workspace-tags.interactor";
import { GetOperatorWorkspacesInteractor } from "@/ee/operator/get/get-operator-workspaces.interactor";
import { OperatorAccessService } from "@/ee/operator/operator-access.service";
import { PrismaAdConversionExportRepo } from "@/ee/operator/prisma-ad-conversion-export.repository";
import { PrismaOperatorAccessRepo } from "@/ee/operator/prisma-operator-access.repository";
import { PrismaOperatorAuditRepo } from "@/ee/operator/prisma-operator-audit.repository";
import { PrismaOperatorRiskSummaryRepo } from "@/ee/operator/prisma-operator-risk-summary.repository";
import { PrismaOperatorUsersRepo } from "@/ee/operator/prisma-operator-users.repository";
import { PrismaOperatorWorkspacesRepo } from "@/ee/operator/prisma-operator-workspaces.repository";
import { PrismaOperatorRepo } from "@/ee/operator/prisma-operator.repository";
import { ResetOperatorUserCreditsInteractor } from "@/ee/operator/reset-operator-user-credits.interactor";
import { UpdateHostedAiEnterpriseAllowanceInteractor } from "@/ee/operator/update-hosted-ai-enterprise-allowance.interactor";
import { UpdateOperatorSubscriptionTermsInteractor } from "@/ee/operator/update-operator-subscription-terms.interactor";
import { UpdateOperatorUserPlatformAccessInteractor } from "@/ee/operator/update-operator-user-platform-access.interactor";
import { UpdateOperatorUserStatusInteractor } from "@/ee/operator/update-operator-user-status.interactor";
import { UpdateOperatorWorkspaceTagsInteractor } from "@/ee/operator/update-operator-workspace-tags.interactor";
import { FeedbackCreator } from "@/features/feedback/feedback.creator";
import { CreateSupportTicketInteractor } from "@/features/support/create-support-ticket.interactor";
import { WikiEmbeddingService } from "@/ee/wiki-retrieval/wiki-embedding.service";
import { DocsSemanticIndexDispatcher } from "@/ee/wiki-retrieval/docs-semantic-index-dispatcher";
import { DocsSemanticIndexService } from "@/ee/wiki-retrieval/docs-semantic-index.service";
import { PrismaDocsChunkRepo } from "@/features/mcp-tools/prisma-docs-chunk.repository";
import { tenantStorage } from "@/core/decorators/tenant-context";
import type { QueryEmbedding } from "@/core/retrieval/retrieval-pipeline";
import { PrismaWikiWebsiteCrawlRepo } from "@/ee/wiki-crawl/prisma-wiki-website-crawl.repository";
import { WikiWebsiteCrawlService } from "@/ee/wiki-crawl/wiki-website-crawl.service";
import { WikiWebsiteSynthesisService } from "@/ee/wiki-crawl/wiki-website-synthesis.service";
import { WikiSemanticQueryEmbedder } from "@/ee/wiki-retrieval/wiki-query-embedder";
import { WikiSemanticIndexService } from "@/ee/wiki-retrieval/wiki-semantic-index.service";
import { WikiSemanticIndexDispatcher } from "@/ee/wiki-retrieval/wiki-semantic-index-scheduler";
import { WikiSemanticIndexListener } from "@/ee/wiki-retrieval/wiki-semantic-index-listener";
export const getProviderAvatarService = (companyId: string) =>
  new ProviderAvatarService(
    new PrismaRecordRepo(companyId, getBackgroundTaskService()),
    companyId,
    getBackgroundTaskService(),
  );
export const getResolveRecordIdentitiesInteractor = () =>
  new ResolveRecordIdentitiesInteractor(getRecordRepo(), getRecordAccessPolicy());
export const getSearchChannelCandidatesInteractor = () =>
  new SearchChannelCandidatesInteractor(getMessagingRepo(), getEntitlementService());
export const getCheckRecordIdentityInteractor = () =>
  new CheckRecordIdentityInteractor(getRecordRepo(), getRecordAccessPolicy());
export const getRecordRepo = () => new PrismaRecordRepo(undefined, getBackgroundTaskService());
export const getRecordActivitiesRepo = () => new PrismaRecordActivitiesRepo(getPermissionService());
export const getRecordHistoryReader = () => new RecordHistoryReader(getRecordRepo());
export const getGetRecordActivityPresentationInteractor = () =>
  new GetRecordActivityPresentationInteractor(
    getDataViewStateRepo(),
    getRecordViewPolicy(),
    getGetRecordActivitiesInteractor(),
  );

export const getGetRecordActivitiesInteractor = () =>
  new GetRecordActivitiesInteractor(
    getRecordActivitiesRepo(),
    getRecordRepo(),
    getRecordAccessPolicy(),
    getRecordIdentityReader(),
    getRecordHistoryReader(),
    getEntitlementService(),
  );
export const getGetIdentityRecordChoicesInteractor = () =>
  new GetIdentityRecordChoicesInteractor(getRecordRepo(), getRecordAccessPolicy());
export const getRecordIdentityReader = () => new RecordIdentityReader(getRecordRepo(), getRecordAccessPolicy());
export const getGetRecordNavigationInteractor = () =>
  new GetRecordNavigationInteractor(getRecordRepo(), getRecordAccessPolicy());
export const getDiscoverRecordTypesInteractor = () =>
  new DiscoverRecordTypesInteractor(getRecordRepo(), getRecordAccessPolicy());
export const getConfigureRecordsProviderInteractor = () =>
  new ConfigureRecordsProviderInteractor(
    getPreviewRecordConfigurationInteractor(),
    getApplyRecordConfigurationInteractor(),
  );
export const getQueryRecordMeasureInteractor = () =>
  new QueryRecordMeasureInteractor(getRecordRepo(), getRecordAccessPolicy(), getCompanyRepo());
export const getRecordAccessPolicy = () => new RecordAccessPolicy(getUserRepo(), getRecordRepo());
export const getPreviewRecordDeletionInteractor = () =>
  new PreviewRecordDeletionInteractor(getRecordRepo(), getRecordAccessPolicy(), getRecordWriteService());
export const getRecordCalculationService = () => new RecordCalculationService(getRecordRepo());
export const getRecordWriteService = () =>
  new RecordWriteService(getRecordRepo(), getRecordAccessPolicy(), getRecordCalculationService());
export const getRecordConfigurationService = () => new RecordConfigurationService(getRecordRepo());
export const getGetRecordModelInteractor = () => new GetRecordModelInteractor(getRecordRepo(), getRecordAccessPolicy());
export const getQueryRecordsInteractor = () => new QueryRecordsInteractor(getRecordRepo(), getRecordAccessPolicy());
export const getExportRecordsInteractor = () => new ExportRecordsInteractor(getRecordRepo(), getRecordAccessPolicy());
export const getImportRecordsInteractor = () =>
  new ImportRecordsInteractor(getRecordRepo(), getRecordAccessPolicy(), getRecordWriteService(), getCompanyRepo());
export const getGetRecordInteractor = () => new GetRecordInteractor(getRecordRepo(), getRecordAccessPolicy());
export const getGetRecordEditorInteractor = () =>
  new GetRecordEditorInteractor(getRecordRepo(), getRecordAccessPolicy(), getRecordDetailLayoutReader());
export const getRecordDetailLayoutReader = () => new RecordDetailLayoutReader(getP13nRepo());
export const getReadRecordDetailLayoutInteractor = () =>
  new ReadRecordDetailLayoutInteractor(getRecordRepo(), getRecordAccessPolicy(), getRecordDetailLayoutReader());
export const getSaveRecordDetailLayoutInteractor = () =>
  new SaveRecordDetailLayoutInteractor(
    getRecordRepo(),
    getRecordAccessPolicy(),
    getP13nRepo(),
    getRecordDetailLayoutReader(),
  );
export const getGetRecordChoicesInteractor = () =>
  new GetRecordChoicesInteractor(getRecordRepo(), getRecordAccessPolicy(), getQueryRecordsInteractor());
export const getMutateRecordInteractor = () =>
  new MutateRecordInteractor(
    getRecordRepo(),
    getRecordAccessPolicy(),
    getRecordWriteService(),
    getCompanyRepo(),
    getBackgroundTaskService(),
  );
export const getPreviewRecordConfigurationInteractor = () =>
  new PreviewRecordConfigurationInteractor(getRecordRepo(), getRecordAccessPolicy(), getRecordConfigurationService());
export const getApplyRecordConfigurationInteractor = () =>
  new ApplyRecordConfigurationInteractor(
    getRecordRepo(),
    getRecordAccessPolicy(),
    getRecordConfigurationService(),
    new RecordConfigurationWriter(getRecordRepo(), getRecordCalculationService()),
    getCompanyRepo(),
    getBackgroundTaskService(),
  );
export const getRecordOperationService = () =>
  new RecordOperationService(
    getRecordRepo(),
    getRecordAccessPolicy(),
    getRecordConfigurationService(),
    getCompanyRepo(),
  );
export const getGetRecordOperationInteractor = () =>
  new GetRecordOperationInteractor(getRecordRepo(), getRecordAccessPolicy());
export const getCancelRecordOperationInteractor = () =>
  new CancelRecordOperationInteractor(getRecordRepo(), getRecordAccessPolicy());
export const getResumeRecordOperationInteractor = () =>
  new ResumeRecordOperationInteractor(getRecordRepo(), getRecordAccessPolicy(), getBackgroundTaskService());
export const getPermissionService = () => new PermissionService();
export const getUserRepo = () => new PrismaUserRepo(getPermissionService());
export const getCompanyRepo = () => new PrismaCompanyRepo();
export const getRoleRepo = () => new PrismaRoleRepo();
export const getP13nRepo = () => new PrismaP13nRepo();
export const getDataViewRepo = () => new PrismaDataViewRepo();
export const getDataViewStateRepo = () => new PrismaDataViewRepo();
export const getWidgetRepo = () => new PrismaWidgetRepo();
export const getWebhookRepo = () => new PrismaWebhookRepo(getRecordEventSubscriptionRepo(), getPermissionService());

export const getRecordRecipientReader = () => new RecordRecipientReader((companyId) => new PrismaRecordRepo(companyId));
export const getRecordEventSubscriptionRepo = () => new PrismaRecordEventSubscriptionRepo(getRecordRepo());
export const getRoutineAdmission = () =>
  new RoutineAdmission(getRoutineRepo(), getBackgroundTaskService(), getRecordRecipientReader());
export const getWebhookAdmission = () => new WebhookAdmission(getRecordRecipientReader(), getBackgroundTaskService());
export const getProcessEventInteractor = (
  admission: EventAdmission = new EventAdmissionGroup([getWebhookAdmission(), getRoutineAdmission()]),
) => new ProcessEventInteractor(new PrismaEventOutboxRepo(), admission);
export const getProcessDueEventsInteractor = () =>
  new ProcessDueEventsInteractor(new PrismaEventOutboxRepo(), getProcessEventInteractor());
export const getSweepRecordDeliveriesInteractor = () =>
  new SweepRecordDeliveriesInteractor(
    new PrismaEventOutboxRepo(),
    new PrismaWebhookDeliveryQueueRepo(),
    new PrismaRecordOperationQueueRepo(),
    getBackgroundTaskService(),
  );
export const getRoutineRepo = () =>
  new PrismaRoutineRepo(getRoutineEventAccess(), getRecordEventSubscriptionRepo(), getPermissionService());

export const getRoutineEventAccess = () => new PrismaRoutineEventAccess(getRecordRecipientReader());
export const getWebhookDeliveryRepo = () => new PrismaWebhookDeliveryRepo(getRecordRecipientReader());
export const getEventLogRepo = () => new PrismaEventLogRepo(getBackgroundTaskService());
export const getWikiPageRepo = () => new PrismaWikiPageRepo(getPermissionService());
export const getMessagingRepo = () => new PrismaMessagingRepo();
export const getConnectedAccountRepo = () => new PrismaConnectedAccountRepo(getPermissionService());
export const getUnipileWebhookRepo = () => new PrismaUnipileWebhookRepo();
export const getCalendarRepo = () => new PrismaCalendarRepo();
export const getCalendarEventsRepo = () => new PrismaCalendarEventsRepo();
export const getAgentChatRepo = (): PrismaAgentChatRepo =>
  new PrismaAgentChatRepo(getWikiPageRepo(), getPermissionService());
export const getOperatorRepo = () => new PrismaOperatorRepo(getAgentChatRepo());
export const getOperatorAccessRepo = () => new PrismaOperatorAccessRepo();

// ─── Section 3: Services ────────────────────────────────────────────────────

export const getEmailService = () => new EmailService();
export const getAuthService = () => new AuthService(getEmailService());
export const getOperatorAccessService = () => new OperatorAccessService(getAuthService(), getOperatorAccessRepo());
export const getUserService = () => new UserService(getAuthService(), getUserRepo());
export const getRouteGuardService = () =>
  new RouteGuardService(getAuthService(), getUserRepo(), getCompanyRepo(), getGetLegalStatusInteractor());
export const getBackgroundTaskService = () => new BackgroundTaskService();
export const getInviteTokenCookieRepo = () => new NextInviteTokenCookieRepo();
export const getOnboardingIntentService = () =>
  new OnboardingIntentService(getInviteTokenValidationInteractor(), env.BETTER_AUTH_SECRET);
export const getMembershipTaskService = () =>
  new MembershipTaskService(getRecordRepo(), new PrismaMembershipTaskRepo(), getRecordAccessPolicy());
export const getCountSystemTasksInteractor = () => new CountSystemTasksInteractor(getMembershipTaskService());
export const getUserPendingAuthorizationTaskListener = () =>
  new UserPendingAuthorizationTaskListener(getMembershipTaskService());
export const getWikiEmbeddingService = () => new WikiEmbeddingService(getAgentUsageService());
export const getWikiSemanticIndexService = () =>
  new WikiSemanticIndexService(getWikiPageRepo(), getWikiEmbeddingService());
const getWikiSemanticIndexDispatcher = (trigger: "write" | "search") =>
  new WikiSemanticIndexDispatcher(getWikiPageRepo(), getWikiEmbeddingService(), getBackgroundTaskService(), trigger);
export const getWikiSemanticIndexListener = () =>
  new WikiSemanticIndexListener(getWikiSemanticIndexDispatcher("write"));
export const getDocsChunkRepo = () => new PrismaDocsChunkRepo();
export const getDocsSemanticIndexService = () =>
  new DocsSemanticIndexService(getDocsChunkRepo(), getAgentUsageService());
export const getDocsSemanticIndexDispatcher = () =>
  new DocsSemanticIndexDispatcher(getDocsChunkRepo(), getBackgroundTaskService());
export const getRetrievalQueryEmbedder = (): QueryEmbedding | null => {
  const tenant = tenantStorage.getStore();
  if (!tenant?.user || tenant.bypass) return null;
  const embedder = new WikiSemanticQueryEmbedder(getWikiEmbeddingService());
  return (query, wait) => embedder.embedQuery(query, wait);
};
const getWikiSemanticRetrieval = () => ({
  embedder: new WikiSemanticQueryEmbedder(getWikiEmbeddingService()),
  scheduler: getWikiSemanticIndexDispatcher("search"),
});

const EXPECTED_EVENT_LISTENERS = [
  {
    factory: getUserPendingAuthorizationTaskListener,
    events: [DomainEvent.USER_REGISTERED, DomainEvent.USER_UPDATED],
  },
  {
    factory: getWikiSemanticIndexListener,
    events: [DomainEvent.WIKI_PAGE_CREATED, DomainEvent.WIKI_PAGE_UPDATED],
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

  return new EventService(listeners, getEventLogRepo());
};
export const getSubscriptionService = () => new SubscriptionService(getCompanyRepo());
export const getEntitlementService = () => new EntitlementService(getCompanyRepo());
export const getMessagingService = () => new MessagingService();
export const getDeleteAccountForBillingService = () =>
  new DeleteAccountForBillingService(getConnectedAccountRepo(), getMessagingService(), getEventService());
export const getIngestUnipileWebhookInteractor = () =>
  new IngestUnipileWebhookInteractor(getUnipileWebhookRepo(), getProcessUnipileWebhookInteractor());

export const getUserIdsValidator = () => new ValidateUserIdsInteractor(getUserRepo());
export const getAssigneeGuardValidator = () => new ValidateAssigneeGuardInteractor(getUserService());
export const getQueryParamsPrecheck = () =>
  new QueryParamsPrecheckInteractor(getUserIdsValidator(), getThreadIdsValidator(), getConnectedAccountIdsValidator());
export const getWidgetIdsValidator = () => new ValidateWidgetIdsInteractor(getWidgetRepo());
export const getWebhookIdsValidator = () => new ValidateWebhookIdsInteractor(getWebhookRepo());
export const getWebhookDeliveryIdsValidator = () => new ValidateWebhookDeliveryIdsInteractor(getWebhookDeliveryRepo());
export const getThreadIdsValidator = () => new ValidateThreadIdsInteractor(getMessagingRepo());
export const getConnectedAccountIdsValidator = () =>
  new ValidateConnectedAccountIdsInteractor(getConnectedAccountRepo());

// --- User ---

export const getRegisterUserInteractor = () =>
  new RegisterUserInteractor(
    getAuthService(),
    getUserRepo(),
    getEventService(),
    getRouteGuardService(),
    getCompanyRepo(),
    new InitializeRecordModelService(getRecordRepo()),
  );

export const getRegisterOnboardingProfileInteractor = () =>
  new RegisterOnboardingProfileInteractor(
    getAuthService(),
    getOnboardingIntentService(),
    getInviteTokenCookieRepo(),
    getRegisterUserInteractor(),
  );

export const getAdAttributionCookieRepo = () => new NextAdAttributionCookieRepo();

export const getReadAdAttributionConsentInteractor = () =>
  new ReadAdAttributionConsentInteractor(getAdAttributionCookieRepo());

export const getDecideAdAttributionConsentInteractor = () =>
  new DecideAdAttributionConsentInteractor(getAdAttributionCookieRepo());

export const getCaptureAdClickInteractor = () => new CaptureAdClickInteractor(getAdAttributionCookieRepo());

export const getWithdrawAdAttributionInteractor = () =>
  new WithdrawAdAttributionInteractor(getRouteGuardService(), getUserRepo(), getAdAttributionCookieRepo());

export const getUpdateUserDetailsInteractor = () => new UpdateUserDetailsInteractor(getUserRepo(), getEventService());

export const getCompleteOnboardingWizardInteractor = () =>
  new CompleteOnboardingWizardInteractor(getUserRepo(), getRouteGuardService());
export const getCompleteOnboardingWikiStepInteractor = () =>
  new CompleteOnboardingWikiStepInteractor(getUserRepo(), getRouteGuardService());

export const getGetOnboardingWizardProgressInteractor = () =>
  new GetOnboardingWizardProgressInteractor(getUserRepo(), getRouteGuardService(), getAuthService());

export const getSaveOnboardingWizardProgressInteractor = () =>
  new SaveOnboardingWizardProgressInteractor(getUserRepo(), getRouteGuardService(), getAuthService());

export const getGetUserDetailsInteractor = () => new GetUserDetailsInteractor();

export const getGetUserByIdInteractor = () => new GetUserByIdInteractor(getUserRepo());
export const getResolveUserOptionsInteractor = () => new ResolveUserOptionsInteractor(getUserRepo());

export const getGetTeamMemberInteractor = () => new GetTeamMemberInteractor(getUserRepo());

export const getAdminUpdateUserDetailsInteractor = () =>
  new AdminUpdateUserDetailsInteractor(
    getUserRepo(),
    getRoleRepo(),
    getEventService(),
    getSubscriptionService(),
    getCompanyRepo(),
    getUserRepo(),
    getReleaseOwnerRoutinesInteractor(),
  );

export const getGetUsersInteractor = () =>
  new GetUsersInteractor(getUserRepo(), getDataViewStateRepo(), "interactive", getQueryParamsPrecheck());

export const getGetUsersApiInteractor = () =>
  new GetUsersInteractor(getUserRepo(), getDataViewStateRepo(), "api", getQueryParamsPrecheck());

// --- Auth ---

export const getSignInWithEmailInteractor = () => new SignInWithEmailInteractor(getAuthService());

export const getSignUpWithEmailInteractor = () =>
  new SignUpWithEmailInteractor(getAuthService(), getOnboardingIntentService());

export const getRequestPasswordResetInteractor = () =>
  new RequestPasswordResetInteractor(getAuthService(), getOnboardingIntentService());

export const getResetPasswordInteractor = () =>
  new ResetPasswordInteractor(getAuthService(), getOnboardingIntentService());

export const getContinueWithSocialsInteractor = () =>
  new ContinueWithSocialsInteractor(getAuthService(), getUserRepo());

export const getResendVerificationEmailInteractor = () =>
  new ResendVerificationEmailInteractor(getAuthService(), getOnboardingIntentService());

export const getSignOutInteractor = () =>
  new SignOutInteractor(getAuthService(), getOnboardingIntentService(), getInviteTokenCookieRepo());

export const getDecideMcpConsentInteractor = () =>
  new DecideMcpConsentInteractor(getAuthService(), getRouteGuardService());

// --- Company ---

export const getGetCompanySettingsInteractor = () => new GetCompanySettingsInteractor(getCompanyRepo());

export const getUpdateCompanySettingsInteractor = () =>
  new UpdateCompanySettingsInteractor(getCompanyRepo(), getEventService());

export const getGetOrCreateInviteTokenInteractor = () => new GetOrCreateInviteTokenInteractor(getCompanyRepo());

export const getInviteUsersByEmailInteractor = () =>
  new InviteUsersByEmailInteractor(getEmailService(), getGetOrCreateInviteTokenInteractor());

export const getInviteTokenValidationInteractor = () => new InviteTokenValidationInteractor(getCompanyRepo());

export const getOpenInvitationInteractor = () =>
  new OpenInvitationInteractor(getInviteTokenValidationInteractor(), getAuthService(), getOnboardingIntentService());

export const getChooseWorkspaceOnboardingInteractor = () =>
  new ChooseWorkspaceOnboardingInteractor(
    getRouteGuardService(),
    getOnboardingIntentService(),
    getInviteTokenCookieRepo(),
  );

// --- Role ---

export const getRoleManagementService = () => {
  const records = getRecordRepo();
  return new RoleManagementService(
    getRoleRepo(),
    records,
    getRecordAccessPolicy(),
    new RecordConfigurationService(records),
    new RecordConfigurationWriter(records, new RecordCalculationService(records)),
    getEventService(),
  );
};
export const getGetRoleEditorInteractor = () => new GetRoleEditorInteractor(getRoleManagementService());

export const getUpsertRoleInteractor = () => new UpsertRoleInteractor(getRoleManagementService());

export const getGetRolesInteractor = () =>
  new GetRolesInteractor(getRoleRepo(), getDataViewStateRepo(), "interactive", getQueryParamsPrecheck());
export const getGetRolesApiInteractor = () =>
  new GetRolesInteractor(getRoleRepo(), getDataViewStateRepo(), "api", getQueryParamsPrecheck());

export const getDeleteRoleInteractor = () => new DeleteRoleInteractor(getRoleManagementService());

// --- Widget ---

export const getGetWidgetsInteractor = () => new GetWidgetsInteractor(getWidgetRepo());

export const getDeleteWidgetInteractor = () => new DeleteWidgetInteractor(getWidgetRepo(), getWidgetIdsValidator());

export const getUpdateWidgetLayoutsInteractor = () => new UpdateWidgetLayoutsInteractor(getWidgetRepo());

export const getGetCompanyWidgetsInteractor = () => new GetCompanyWidgetsInteractor(getWidgetRepo());

export const getGetWidgetByIdInteractor = () => new GetWidgetByIdInteractor(getWidgetRepo());

export const getGetWikiPagesInteractor = () => new GetWikiPagesInteractor(getWikiPageRepo());
export const getGetWikiCatalogInteractor = () => new GetWikiCatalogInteractor(getWikiPageRepo());
export const getSearchWikiPagesInteractor = () =>
  new SearchWikiPagesInteractor(getWikiPageRepo(), "stored", null, sharedWikiSearchOrders);
export const getSearchWikiKnowledgeInteractor = () =>
  new SearchWikiPagesInteractor(getWikiPageRepo(), "stored", getWikiSemanticRetrieval(), sharedWikiSearchOrders);
export const getSearchExternalizedWikiPagesInteractor = () =>
  new SearchWikiPagesInteractor(getWikiPageRepo(), "externalized", getWikiSemanticRetrieval(), sharedWikiSearchOrders);
export const getGetWikiPageInteractor = () => new GetWikiPageInteractor(getWikiPageRepo());
export const getCreateWikiPagesInteractor = () => new CreateWikiPagesInteractor(getWikiPageRepo(), getEventService());
export const getMoveWikiPageInteractor = () => new MoveWikiPageInteractor(getWikiPageRepo());
export const getUpdateWikiPageInteractor = () => new UpdateWikiPageInteractor(getWikiPageRepo(), getEventService());
export const getDeleteWikiPageInteractor = () => new DeleteWikiPageInteractor(getWikiPageRepo(), getEventService());
export const getWikiWebsiteCrawlRepo = (): PrismaWikiWebsiteCrawlRepo =>
  new PrismaWikiWebsiteCrawlRepo(getWikiPageRepo());
export const getFailWikiWebsiteCrawlInteractor = () => new FailWikiWebsiteCrawlInteractor(getWikiWebsiteCrawlRepo());
export const getStartWikiHomepageSetupInteractor = () =>
  new StartWikiHomepageSetupInteractor(getWikiPageRepo(), getWikiWebsiteCrawlRepo(), getBackgroundTaskService());
export const getGetWikiHomepageSetupStateInteractor = () =>
  new GetWikiHomepageSetupStateInteractor(getWikiPageRepo(), getWikiWebsiteCrawlRepo());
export const getWikiWebsiteCrawlService = () =>
  new WikiWebsiteCrawlService(
    getWikiWebsiteCrawlRepo(),
    getCreateWikiPagesInteractor(),
    getUpdateWikiPageInteractor(),
    wikiWebsiteNetwork(),
  );
export const getWikiWebsiteSynthesisService = () =>
  new WikiWebsiteSynthesisService(getWikiWebsiteCrawlRepo(), getAgentUsageService(), getCreateWikiPagesInteractor());

// --- Webhook ---

export const getGetWebhooksInteractor = () =>
  new GetWebhooksInteractor(getWebhookRepo(), getDataViewStateRepo(), "interactive", getQueryParamsPrecheck());
export const getGetWebhooksApiInteractor = () =>
  new GetWebhooksInteractor(getWebhookRepo(), getDataViewStateRepo(), "api", getQueryParamsPrecheck());

export const getUpsertWebhookInteractor = () =>
  new UpsertWebhookInteractor(getWebhookRepo(), getEventService(), getWebhookIdsValidator());

export const getGetWebhookByIdInteractor = () => new GetWebhookByIdInteractor(getWebhookRepo());

export const getDeleteWebhookInteractor = () =>
  new DeleteWebhookInteractor(getWebhookRepo(), getEventService(), getWebhookIdsValidator());

export const getGetWebhookDeliveriesInteractor = () =>
  new GetWebhookDeliveriesInteractor(
    getWebhookDeliveryRepo(),
    getDataViewStateRepo(),
    "interactive",
    getQueryParamsPrecheck(),
  );
export const getGetWebhookDeliveriesApiInteractor = () =>
  new GetWebhookDeliveriesInteractor(getWebhookDeliveryRepo(), getDataViewStateRepo(), "api", getQueryParamsPrecheck());

export const getResendWebhookDeliveryInteractor = () =>
  new ResendWebhookDeliveryInteractor(
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

export const getCountChannelsNeedingActionInteractor = () =>
  new CountChannelsNeedingActionInteractor(getConnectedAccountRepo());

export const getGetMyConnectedAccountsApiInteractor = () =>
  new GetMyConnectedAccountsApiInteractor(getConnectedAccountRepo());

export const getGetMyConnectedAccountsContextInteractor = () =>
  new GetMyConnectedAccountsContextInteractor(getConnectedAccountRepo());

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
  new ReconnectConnectedAccountInteractor(getConnectedAccountRepo(), getMessagingService(), getEntitlementService());

export const getDeleteAccountsForPlanInteractor = () =>
  new DeleteAccountsForPlanInteractor(
    getConnectedAccountRepo(),
    getUserRepo(),
    getDeleteAccountForBillingService(),
    getEmailService(),
  );

export const getResyncThreadInteractor = () =>
  new ResyncThreadInteractor(getMessagingRepo(), getMessagingService(), getEntitlementService());

export const getMoveEmailThreadInteractor = () =>
  new MoveEmailThreadInteractor(
    getMessagingRepo(),
    getConnectedAccountRepo(),
    getMessagingService(),
    getEntitlementService(),
  );

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
export const getGetCalendarsInteractor = () =>
  new GetCalendarsInteractor(
    getCalendarRepo(),
    getDataViewStateRepo(),
    "interactive",
    getQueryParamsPrecheck(),
    getEntitlementService(),
  );
export const getGetCalendarsApiInteractor = () =>
  new GetCalendarsInteractor(
    getCalendarRepo(),
    getDataViewStateRepo(),
    "api",
    getQueryParamsPrecheck(),
    getEntitlementService(),
  );
export const getGetCalendarByIdInteractor = () =>
  new GetCalendarByIdInteractor(getCalendarRepo(), getEntitlementService());
export const getGetCalendarEventsApiInteractor = () =>
  new GetCalendarEventsInteractor(
    getCalendarEventsRepo(),
    getDataViewStateRepo(),
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
    getEventService(),
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
    "message.reaction.delete": ignoreEvent,
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
    "account.locked": ignoreEvent,
    "account.unlocked": ignoreEvent,
    "account.initial_sync.running": ignoreEvent,
    "account.initial_sync.failed": ignoreEvent,
    "account.initial_sync.completed": getProcessAccountReadyWebhookInteractor(),
    "account.reconnect": getProcessAccountReconnectWebhookInteractor(),
    "account.remove": getProcessAccountRemoveWebhookInteractor(),
    "account.status.disconnected": accountStatus,
    "account.status.errored": accountStatus,
    "account.status.running": accountStatus,
    "account.status.degraded": accountStatus,
    "account.status.partial": accountStatus,
    "chat.update": getProcessChatUpdateWebhookInteractor(),
    "chat.delete": getProcessChatDeleteWebhookInteractor(),
    "calendar.create": calendarUpsert,
    "calendar.update": calendarUpsert,
    "calendar.delete": getProcessCalendarDeleteWebhookInteractor(),
    "calendar.event.new": calendarEventUpsert,
    "calendar.event.update": calendarEventUpsert,
    "calendar.event.delete": getProcessCalendarEventDeleteWebhookInteractor(),
    "relation.new": relation,
    "follower.new": ignoreEvent,
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

export const getSetConnectedAccountSignatureInteractor = () =>
  new SetConnectedAccountSignatureInteractor(getConnectedAccountRepo(), getEntitlementService());

export const getSaveDraftInteractor = () =>
  new SaveDraftInteractor(getMessagingRepo(), getConnectedAccountRepo(), getEntitlementService());

export const getSaveNewThreadDraftInteractor = () => new SaveNewThreadDraftInteractor(getSaveDraftInteractor());

export const getSaveReplyDraftInteractor = () => new SaveReplyDraftInteractor(getSaveDraftInteractor());

export const getDiscardDraftInteractor = () => new DiscardDraftInteractor(getMessagingRepo(), getEntitlementService());

export const getStartChatInteractor = () =>
  new StartChatInteractor(
    getConnectedAccountRepo(),
    new StartChatRecordChannelRepo(getRecordRepo(), getRecordAccessPolicy(), getMutateRecordInteractor()),
    getMessagingService(),
    getMessagingRepo(),
    getEntitlementService(),
  );

export const getResolveProviderProfileInteractor = () =>
  new ResolveProviderProfileInteractor(getConnectedAccountRepo(), getMessagingService(), getEntitlementService());

export const getGetMessagingThreadsInteractor = () =>
  new GetMessagingThreadsInteractor(
    getMessagingRepo(),
    getDataViewStateRepo(),
    "interactive",
    getQueryParamsPrecheck(),
    getEntitlementService(),
  );
export const getGetMessagingThreadsApiInteractor = () =>
  new GetMessagingThreadsInteractor(
    getMessagingRepo(),
    getDataViewStateRepo(),
    "api",
    getQueryParamsPrecheck(),
    getEntitlementService(),
  );

export const getReadThreadRecordsInteractor = () =>
  new ReadThreadRecordsInteractor(
    new PrismaThreadRecordsRepo(),
    getRecordRepo(),
    getRecordAccessPolicy(),
    getEntitlementService(),
  );

export const getMutateThreadRecordsInteractor = () =>
  new MutateThreadRecordsInteractor(
    new PrismaThreadRecordsRepo(),
    getRecordRepo(),
    getRecordAccessPolicy(),
    getEntitlementService(),
  );

export const getGetMessagingThreadInteractor = () =>
  new GetMessagingThreadInteractor(getMessagingRepo(), getConnectedAccountRepo(), getEntitlementService());

export const getGetMessagingFilterOptionsInteractor = () =>
  new GetMessagingFilterOptionsInteractor(getConnectedAccountRepo(), getEntitlementService());

export const getGetMessageAttachmentInteractor = () =>
  new GetMessageAttachmentInteractor(getMessagingRepo(), getMessagingService(), getEntitlementService());

export const getGetUnreadThreadCountInteractor = () =>
  new GetUnreadThreadCountInteractor(getMessagingRepo(), getEntitlementService());

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

// --- Search ---

export const getSearchRecordsInteractor = () => new SearchRecordsInteractor(getRecordRepo(), getRecordAccessPolicy());
export const getResolveRecordSearchInteractor = () =>
  new ResolveRecordSearchInteractor(getRecordRepo(), getRecordAccessPolicy());

// --- P13n ---

export const getUpsertP13nInteractor = () => new UpsertP13nInteractor(getP13nRepo());

export const getGetP13nInteractor = () => new GetP13nInteractor(getP13nRepo());

// --- Data views ---

export const getRecordViewPolicy = () =>
  new RecordViewPolicy(getRecordRepo(), getRecordAccessPolicy(), getCompanyRepo());

export const getGetDataViewsInteractor = () => new GetDataViewsInteractor(getDataViewRepo(), getRecordViewPolicy());

export const getUpsertDataViewInteractor = () =>
  new UpsertDataViewInteractor(getDataViewRepo(), getP13nRepo(), getRecordViewPolicy());

export const getDeleteDataViewInteractor = () =>
  new DeleteDataViewInteractor(getDataViewRepo(), getP13nRepo(), getRecordViewPolicy());

export const getSaveDataViewStateInteractor = () =>
  new SaveDataViewStateInteractor(getDataViewRepo(), getP13nRepo(), getRecordViewPolicy());

export const getSelectDataViewInteractor = () =>
  new SelectDataViewInteractor(getDataViewRepo(), getP13nRepo(), getRecordViewPolicy());

export const getResetDataViewStateInteractor = () =>
  new ResetDataViewStateInteractor(getDataViewRepo(), getRecordViewPolicy());

// --- Feedback ---

export const getFeedbackCreator = () => new FeedbackCreator(getEmailService());

export const getSendFeedbackInteractor = () => new SendFeedbackInteractor(getFeedbackCreator());

// --- Contact ---

export const getSendContactInquiryInteractor = () => new SendContactInquiryInteractor(getEmailService());

// --- API Key ---

export const getCreateApiKeyInteractor = () => new CreateApiKeyInteractor(getAuthService());

export const getGetApiKeysInteractor = () => new GetApiKeysInteractor(getAuthService());

export const getDeleteApiKeyInteractor = () => new DeleteApiKeyInteractor(getAuthService());

// --- EE Subscription ---

export const getCreateCheckoutSessionInteractor = () =>
  new CreateCheckoutSessionInteractor(getSubscriptionService(), getCompanyRepo(), getUserRepo());

export const getGetSubscriptionInteractor = () => new GetSubscriptionInteractor(getCompanyRepo(), getUserRepo());

export const getGetBillingPortalUrlInteractor = () =>
  new GetBillingPortalUrlInteractor(getCompanyRepo(), getSubscriptionService());

export const getRefreshSubscriptionInteractor = () =>
  new RefreshSubscriptionInteractor(getCompanyRepo(), getSubscriptionService(), getDeleteAccountsForPlanInteractor());

// --- Audit log ---

// --- EE Lifecycle (workflow cron) ---

export const getSendWelcomeAndDemoInteractor = () => new SendWelcomeAndDemoInteractor(getUserRepo(), getEmailService());

export const getSendTrialExtensionOfferInteractor = () =>
  new SendTrialExtensionOfferInteractor(getUserRepo(), getEmailService());

export const getSendTrialInactivationReminderInteractor = () =>
  new SendTrialInactivationReminderInteractor(getUserRepo(), getEmailService());

export const getDeactivateTrialUsersAndSendNoticeInteractor = () =>
  new DeactivateTrialUsersAndSendNoticeInteractor(
    getUserRepo(),
    getEmailService(),
    getReleaseOwnerRoutinesInteractor(),
  );

export const getDeactivateUsersAfterSubscriptionGracePeriodInteractor = () =>
  new DeactivateUsersAfterSubscriptionGracePeriodInteractor(
    getUserRepo(),
    getEmailService(),
    getReleaseOwnerRoutinesInteractor(),
  );

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
  new SendLegalDocumentNoticesInteractor(getUserRepo(), getEventLogRepo(), getEmailService(), getEventService());

export const getExpireAdAttributionInteractor = () => new ExpireAdAttributionInteractor(getUserRepo());

// --- Legal ---

export const getGetLegalStatusInteractor = () => new GetLegalStatusInteractor(getEventLogRepo());

export const getAcceptLegalDocumentsInteractor = () =>
  new AcceptLegalDocumentsInteractor(getEventLogRepo(), getEventService());

// --- Webhook delivery (workflow task) ---

export const getDeliverWebhookInteractor = () =>
  new DeliverWebhookInteractor(
    new PrismaWebhookDeliveryQueueRepo(),
    getRecordRecipientReader(),
    new WebhookTransport(),
  );

export const getCreateSupportTicketInteractor = () => new CreateSupportTicketInteractor(getFeedbackCreator());

export const getAgentUsageService = () => new AgentUsageService(getAgentChatRepo());
export const getReconcileRetrievalReservationsInteractor = () =>
  new ReconcileRetrievalReservationsInteractor(getAgentUsageService());

export const getSendAgentMessageInteractor = () =>
  new SendAgentMessageInteractor(
    getAgentChatRepo(),
    getAgentUsageService(),
    getEntitlementService(),
    getBackgroundTaskService(),
    getDiscoverRecordTypesInteractor(),
    getGetWikiCatalogInteractor(),
    getUserService(),
    getWikiWebsiteCrawlRepo(),
  );

export const getGetRoutinesInteractor = () =>
  new GetRoutinesInteractor(getRoutineRepo(), getDataViewStateRepo(), "interactive", getQueryParamsPrecheck());

export const getGetRoutinesApiInteractor = () =>
  new GetRoutinesInteractor(getRoutineRepo(), getDataViewStateRepo(), "api", getQueryParamsPrecheck());

export const getGetRoutineRunsInteractor = () => new GetRoutineRunsInteractor(getRoutineRepo());

export const getUpsertRoutineInteractor = () =>
  new UpsertRoutineInteractor(getRoutineRepo(), getCompanyRepo(), getEventService());

export const getDeleteRoutineInteractor = () => new DeleteRoutineInteractor(getRoutineRepo(), getEventService());

export const getPauseRoutineInteractor = () => new PauseRoutineInteractor(getRoutineRepo(), getEventService());

export const getRunRoutineNowInteractor = () =>
  new RunRoutineNowInteractor(getRoutineRepo(), getBackgroundTaskService());

export const getStartRoutineRunInteractor = () =>
  new StartRoutineRunInteractor(
    getRoutineRepo(),
    getAgentChatRepo(),
    getSendAgentMessageInteractor(),
    getRoutineEventAccess(),
  );

export const getFailRoutineRunInteractor = () => new FailRoutineRunInteractor(getRoutineRepo());

export const getSweepDueRoutinesInteractor = () =>
  new SweepDueRoutinesInteractor(getRoutineRepo(), getBackgroundTaskService());

export const getReconcileRoutineRunsInteractor = () => new ReconcileRoutineRunsInteractor(getRoutineRepo());

export const getReleaseOwnerRoutinesInteractor = () =>
  new ReleaseOwnerRoutinesInteractor(getRoutineRepo(), getReconcileRoutineRunsInteractor());

export const getPruneRoutineRunsInteractor = () => new PruneRoutineRunsInteractor(getRoutineRepo());

export const getGetAgentConfigInteractor = () =>
  new GetAgentConfigInteractor(
    getAgentChatRepo(),
    getAgentUsageService(),
    getEntitlementService(),
    new RecordSuggestionSignals(getRecordRepo(), getRecordAccessPolicy()),
  );

export const getRespondToApprovalInteractor = () =>
  new RespondToApprovalInteractor(getAgentChatRepo(), getEntitlementService(), getBackgroundTaskService());

export const getRespondToUiCommandInteractor = () =>
  new RespondToUiCommandInteractor(getAgentChatRepo(), getEntitlementService(), getBackgroundTaskService());

export const getCancelAgentTurnInteractor = () =>
  new CancelAgentTurnInteractor(getAgentChatRepo(), getEntitlementService(), getBackgroundTaskService());

export const getGetAgentRunStreamInteractor = () =>
  new GetAgentRunStreamInteractor(getAgentChatRepo(), getEntitlementService());

export const getGetAgentConversationInteractor = () =>
  new GetAgentConversationInteractor(getAgentChatRepo(), getEntitlementService());

export const getListAgentConversationsInteractor = () =>
  new ListAgentConversationsInteractor(getAgentChatRepo(), getEntitlementService());

export const getDeleteAgentConversationInteractor = () =>
  new DeleteAgentConversationInteractor(getAgentChatRepo(), getEntitlementService());

export const getArchiveAgentConversationInteractor = () =>
  new ArchiveAgentConversationInteractor(getAgentChatRepo(), getEntitlementService());

export const getRestoreAgentConversationInteractor = () =>
  new RestoreAgentConversationInteractor(getAgentChatRepo(), getEntitlementService());

export const getCreateChatSupportTicketInteractor = () =>
  new CreateChatSupportTicketInteractor(getAgentChatRepo(), getFeedbackCreator());

// --- Hosted-AI operator console ---

export const getGetOperatorConsoleVisibilityInteractor = () =>
  new GetOperatorConsoleVisibilityInteractor(getOperatorAccessService());

export const getGetHostedAiOperatorOverviewInteractor = () =>
  new GetHostedAiOperatorOverviewInteractor(getOperatorRepo());

export const getUpdateHostedAiEnterpriseAllowanceInteractor = () =>
  new UpdateHostedAiEnterpriseAllowanceInteractor(getOperatorRepo());

export const getDeleteOperatorWorkspaceInteractor = () => new DeleteOperatorWorkspaceInteractor(getOperatorRepo());

export const getUpdateOperatorSubscriptionTermsInteractor = () =>
  new UpdateOperatorSubscriptionTermsInteractor(getOperatorRepo());

export const getGetOperatorWorkspaceStatsInteractor = () => new GetOperatorWorkspaceStatsInteractor(getOperatorRepo());

export const getUpdateOperatorWorkspaceTagsInteractor = () =>
  new UpdateOperatorWorkspaceTagsInteractor(getOperatorRepo());

export const getGetOperatorWorkspaceTagsInteractor = () => new GetOperatorWorkspaceTagsInteractor(getOperatorRepo());

export const getCreateAgentCreditAdjustmentInteractor = () =>
  new CreateAgentCreditAdjustmentInteractor(getOperatorRepo());

export const getGetOperatorUserSummaryInteractor = () => new GetOperatorUserSummaryInteractor(getOperatorRepo());

export const getGetOperatorUserDetailInteractor = () => new GetOperatorUserDetailInteractor(getOperatorRepo());

export const getUpdateOperatorUserStatusInteractor = () =>
  new UpdateOperatorUserStatusInteractor(getOperatorRepo(), getReleaseOwnerRoutinesInteractor());

export const getOperatorUsersRepo = () => new PrismaOperatorUsersRepo(getAgentChatRepo());

export const getGetOperatorUsersInteractor = () =>
  new GetOperatorUsersInteractor(getOperatorUsersRepo(), getDataViewStateRepo());

export const getOperatorWorkspacesRepo = () => new PrismaOperatorWorkspacesRepo();

export const getGetOperatorWorkspacesInteractor = () =>
  new GetOperatorWorkspacesInteractor(getOperatorWorkspacesRepo(), getDataViewStateRepo());

export const getOperatorAuditRepo = () => new PrismaOperatorAuditRepo();

export const getGetOperatorAuditLogsInteractor = () =>
  new GetOperatorAuditLogsInteractor(getOperatorAuditRepo(), getDataViewStateRepo());

export const getOperatorRiskSummaryRepo = () => new PrismaOperatorRiskSummaryRepo();

export const getGetOperatorRiskSummaryInteractor = () =>
  new GetOperatorRiskSummaryInteractor(getOperatorRiskSummaryRepo());

export const getAdConversionExportRepo = () => new PrismaAdConversionExportRepo();

export const getGetAdConversionExportInteractor = () =>
  new GetAdConversionExportInteractor(getAdConversionExportRepo());

export const getUpdateOperatorUserPlatformAccessInteractor = () =>
  new UpdateOperatorUserPlatformAccessInteractor(getOperatorRepo());

export const getCorrectOperatorSubscriptionSnapshotInteractor = () =>
  new CorrectOperatorSubscriptionSnapshotInteractor(getOperatorRepo());

export const getResetOperatorUserCreditsInteractor = () => new ResetOperatorUserCreditsInteractor(getOperatorRepo());

export const getGetRecordPresentationInteractor = () =>
  new GetRecordPresentationInteractor(
    getRecordRepo(),
    getRecordAccessPolicy(),
    getDataViewRepo(),
    getQueryRecordsInteractor(),
    getCompanyRepo(),
  );

export const getRecordWidgetRepo = () => new PrismaRecordWidgetRepo();
export const getRecordWidgetReader = () =>
  new RecordWidgetReader(getRecordRepo(), getQueryRecordMeasureInteractor(), getUserRepo());
export const getPreviewRecordWidgetInteractor = () => new PreviewRecordWidgetInteractor(getRecordWidgetReader());
export const getGetWidgetGalleryInteractor = () =>
  new GetWidgetGalleryInteractor(getRecordRepo(), getRecordAccessPolicy());
export const getUpsertRecordWidgetInteractor = () =>
  new UpsertRecordWidgetInteractor(
    getRecordWidgetRepo(),
    getRecordRepo(),
    getRecordAccessPolicy(),
    getQueryRecordMeasureInteractor(),
    getRecordWidgetReader(),
  );

export const getGetRecordWidgetInteractor = () =>
  new GetRecordWidgetInteractor(
    getRecordWidgetRepo(),
    getRecordWidgetReader(),
    getRecordAccessPolicy(),
    getRecordActivityWidgetRepo(),
    getRecordActivityWidgetReader(),
  );
export const getGetRecordWidgetsInteractor = () =>
  new GetRecordWidgetsInteractor(
    getRecordWidgetRepo(),
    getRecordWidgetReader(),
    getRecordAccessPolicy(),
    getRecordActivityWidgetRepo(),
    getRecordActivityWidgetReader(),
  );

export const getRecordActivityWidgetRepo = () => new PrismaRecordActivityWidgetRepo();
export const getRecordActivityWidgetReader = () =>
  new RecordActivityWidgetReader(getRecordRepo(), getGetRecordActivitiesInteractor());
export const getUpsertRecordActivityWidgetInteractor = () =>
  new UpsertRecordActivityWidgetInteractor(
    getRecordActivityWidgetRepo(),
    getRecordRepo(),
    getRecordAccessPolicy(),
    getGetRecordActivitiesInteractor(),
    getRecordActivityWidgetReader(),
  );

export const getManageDataViewsInteractor = () =>
  new ManageDataViewsInteractor(
    {
      [SURFACE.users]: getUserRepo(),
      [SURFACE.roles]: getRoleRepo(),
      [SURFACE.webhooks]: getWebhookRepo(),
      [SURFACE.webhookDeliveries]: getWebhookDeliveryRepo(),
      [SURFACE.messagingThreads]: getMessagingRepo(),
      [SURFACE.routines]: getRoutineRepo(),
    },
    getDataViewStateRepo(),
    getUpsertDataViewInteractor(),
    getSaveDataViewStateInteractor(),
    getSelectDataViewInteractor(),
    getDeleteDataViewInteractor(),
    getQueryParamsPrecheck(),
    getEntitlementService(),
    getRecordViewPolicy(),
    getResetDataViewStateInteractor(),
  );
import { MutateThreadRecordsInteractor } from "@/ee/messaging/thread-records/thread-records.interactor";
import { ReadThreadRecordsInteractor } from "@/ee/messaging/thread-records/read-thread-records.interactor";
import { PrismaThreadRecordsRepo } from "@/ee/messaging/thread-records/prisma-thread-records.repository";
