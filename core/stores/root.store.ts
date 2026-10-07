import type { AppMode } from "@/core/config/environment";
import type { BaseModalStore } from "../base/base-modal.store";

import { AuditLogModalStore } from "@/app/[locale]/(protected)/company/components/audit-log/audit-log-modal.store";
import { AuditLogsStore } from "@/app/[locale]/(protected)/company/components/audit-log/audit-logs.store";
import { CompanyInviteModalStore } from "@/app/[locale]/(protected)/company/components/company-invite/company-invite-modal.store";
import { InviteByEmailStore } from "@/app/[locale]/(protected)/company/components/company-invite/invite-by-email.store";
import { SidebarLayoutStore } from "@/app/components/navigation/sidebar-layout.store";
import { FeedbackModalStore } from "@/app/[locale]/(protected)/company/components/feedback/feedback-modal.store";
import { RoleModalStore } from "@/app/[locale]/(protected)/company/components/role/role-modal.store";
import { RolesStore } from "@/app/[locale]/(protected)/company/components/role/roles.store";
import { SubscriptionStore } from "@/app/[locale]/(protected)/company/components/subscription/subscription.store";
import { UserModalStore } from "@/app/[locale]/(protected)/company/components/user/user-modal.store";
import { UsersStore } from "@/app/[locale]/(protected)/company/components/user/users.store";
import { WebhookDeliveriesStore } from "@/app/[locale]/(protected)/company/components/webhook/webhook-deliveries.store";
import { WebhookDeliveryModalStore } from "@/app/[locale]/(protected)/company/components/webhook/webhook-delivery-modal.store";
import { WebhookModalStore } from "@/app/[locale]/(protected)/company/components/webhook/webhook-modal.store";
import { WebhooksStore } from "@/app/[locale]/(protected)/company/components/webhook/webhooks.store";
import { WidgetModalStore } from "@/app/[locale]/(protected)/dashboard/components/widget-modal.store";
import { WidgetsStore } from "@/app/[locale]/(protected)/dashboard/components/widgets.store";
import { MessagingThreadDetailStore } from "@/app/[locale]/(protected)/inbox/components/messaging-thread-detail.store";
import { MessagingThreadsStore } from "@/app/[locale]/(protected)/inbox/components/messaging-threads.store";
import { ThreadComposeStore } from "@/app/[locale]/(protected)/inbox/components/thread-compose.store";
import { ThreadParticipantsStore } from "@/app/[locale]/(protected)/inbox/components/thread-participants.store";
import { LegalUpdateStore } from "@/app/[locale]/(protected)/legal-update/components/legal-update.store";
import { OnboardingWizardStore } from "@/app/[locale]/(protected)/onboarding/wizard/components/onboarding-wizard.store";
import { StepProfileStore } from "@/app/[locale]/(protected)/onboarding/wizard/components/step-profile.store";
import { OperatorAuditStore } from "@/app/[locale]/(protected)/operator/components/audit/operator-audit.store";
import { OperatorUsersStore } from "@/app/[locale]/(protected)/operator/components/users/operator-users.store";
import { OperatorWorkspacesStore } from "@/app/[locale]/(protected)/operator/components/workspaces/operator-workspaces.store";
import { ApiKeyModalStore } from "@/app/[locale]/(protected)/profile/components/api-key-modal.store";
import { ApiKeysStore } from "@/app/[locale]/(protected)/profile/components/api-keys.store";
import { ConnectUpsellModalStore } from "@/app/[locale]/(protected)/profile/components/connect-upsell-modal.store";
import { ConnectedAccountModalStore } from "@/app/[locale]/(protected)/profile/components/connected-account-modal.store";
import { ConnectedAccountsStore } from "@/app/[locale]/(protected)/profile/components/connected-accounts.store";
import { ProfileSettingsStore } from "@/app/[locale]/(protected)/profile/components/profile-settings.store";
import { UserStore } from "@/app/[locale]/(protected)/profile/components/user.store";
import { RoutineModalStore } from "@/app/[locale]/(protected)/routines/components/routine-modal.store";
import { RoutinesStore } from "@/app/[locale]/(protected)/routines/components/routines.store";
import { SubscriptionExpiredStore } from "@/app/[locale]/(protected)/subscription-expired/components/subscription-expired.store";
import { ErrorTestStore } from "@/app/[locale]/(protected)/test/error/error-test.store";
import { ForgotPasswordStore } from "@/app/[locale]/(public)/auth/forgot-password/forgot-password.store";
import { McpConsentStore } from "@/app/[locale]/(public)/auth/mcp-consent/mcp-consent.store";
import { ResetPasswordStore } from "@/app/[locale]/(public)/auth/reset-password/reset-password.store";
import { SignInStore } from "@/app/[locale]/(public)/auth/signin/sign-in.store";
import { SignUpStore } from "@/app/[locale]/(public)/auth/signup/sign-up.store";
import { VerifyEmailStore } from "@/app/[locale]/(public)/auth/verify-email/verify-email.store";
import { GlobalSearchModalStore } from "@/app/components/global-search-modal.store";
import { AiConnectionStore } from "@/components/ai-connection/ai-connection.store";
import { FilterPaletteStore } from "@/components/data-view/filter-palette/filter-palette.store";
import { LayoutStore } from "@/components/layout/layout.store";
import { DeleteConfirmationModalStore } from "@/components/modal/delete-confirmation-modal.store";
import { LoadingOverlayStore } from "@/components/shared/loading-overlay.store";
import { IntlStore } from "@/core/stores/intl.store";
import { LocaleStore } from "@/core/stores/locale.store";
import { TimelineDetailModalStore } from "@/features/messaging/activities/activities-detail-modal.store";
import { RecordWorkspaceStore } from "./record-workspace.store";
import { WikiPageStore } from "@/app/[locale]/(protected)/wiki/components/wiki-page.store";

