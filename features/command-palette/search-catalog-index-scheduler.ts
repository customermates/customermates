export abstract class SearchCatalogIndexScheduler {
  abstract schedule(fingerprint: string): Promise<void>;
}
