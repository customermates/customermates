export abstract class CopyViewWidgetsRepo {
  abstract copyViewWidgets(sourceViewId: string, targetViewId: string): Promise<number>;
}
