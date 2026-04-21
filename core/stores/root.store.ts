import type { BaseModalStore } from "../base/base-modal.store";

import { SignInStore } from "@/app/[locale]/(public)/auth/signin/sign-in.store";
import { SignUpStore } from "@/app/[locale]/(public)/auth/signup/sign-up.store";
import { ForgotPasswordStore } from "@/app/[locale]/(public)/auth/forgot-password/forgot-password.store";
import { CompanyDetailsStore } from "@/app/[locale]/(protected)/company/components/company-details/company-details.store";
import { SubscriptionStore } from "@/app/[locale]/(protected)/company/components/subscription/subscription.store";
import { SubscriptionExpiredStore } from "@/app/[locale]/(protected)/subscription-expired/components/subscription-expired.store";
import { CompanyInviteModalStore } from "@/app/[locale]/(protected)/company/components/company-invite/company-invite-modal.store";
import { UserModalStore } from "@/app/[locale]/(protected)/company/components/user/user-modal.store";
import { RoleModalStore } from "@/app/[locale]/(protected)/company/components/role/role-modal.store";
import { UsersStore } from "@/app/[locale]/(protected)/company/components/user/users.store";
import { CompanyStore } from "@/app/[locale]/(protected)/company/components/company.store";
import { ContactDetailStore } from "@/app/[locale]/(protected)/contacts/components/contact-detail.store";
import { OrganizationDetailStore } from "@/app/[locale]/(protected)/organizations/components/organization-detail.store";
import { OrganizationsStore } from "@/app/[locale]/(protected)/organizations/components/organizations.store";
import { OnboardingStore } from "@/app/[locale]/(public)/onboarding/components/onboarding.store";
import { UserDetailsStore } from "@/app/[locale]/(protected)/profile/components/user-details.store";
import { UserSettingsStore } from "@/app/[locale]/(protected)/profile/components/user-settings.store";
import { ApiKeyModalStore } from "@/app/[locale]/(protected)/profile/components/api-key-modal.store";
import { ApiKeysStore } from "@/app/[locale]/(protected)/profile/components/api-keys.store";
import { ContactsStore } from "@/app/[locale]/(protected)/contacts/components/contacts.store";
import { UserStore } from "@/app/[locale]/(protected)/profile/components/user.store";
import { TasksStore } from "@/app/[locale]/(protected)/tasks/components/tasks.store";
import { TaskDetailStore } from "@/app/[locale]/(protected)/tasks/components/task-detail.store";
import { LayoutStore } from "@/components/layout/layout.store";
import { LoadingOverlayStore } from "@/components/shared/loading-overlay.store";
import { ServicesStore } from "@/app/[locale]/(protected)/services/components/services.store";
import { ServiceDetailStore } from "@/app/[locale]/(protected)/services/components/service-detail.store";
import { IntlStore } from "@/core/stores/intl.store";
import { LocaleStore } from "@/core/stores/locale.store";
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
import { EntityHistoryDetailsModalStore } from "@/app/[locale]/(protected)/company/components/audit-log/entity-history-details-modal.store";
import { EntityHistoryModalStore } from "@/app/[locale]/(protected)/company/components/audit-log/entity-history-modal.store";
import { FeedbackModalStore } from "@/app/[locale]/(protected)/company/components/feedback/feedback-modal.store";
import { ContactStore } from "@/app/[locale]/(static)/contact/contact.store";

export class RootStore {
  private readonly modalStores = new Set<BaseModalStore<any>>();

  private _apiKeysStore?: ApiKeysStore;
  private _companyStore?: CompanyStore;
  private _contactsStore?: ContactsStore;
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

  private _companyDetailsStore?: CompanyDetailsStore;
  private _forgotPasswordStore?: ForgotPasswordStore;
  private _onboardingStore?: OnboardingStore;
  private _resetPasswordStore?: ResetPasswordStore;
  private _contactStore?: ContactStore;
  private _signInStore?: SignInStore;
  private _signUpStore?: SignUpStore;
  private _subscriptionStore?: SubscriptionStore;
  private _subscriptionExpiredStore?: SubscriptionExpiredStore;
  private _userDetailsStore?: UserDetailsStore;
  private _userSettingsStore?: UserSettingsStore;

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
  private _entityHistoryDetailsModalStore?: EntityHistoryDetailsModalStore;
  private _entityHistoryModalStore?: EntityHistoryModalStore;
  private _feedbackModalStore?: FeedbackModalStore;
  private _customColumnModalStore?: CustomColumnModalStore;
  private _editFiltersModalStore?: EditFiltersModalStore;

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

  get customColumnModalStore() {
    return (this._customColumnModalStore ??= new CustomColumnModalStore(this));
  }

  get editFiltersModalStore() {
    return (this._editFiltersModalStore ??= new EditFiltersModalStore(this));
  }

  get widgetsStore() {
    return (this._widgetsGridStore ??= new WidgetsStore(this));
  }

  get userDetailsStore() {
    return (this._userDetailsStore ??= new UserDetailsStore(this));
  }

  get userSettingsStore() {
    return (this._userSettingsStore ??= new UserSettingsStore(this));
  }

  get apiKeyModalStore() {
    return (this._createApiKeyModalStore ??= new ApiKeyModalStore(this));
  }

  get apiKeysStore() {
    return (this._apiKeysStore ??= new ApiKeysStore(this));
  }

  get onboardingStore() {
    return (this._onboardingStore ??= new OnboardingStore(this));
  }

  get contactStore() {
    return (this._contactStore ??= new ContactStore(this));
  }

  get signInStore() {
    return (this._signInStore ??= new SignInStore(this));
  }

  get signUpStore() {
    return (this._signUpStore ??= new SignUpStore(this));
  }

  get forgotPasswordStore() {
    return (this._forgotPasswordStore ??= new ForgotPasswordStore(this));
  }

  get resetPasswordStore() {
    return (this._resetPasswordStore ??= new ResetPasswordStore(this));
  }

  get companyDetailsStore() {
    return (this._companyDetailsStore ??= new CompanyDetailsStore(this));
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

  get entityHistoryModalStore() {
    return (this._entityHistoryModalStore ??= new EntityHistoryModalStore(this));
  }

  get entityHistoryDetailsModalStore() {
    return (this._entityHistoryDetailsModalStore ??= new EntityHistoryDetailsModalStore(this));
  }

  get feedbackModalStore() {
    return (this._feedbackModalStore ??= new FeedbackModalStore(this));
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
