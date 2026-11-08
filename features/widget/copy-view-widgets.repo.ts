export abstract class CopyViewWidgetsRepo {
  /** sourceViewId null copies the caller's main dashboard. */
  abstract copyViewWidgets(sourceViewId: string | null, targetViewId: string): Promise<number>;
}
