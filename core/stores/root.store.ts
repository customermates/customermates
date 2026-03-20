import type { BaseModalStore } from "../base/base-modal.store";

import { SignInCardStore } from "@/app/[locale]/(public)/auth/signin/sign-in-card.store";
import { SignUpCardStore } from "@/app/[locale]/(public)/auth/signup/sign-up-card.store";
import { ForgotPasswordCardStore } from "@/app/[locale]/(public)/auth/forgot-password/forgot-password-card.store";
import { CompanyDetailsCardStore } from "@/app/[locale]/(protected)/company/components/company-details/company-details-card.store";
import { SubscriptionCardStore } from "@/app/[locale]/(protected)/company/components/subscription/subscription-card.store";
import { SubscriptionExpiredCardStore } from "@/app/[locale]/(protected)/subscription-expired/components/subscription-expired-card.store";
import { CompanyInviteModalStore } from "@/app/[locale]/(protected)/company/components/company-invite/company-invite-modal.store";
import { UserModalStore } from "@/app/[locale]/(protected)/company/components/user/user-modal.store";
import { RoleModalStore } from "@/app/[locale]/(protected)/company/components/role/role-modal.store";
import { UsersStore } from "@/app/[locale]/(protected)/company/components/user/users.store";
import { CompanyStore } from "@/app/[locale]/(protected)/company/components/company.store";
import { ContactModalStore } from "@/app/[locale]/(protected)/contacts/components/contact-modal.store";
import { OrganizationModalStore } from "@/app/[locale]/(protected)/organizations/components/organization-modal.store";
import { OrganizationsStore } from "@/app/[locale]/(protected)/organizations/components/organizations.store";
import { OnboardingCardStore } from "@/app/[locale]/(public)/onboarding/components/onboarding-card.store";
import { UserDetailsCardStore } from "@/app/[locale]/(protected)/profile/components/user-details-card.store";
import { UserSettingsCardStore } from "@/app/[locale]/(protected)/profile/components/user-settings-card.store";
import { ApiKeyModalStore } from "@/app/[locale]/(protected)/profile/components/api-key-modal.store";
import { ApiKeysStore } from "@/app/[locale]/(protected)/profile/components/api-keys.store";
import { ContactsStore } from "@/app/[locale]/(protected)/contacts/components/contacts.store";
import { UserStore } from "@/app/[locale]/(protected)/profile/components/user.store";
import { TasksStore } from "@/app/[locale]/(protected)/tasks/components/tasks.store";
import { TaskModalStore } from "@/app/[locale]/(protected)/tasks/components/task-modal.store";
import { LayoutStore } from "@/components/x-layout-primitives/layout.store";
import { XLoadingOverlayStore } from "@/components/x-loading-overlay.store";
import { ServicesStore } from "@/app/[locale]/(protected)/services/components/services.store";
import { ServiceModalStore } from "@/app/[locale]/(protected)/services/components/service-modal.store";
import { IntlStore } from "@/core/stores/intl.store";
import { LocaleStore } from "@/core/stores/locale.store";
import { WidgetsStore } from "@/app/[locale]/(protected)/dashboard/components/widgets.store";
import { WidgetModalStore } from "@/app/[locale]/(protected)/dashboard/components/widget-modal.store";
import { RolesStore } from "@/app/[locale]/(protected)/company/components/role/roles.store";
import { XCustomColumnModalStore } from "@/components/x-data-view/x-custom-column/x-custom-column-modal.store";
import { XEditFiltersModalStore } from "@/components/x-data-view/x-filter-modal/x-edit-filters-modal.store";
import { XDeleteConfirmationModalStore } from "@/components/x-modal/x-delete-confirmation-modal.store";
import { DealModalStore } from "@/app/[locale]/(protected)/deals/components/deal-modal.store";
import { DealsStore } from "@/app/[locale]/(protected)/deals/components/deals.store";
import { ResetPasswordCardStore } from "@/app/[locale]/(public)/auth/reset-password/reset-password-card.store";
import { GlobalSearchModalStore } from "@/app/components/global-search-modal.store";
import { WebhookModalStore } from "@/app/[locale]/(protected)/company/components/webhook/webhook-modal.store";
import { WebhooksStore } from "@/app/[locale]/(protected)/company/components/webhook/webhooks.store";
import { WebhookDeliveriesStore } from "@/app/[locale]/(protected)/company/components/webhook/webhook-deliveries.store";
import { WebhookDeliveryModalStore } from "@/app/[locale]/(protected)/company/components/webhook/webhook-delivery-modal.store";
import { AuditLogModalStore } from "@/app/[locale]/(protected)/company/components/audit-log/audit-log-modal.store";
import { AuditLogsStore } from "@/app/[locale]/(protected)/company/components/audit-log/audit-logs.store";
import { FeedbackModalStore } from "@/app/[locale]/(protected)/company/components/feedback/feedback-modal.store";
import { AiAgentProvisionModalStore } from "@/app/components/ai-agent-provision-modal.store";
import { AiAgentEnvironmentVariableModalStore } from "@/app/components/ai-agent-environment-variable-modal.store";
import { AppSidebarStore } from "@/app/components/app-sidebar.store";

