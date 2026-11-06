export abstract class PublicLinkSettingsRepo {
  abstract publicLinksAllowedForCompany(): Promise<boolean>;
  abstract setPublicLinksAllowed(allowed: boolean): Promise<void>;
  abstract countActivePublicLinks(): Promise<number>;
}
