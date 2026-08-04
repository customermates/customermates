import type { BaseModalStore } from "../base/base-modal.store";
import type { AppMode } from "@/core/config/environment";

import { SignInStore } from "@/app/[locale]/(public)/auth/signin/sign-in.store";
import { SignUpStore } from "@/app/[locale]/(public)/auth/signup/sign-up.store";
import { CompanySettingsStore } from "@/app/[locale]/(protected)/company/components/company-settings/company-settings.store";
import { ForgotPasswordStore } from "@/app/[locale]/(public)/auth/forgot-password/forgot-password.store";
import { VerifyEmailStore } from "@/app/[locale]/(public)/auth/verify-email/verify-email.store";
import { McpConsentStore } from "@/app/[locale]/(public)/auth/mcp-consent/mcp-consent.store";
import { SubscriptionStore } from "@/app/[locale]/(protected)/company/components/subscription/subscription.store";
import { SubscriptionExpiredStore } from "@/app/[locale]/(protected)/subscription-expired/components/subscription-expired.store";
import { CompanyInviteModalStore } from "@/app/[locale]/(protected)/company/components/company-invite/company-invite-modal.store";
import { InviteByEmailStore } from "@/app/[locale]/(protected)/company/components/company-invite/invite-by-email.store";
import { UserModalStore } from "@/app/[locale]/(protected)/company/components/user/user-modal.store";
import { RoleModalStore } from "@/app/[locale]/(protected)/company/components/role/role-modal.store";
import { UsersStore } from "@/app/[locale]/(protected)/company/components/user/users.store";
import { CompanyStore } from "@/app/[locale]/(protected)/company/components/company.store";
import { ContactDetailStore } from "@/app/[locale]/(protected)/contacts/components/contact-detail.store";
import { OrganizationDetailStore } from "@/app/[locale]/(protected)/organizations/components/organization-detail.store";
import { OrganizationsStore } from "@/app/[locale]/(protected)/organizations/components/organizations.store";
import { StepAiStore } from "@/app/[locale]/(protected)/onboarding/wizard/components/step-ai.store";
import { StepProfileStore } from "@/app/[locale]/(protected)/onboarding/wizard/components/step-profile.store";
import { OnboardingWizardStore } from "@/app/[locale]/(protected)/onboarding/wizard/components/onboarding-wizard.store";
import { ProfileSettingsStore } from "@/app/[locale]/(protected)/profile/components/profile-settings.store";
import { ApiKeyModalStore } from "@/app/[locale]/(protected)/profile/components/api-key-modal.store";
import { ApiKeysStore } from "@/app/[locale]/(protected)/profile/components/api-keys.store";
import { ConnectedAccountModalStore } from "@/app/[locale]/(protected)/profile/components/connected-account-modal.store";
import { ConnectedAccountsStore } from "@/app/[locale]/(protected)/profile/components/connected-accounts.store";
import { ConnectUpsellModalStore } from "@/app/[locale]/(protected)/profile/components/connect-upsell-modal.store";
import { ContactsStore } from "@/app/[locale]/(protected)/contacts/components/contacts.store";
import { MessagingThreadsStore } from "@/app/[locale]/(protected)/inbox/components/messaging-threads.store";
import { MessagingThreadDetailStore } from "@/app/[locale]/(protected)/inbox/components/messaging-thread-detail.store";
import { ThreadComposeStore } from "@/app/[locale]/(protected)/inbox/components/thread-compose.store";
import { ActivitiesStore } from "@/features/messaging/activities/activities.store";
import { ThreadParticipantsStore } from "@/app/[locale]/(protected)/inbox/components/thread-participants.store";
import { AddChannelStore } from "@/app/[locale]/(protected)/contacts/components/add-channel.store";
import { UserStore } from "@/app/[locale]/(protected)/profile/components/user.store";
import { TasksStore } from "@/app/[locale]/(protected)/tasks/components/tasks.store";
import { TaskDetailStore } from "@/app/[locale]/(protected)/tasks/components/task-detail.store";
import { LayoutStore } from "@/components/layout/layout.store";
import { LoadingOverlayStore } from "@/components/shared/loading-overlay.store";
import { ServicesStore } from "@/app/[locale]/(protected)/services/components/services.store";
import { ServiceDetailStore } from "@/app/[locale]/(protected)/services/components/service-detail.store";
import { IntlStore } from "@/core/stores/intl.store";
import { LocaleStore } from "@/core/stores/locale.store";
import { TerminologyStore } from "@/core/stores/terminology.store";
import { WidgetsStore } from "@/app/[locale]/(protected)/dashboard/components/widgets.store";
import { WidgetModalStore } from "@/app/[locale]/(protected)/dashboard/components/widget-modal.store";
import { RolesStore } from "@/app/[locale]/(protected)/company/components/role/roles.store";
import { CustomColumnModalStore } from "@/components/data-view/custom-columns/custom-column-modal.store";
import { EditFiltersModalStore } from "@/components/data-view/filter-modal/edit-filters-modal.store";
import { DeleteConfirmationModalStore } from "@/components/modal/delete-confirmation-modal.store";
import { DealDetailStore } from "@/app/[locale]/(protected)/deals/components/deal-detail.store";
import { DealsStore } from "@/app/[locale]/(protected)/deals/components/deals.store";
import { ResetPasswordStore } from "@/app/[locale]/(public)/auth/reset-password/reset-password.store";
import { GlobalSearchModalStore } from "@/app/components/global-search-modal.store";
import { WebhookModalStore } from "@/app/[locale]/(protected)/company/components/webhook/webhook-modal.store";
import { WebhooksStore } from "@/app/[locale]/(protected)/company/components/webhook/webhooks.store";
import { WebhookDeliveriesStore } from "@/app/[locale]/(protected)/company/components/webhook/webhook-deliveries.store";
import { WebhookDeliveryModalStore } from "@/app/[locale]/(protected)/company/components/webhook/webhook-delivery-modal.store";
import { AuditLogModalStore } from "@/app/[locale]/(protected)/company/components/audit-log/audit-log-modal.store";
import { AuditLogsStore } from "@/app/[locale]/(protected)/company/components/audit-log/audit-logs.store";
import { FeedbackModalStore } from "@/app/[locale]/(protected)/company/components/feedback/feedback-modal.store";
import { TimelineDetailModalStore } from "@/features/messaging/activities/activities-detail-modal.store";
import { ContactStore } from "@/app/[locale]/(public)/contact/contact.store";
import { ErrorTestStore } from "@/app/[locale]/(protected)/test/error/error-test.store";

