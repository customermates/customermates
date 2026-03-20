import { TenantScoped } from "@/core/decorators/tenant-scoped.decorator";

export abstract class RecalculateUserWidgetsRepo {
  abstract recalculateUserWidgets(): Promise<void>;
}

@TenantScoped
export class WidgetService {
  constructor(private widgetRepo: RecalculateUserWidgetsRepo) {}

  async recalculateUserWidgets(): Promise<void> {
    await this.widgetRepo.recalculateUserWidgets();
  }
}