export class RootStore {
  private readonly modalStores = new Set<BaseModalStore<any>>();

  private _apiKeysStore?: ApiKeysStore;
  private _companyStore?: CompanyStore;
  private _contactsStore?: ContactsStore;
  private _dealsStore?: DealsStore;
  private _intlStore?: IntlStore;
  private _layoutStore?: LayoutStore;
  private _loadingOverlayStore?: XLoadingOverlayStore;
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

  private _companyDetailsCardStore?: CompanyDetailsCardStore;
  private _forgotPasswordCardStore?: ForgotPasswordCardStore;
  private _onboardingCardStore?: OnboardingCardStore;
  private _resetPasswordCardStore?: ResetPasswordCardStore;
  private _signInCardStore?: SignInCardStore;
  private _signUpCardStore?: SignUpCardStore;
  private _subscriptionCardStore?: SubscriptionCardStore;
  private _subscriptionExpiredCardStore?: SubscriptionExpiredCardStore;
  private _userDetailsCardStore?: UserDetailsCardStore;
  private _userSettingsCardStore?: UserSettingsCardStore;

  private _companyInviteModalStore?: CompanyInviteModalStore;
  private _contactModalStore?: ContactModalStore;
  private _createApiKeyModalStore?: ApiKeyModalStore;
  private _dealModalStore?: DealModalStore;
  private _deleteConfirmationModalStore?: XDeleteConfirmationModalStore;
  private _globalSearchModalStore?: GlobalSearchModalStore;
  private _organizationModalStore?: OrganizationModalStore;
  private _roleModalStore?: RoleModalStore;
  private _serviceModalStore?: ServiceModalStore;
  private _taskModalStore?: TaskModalStore;
  private _userModalStore?: UserModalStore;
  private _webhookDeliveryModalStore?: WebhookDeliveryModalStore;
  private _webhookModalStore?: WebhookModalStore;
  private _widgetModalStore?: WidgetModalStore;
  private _auditLogModalStore?: AuditLogModalStore;
  private _feedbackModalStore?: FeedbackModalStore;
  private _aiAgentProvisionModalStore?: AiAgentProvisionModalStore;
  private _aiAgentEnvironmentVariableModalStore?: AiAgentEnvironmentVariableModalStore;
  private _appSidebarStore?: AppSidebarStore;
  private _xCustomColumnModalStore?: XCustomColumnModalStore;
  private _xTableFilterModalStore?: XEditFiltersModalStore;

  isDemoMode: boolean;
  isCloudHosted: boolean;