import { NavigationGuardController } from "./navigation-guard.controller";

export class RootStore {
  private readonly modalStores = new Set<BaseModalStore<any>>();
  public readonly navigationGuard = new NavigationGuardController();

  private _apiKeysStore?: ApiKeysStore;
  private _connectedAccountsStore?: ConnectedAccountsStore;
  private _connectedAccountModalStore?: ConnectedAccountModalStore;
  private _connectUpsellModalStore?: ConnectUpsellModalStore;
  private _companyStore?: CompanyStore;
  private _terminologyStore?: TerminologyStore;
  private _contactsStore?: ContactsStore;
  private _messagingThreadsStore?: MessagingThreadsStore;
  private _messagingThreadDetailStore?: MessagingThreadDetailStore;
  private _threadComposeStore?: ThreadComposeStore;
  private _activitiesStore?: ActivitiesStore;
  private _threadParticipantsStore?: ThreadParticipantsStore;
  private _addChannelStore?: AddChannelStore;
  private _dealsStore?: DealsStore;
  private _intlStore?: IntlStore;
  private _layoutStore?: LayoutStore;
  private _loadingOverlayStore?: LoadingOverlayStore;
  private _localeStore?: LocaleStore;
  private _organizationsStore?: OrganizationsStore;
  private _rolesStore?: RolesStore;
  private _servicesStore?: ServicesStore;
  private _tasksStore?: TasksStore;
  private _userStore?: UserStore;
  private _usersStore?: UsersStore;
  private _webhookDeliveriesStore?: WebhookDeliveriesStore;
  private _webhooksStore?: WebhooksStore;
  private _widgetsGridStore?: WidgetsStore;
  private _auditLogsStore?: AuditLogsStore;

  private _companySettingsStore?: CompanySettingsStore;
  private _forgotPasswordStore?: ForgotPasswordStore;
  private _verifyEmailStore?: VerifyEmailStore;
  private _mcpConsentStore?: McpConsentStore;
  private _inviteByEmailStore?: InviteByEmailStore;
  private _stepAiStore?: StepAiStore;
  private _stepProfileStore?: StepProfileStore;
  private _onboardingWizardStore?: OnboardingWizardStore;
  private _resetPasswordStore?: ResetPasswordStore;
  private _contactStore?: ContactStore;
  private _errorTestStore?: ErrorTestStore;
  private _signInStore?: SignInStore;
  private _signUpStore?: SignUpStore;
  private _subscriptionStore?: SubscriptionStore;
  private _subscriptionExpiredStore?: SubscriptionExpiredStore;
  private _profileSettingsStore?: ProfileSettingsStore;

