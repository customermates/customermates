export abstract class PruneDraftSendsRepo {
  abstract pruneDraftSendsUnscoped(args: {
    before: Date;
    after: string | null;
    limit: number;
  }): Promise<{ pruned: number; next: string | null }>;
}