import { AgentChatStore } from "@/app/components/agent-chat/agent-chat.store";
import { AgentUiControlStore } from "@/app/components/agent-chat/ui-control.store";
import { NavigationGuardController } from "./navigation-guard.controller";

export class RootStore {
  private readonly modalStores = new Set<BaseModalStore<any>>();
  public readonly navigationGuard = new NavigationGuardController();

  private _apiKeysStore?: ApiKeysStore;
  private _connectedAccountsStore?: ConnectedAccountsStore;
  private _connectedAccountModalStore?: ConnectedAccountModalStore;
  private _connectUpsellModalStore?: ConnectUpsellModalStore;
  private _messagingThreadsStore?: MessagingThreadsStore;
  private _messagingThreadDetailStore?: MessagingThreadDetailStore;
  private _threadComposeStore?: ThreadComposeStore;
  private _threadParticipantsStore?: ThreadParticipantsStore;
  private _intlStore?: IntlStore;
  private _layoutStore?: LayoutStore;
  private _loadingOverlayStore?: LoadingOverlayStore;
  private _localeStore?: LocaleStore;
  private _rolesStore?: RolesStore;
  private _userStore?: UserStore;
  private _usersStore?: UsersStore;
  private _webhookDeliveriesStore?: WebhookDeliveriesStore;
  private _webhooksStore?: WebhooksStore;
  private _routinesStore?: RoutinesStore;
  private _widgetsGridStore?: WidgetsStore;
  private _auditLogsStore?: AuditLogsStore;
  private _operatorUsersStore?: OperatorUsersStore;
  private _operatorAuditStore?: OperatorAuditStore;
  private _operatorWorkspacesStore?: OperatorWorkspacesStore;
  private _sidebarLayoutStore?: SidebarLayoutStore;
  private _forgotPasswordStore?: ForgotPasswordStore;
  private _verifyEmailStore?: VerifyEmailStore;
  private _mcpConsentStore?: McpConsentStore;
  private _inviteByEmailStore?: InviteByEmailStore;
  private _stepAiStore?: AiConnectionStore;
  private _stepProfileStore?: StepProfileStore;
  private _onboardingWizardStore?: OnboardingWizardStore;
  private _resetPasswordStore?: ResetPasswordStore;
  private _errorTestStore?: ErrorTestStore;
  private _wikiPageStore?: WikiPageStore;
  private _signInStore?: SignInStore;
  private _signUpStore?: SignUpStore;
  private _subscriptionStore?: SubscriptionStore;
  private _subscriptionExpiredStore?: SubscriptionExpiredStore;
  private _legalUpdateStore?: LegalUpdateStore;
  private _profileSettingsStore?: ProfileSettingsStore;

