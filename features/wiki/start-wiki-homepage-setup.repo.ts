import { type AppLocale } from "@/i18n/locale-registry";

export abstract class StartWikiHomepageSetupRepo {
  abstract wikiIsEmpty(): Promise<boolean>;
  abstract dominantWikiLanguage(): Promise<AppLocale | null>;
}
