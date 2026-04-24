export abstract class RecalculateUserWidgetsRepo {
  abstract recalculateUserWidgets(): Promise<void>;
}

export class WidgetService {
  constructor(private widgetRepo: RecalculateUserWidgetsRepo) {}

  async recalculateUserWidgets(): Promise<void> {
    await this.widgetRepo.recalculateUserWidgets();
  }
}
