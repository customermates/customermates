export abstract class WikiSemanticIndexScheduler {
  abstract schedule(): Promise<void>;
}