  private _companyInviteModalStore?: CompanyInviteModalStore;
  private _createApiKeyModalStore?: ApiKeyModalStore;
  private _deleteConfirmationModalStore?: DeleteConfirmationModalStore;
  private _globalSearchModalStore?: GlobalSearchModalStore;
  private _recordWorkspaceStore?: RecordWorkspaceStore;
  private _roleModalStore?: RoleModalStore;
  private _userModalStore?: UserModalStore;
  private _webhookDeliveryModalStore?: WebhookDeliveryModalStore;
  private _webhookModalStore?: WebhookModalStore;
  private _routineModalStore?: RoutineModalStore;
  private _routineRunChatStore?: AgentChatStore;
  private _widgetModalStore?: WidgetModalStore;
  private _auditLogModalStore?: AuditLogModalStore;
  private _feedbackModalStore?: FeedbackModalStore;
  private _timelineDetailModalStore?: TimelineDetailModalStore;
  private _filterPaletteStore?: FilterPaletteStore;
  private _agentChatStore?: AgentChatStore;
  private _agentUiControlStore?: AgentUiControlStore;

  readonly appMode: AppMode;
  readonly agentChatEnabled: boolean;

  constructor(appMode: AppMode, agentChatEnabled: boolean) {
    this.appMode = appMode;
    this.agentChatEnabled = agentChatEnabled;
  }

  get layoutStore() {
    return (this._layoutStore ??= new LayoutStore());
  }

  get wikiPageStore() {
    return (this._wikiPageStore ??= new WikiPageStore(this, null));
  }

  get userStore() {
    return (this._userStore ??= new UserStore(this));
  }

  get loadingOverlayStore() {
    return (this._loadingOverlayStore ??= new LoadingOverlayStore());
  }

  get intlStore() {
    return (this._intlStore ??= new IntlStore(this));
  }

  get localeStore() {
    return (this._localeStore ??= new LocaleStore(this));
  }

  get usersStore() {
    return (this._usersStore ??= new UsersStore(this));
  }

  get rolesStore() {
    return (this._rolesStore ??= new RolesStore(this));
  }

  get messagingThreadsStore() {
    return (this._messagingThreadsStore ??= new MessagingThreadsStore(this));
  }

  get messagingThreadDetailStore() {
    return (this._messagingThreadDetailStore ??= new MessagingThreadDetailStore(this));
  }

  get threadComposeStore() {
    return (this._threadComposeStore ??= new ThreadComposeStore(this));
  }

  get threadParticipantsStore() {
    return (this._threadParticipantsStore ??= new ThreadParticipantsStore(this));
  }

  get filterPaletteStore() {
    return (this._filterPaletteStore ??= new FilterPaletteStore(this));
  }

  get widgetsStore() {
    return (this._widgetsGridStore ??= new WidgetsStore(this));
  }

  get profileSettingsStore() {
    return (this._profileSettingsStore ??= new ProfileSettingsStore(this));
  }

  get apiKeyModalStore() {
    return (this._createApiKeyModalStore ??= new ApiKeyModalStore(this));
  }

  get apiKeysStore() {
    return (this._apiKeysStore ??= new ApiKeysStore(this));
  }

  get connectedAccountsStore() {
    return (this._connectedAccountsStore ??= new ConnectedAccountsStore(this));
  }

  get connectedAccountModalStore() {
    return (this._connectedAccountModalStore ??= new ConnectedAccountModalStore(this));
  }

  get connectUpsellModalStore() {
    return (this._connectUpsellModalStore ??= new ConnectUpsellModalStore(this));
  }

  get stepProfileStore() {
    return (this._stepProfileStore ??= new StepProfileStore(this));
  }

  get stepAiStore() {
    return (this._stepAiStore ??= new AiConnectionStore(this));
  }

  get inviteByEmailStore() {
    return (this._inviteByEmailStore ??= new InviteByEmailStore(this));
  }

  get verifyEmailStore() {
    return (this._verifyEmailStore ??= new VerifyEmailStore(this));
  }

  get mcpConsentStore() {
    return (this._mcpConsentStore ??= new McpConsentStore(this));
  }

