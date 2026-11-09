export abstract class CopyViewWidgetsRepo {
  abstract copyViewWidgets(sourceViewId: string | null, targetViewId: string): Promise<number>;
}