  constructor(
    private initialSidebarOpen?: boolean,
    private initialNavbarVisible?: boolean,
    isDemoMode?: boolean,
    isCloudHosted?: boolean,
  ) {
    this.isDemoMode = isDemoMode ?? false;
    this.isCloudHosted = isCloudHosted ?? false;
  }

  get layoutStore() {
    return (this._layoutStore ??= new LayoutStore(this.initialSidebarOpen, this.initialNavbarVisible));
  }

  get userStore() {
    return (this._userStore ??= new UserStore(this));
  }

  get loadingOverlayStore() {
    return (this._loadingOverlayStore ??= new XLoadingOverlayStore());
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

  get organizationsStore() {
    return (this._organizationsStore ??= new OrganizationsStore(this));
  }

  get dealsStore() {
    return (this._dealsStore ??= new DealsStore(this));
  }

  get servicesStore() {
    return (this._servicesStore ??= new ServicesStore(this));
  }

  get xCustomColumnModalStore() {
    return (this._xCustomColumnModalStore ??= new XCustomColumnModalStore(this));
  }

  get xTableFilterModalStore() {
    return (this._xTableFilterModalStore ??= new XEditFiltersModalStore(this));
  }

  get widgetsStore() {
    return (this._widgetsGridStore ??= new WidgetsStore(this));
  }

  get userDetailsCardStore() {
    return (this._userDetailsCardStore ??= new UserDetailsCardStore(this));
  }

  get userSettingsCardStore() {
    return (this._userSettingsCardStore ??= new UserSettingsCardStore(this));
  }

  get apiKeyModalStore() {
    return (this._createApiKeyModalStore ??= new ApiKeyModalStore(this));
  }

  get apiKeysStore() {
    return (this._apiKeysStore ??= new ApiKeysStore(this));
  }

  get onboardingCardStore() {
    return (this._onboardingCardStore ??= new OnboardingCardStore(this));
  }

  get signInCardStore() {
    return (this._signInCardStore ??= new SignInCardStore(this));
  }

  get signUpCardStore() {
    return (this._signUpCardStore ??= new SignUpCardStore(this));
  }

  get forgotPasswordCardStore() {
    return (this._forgotPasswordCardStore ??= new ForgotPasswordCardStore(this));
  }

  get resetPasswordCardStore() {
    return (this._resetPasswordCardStore ??= new ResetPasswordCardStore(this));
  }

  get companyDetailsCardStore() {
    return (this._companyDetailsCardStore ??= new CompanyDetailsCardStore(this));
  }

  get subscriptionCardStore() {
    return (this._subscriptionCardStore ??= new SubscriptionCardStore(this));
  }

  get subscriptionExpiredCardStore() {
    return (this._subscriptionExpiredCardStore ??= new SubscriptionExpiredCardStore(this));
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

  get contactModalStore() {
    return (this._contactModalStore ??= new ContactModalStore(this));
  }

  get organizationModalStore() {
    return (this._organizationModalStore ??= new OrganizationModalStore(this));
  }

  get dealModalStore() {
    return (this._dealModalStore ??= new DealModalStore(this));
  }

  get serviceModalStore() {
    return (this._serviceModalStore ??= new ServiceModalStore(this));
  }

  get taskModalStore() {
    return (this._taskModalStore ??= new TaskModalStore(this));
  }

  get deleteConfirmationModalStore() {
    return (this._deleteConfirmationModalStore ??= new XDeleteConfirmationModalStore(this));
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

  get aiAgentProvisionModalStore() {
    return (this._aiAgentProvisionModalStore ??= new AiAgentProvisionModalStore(this));
  }

  get aiAgentEnvironmentVariableModalStore() {
    return (this._aiAgentEnvironmentVariableModalStore ??= new AiAgentEnvironmentVariableModalStore(this));
  }

  get appSidebarStore() {
    return (this._appSidebarStore ??= new AppSidebarStore(this));
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