  private _companyInviteModalStore?: CompanyInviteModalStore;
  private _contactDetailStore?: ContactDetailStore;
  private _createApiKeyModalStore?: ApiKeyModalStore;
  private _dealDetailStore?: DealDetailStore;
  private _deleteConfirmationModalStore?: DeleteConfirmationModalStore;
  private _globalSearchModalStore?: GlobalSearchModalStore;
  private _organizationDetailStore?: OrganizationDetailStore;
  private _roleModalStore?: RoleModalStore;
  private _serviceDetailStore?: ServiceDetailStore;
  private _taskDetailStore?: TaskDetailStore;
  private _userModalStore?: UserModalStore;
  private _webhookDeliveryModalStore?: WebhookDeliveryModalStore;
  private _webhookModalStore?: WebhookModalStore;
  private _widgetModalStore?: WidgetModalStore;
  private _auditLogModalStore?: AuditLogModalStore;
  private _feedbackModalStore?: FeedbackModalStore;
  private _timelineDetailModalStore?: TimelineDetailModalStore;
  private _customColumnModalStore?: CustomColumnModalStore;
  private _editFiltersModalStore?: EditFiltersModalStore;

  readonly appMode: AppMode;

  constructor(appMode: AppMode) {
    this.appMode = appMode;
  }

  get layoutStore() {
    return (this._layoutStore ??= new LayoutStore());
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

  get companyStore() {
    return (this._companyStore ??= new CompanyStore(this));
  }

  get terminologyStore() {
    return (this._terminologyStore ??= new TerminologyStore(this));
  }

  get usersStore() {
    return (this._usersStore ??= new UsersStore(this));
  }

  get rolesStore() {
    return (this._rolesStore ??= new RolesStore(this));
  }

  get tasksStore() {
    return (this._tasksStore ??= new TasksStore(this));
  }

  get contactsStore() {
    return (this._contactsStore ??= new ContactsStore(this));
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

  get activitiesStore() {
    return (this._activitiesStore ??= new ActivitiesStore(this));
  }

  get threadParticipantsStore() {
    return (this._threadParticipantsStore ??= new ThreadParticipantsStore(this));
  }

  get addChannelStore() {
    return (this._addChannelStore ??= new AddChannelStore(this));
  }

  get organizationsStore() {
    return (this._organizationsStore ??= new OrganizationsStore(this));
  }

  get dealsStore() {
    return (this._dealsStore ??= new DealsStore(this));
  }

  get servicesStore() {
    return (this._servicesStore ??= new ServicesStore(this));
  }

  get customColumnModalStore() {
    return (this._customColumnModalStore ??= new CustomColumnModalStore(this));
  }

  get editFiltersModalStore() {
    return (this._editFiltersModalStore ??= new EditFiltersModalStore(this));
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
    return (this._stepAiStore ??= new StepAiStore(this));
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

  get contactStore() {
    return (this._contactStore ??= new ContactStore(this));
  }

  get errorTestStore() {
    return (this._errorTestStore ??= new ErrorTestStore(this));
  }

  get signInStore() {
    return (this._signInStore ??= new SignInStore(this));
  }

  get signUpStore() {
    return (this._signUpStore ??= new SignUpStore(this));
  }

  get companySettingsStore() {
    return (this._companySettingsStore ??= new CompanySettingsStore(this));
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

  get userModalStore() {
    return (this._userModalStore ??= new UserModalStore(this));
  }

  get companyInviteModalStore() {
    return (this._companyInviteModalStore ??= new CompanyInviteModalStore(this));
  }

  get roleModalStore() {
    return (this._roleModalStore ??= new RoleModalStore(this));
  }

  get contactDetailStore() {
    return (this._contactDetailStore ??= new ContactDetailStore(this));
  }

  get organizationDetailStore() {
    return (this._organizationDetailStore ??= new OrganizationDetailStore(this));
  }

  get dealDetailStore() {
    return (this._dealDetailStore ??= new DealDetailStore(this));
  }

  get serviceDetailStore() {
    return (this._serviceDetailStore ??= new ServiceDetailStore(this));
  }

  get taskDetailStore() {
    return (this._taskDetailStore ??= new TaskDetailStore(this));
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

  closeAllModals = () => {
    this.modalStores.forEach((modalStore) => {
      if (modalStore.isOpen) modalStore.close();
    });
  };
}