  get onboardingWizardStore() {
    return (this._onboardingWizardStore ??= new OnboardingWizardStore(this));
  }

  get errorTestStore() {
    return (this._errorTestStore ??= new ErrorTestStore(this));
  }

  get agentChatStore() {
    return (this._agentChatStore ??= new AgentChatStore(this));
  }

  get agentUiControlStore() {
    return (this._agentUiControlStore ??= new AgentUiControlStore(this));
  }

  get signInStore() {
    return (this._signInStore ??= new SignInStore(this));
  }

  get signUpStore() {
    return (this._signUpStore ??= new SignUpStore(this));
  }

  get sidebarLayoutStore() {
    return (this._sidebarLayoutStore ??= new SidebarLayoutStore(this));
  }

  get forgotPasswordStore() {
    return (this._forgotPasswordStore ??= new ForgotPasswordStore(this));
  }

  get resetPasswordStore() {
    return (this._resetPasswordStore ??= new ResetPasswordStore(this));
  }

  get subscriptionStore() {
    return (this._subscriptionStore ??= new SubscriptionStore(this));
  }

  get subscriptionExpiredStore() {
    return (this._subscriptionExpiredStore ??= new SubscriptionExpiredStore(this));
  }

  get legalUpdateStore() {
    return (this._legalUpdateStore ??= new LegalUpdateStore(this));
  }

  get userModalStore() {
    return (this._userModalStore ??= new UserModalStore(this));
  }

  get companyInviteModalStore() {
    return (this._companyInviteModalStore ??= new CompanyInviteModalStore(this));
  }

  get roleModalStore() {
    return (this._roleModalStore ??= new RoleModalStore(this));
  }

  get deleteConfirmationModalStore() {
    return (this._deleteConfirmationModalStore ??= new DeleteConfirmationModalStore(this));
  }

  get widgetModalStore() {
    return (this._widgetModalStore ??= new WidgetModalStore(this));
  }

  get globalSearchModalStore() {
    return (this._globalSearchModalStore ??= new GlobalSearchModalStore(this));
  }
  get recordWorkspaceStore() {
    return (this._recordWorkspaceStore ??= new RecordWorkspaceStore(this));
  }

  get routineModalStore() {
    return (this._routineModalStore ??= new RoutineModalStore(this));
  }

  get routineRunChatStore() {
    return (this._routineRunChatStore ??= new AgentChatStore(this, {
      persistOpenState: false,
    }));
  }

  get routinesStore() {
    return (this._routinesStore ??= new RoutinesStore(this));
  }

  get webhookModalStore() {
    return (this._webhookModalStore ??= new WebhookModalStore(this));
  }

  get webhooksStore() {
    return (this._webhooksStore ??= new WebhooksStore(this));
  }

  get webhookDeliveriesStore() {
    return (this._webhookDeliveriesStore ??= new WebhookDeliveriesStore(this));
  }

  get webhookDeliveryModalStore() {
    return (this._webhookDeliveryModalStore ??= new WebhookDeliveryModalStore(this));
  }

  get operatorUsersStore() {
    return (this._operatorUsersStore ??= new OperatorUsersStore(this));
  }

  get operatorWorkspacesStore() {
    return (this._operatorWorkspacesStore ??= new OperatorWorkspacesStore(this));
  }

  get operatorAuditStore() {
    return (this._operatorAuditStore ??= new OperatorAuditStore(this));
  }

  get auditLogsStore() {
    return (this._auditLogsStore ??= new AuditLogsStore(this));
  }

  get auditLogModalStore() {
    return (this._auditLogModalStore ??= new AuditLogModalStore(this));
  }

  get feedbackModalStore() {
    return (this._feedbackModalStore ??= new FeedbackModalStore(this));
  }

  get timelineDetailModalStore() {
    return (this._timelineDetailModalStore ??= new TimelineDetailModalStore(this));
  }

  registerModalStore = (modalStore: BaseModalStore<any>) => {
    this.modalStores.add(modalStore);
  };

  unregisterModalStore = (modalStore: BaseModalStore<any>) => {
    this.modalStores.delete(modalStore);
  };

  closeAllModals = () => {
    this._recordWorkspaceStore?.close();
    this.modalStores.forEach((modalStore) => {
      if (modalStore.isOpen) modalStore.close();
    });
  };
}
