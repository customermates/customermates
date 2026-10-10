import type { WidgetDto } from "./widget.schema";

export abstract class GetWidgetsRepo {
  abstract getWidgets(viewId?: string | null): Promise<WidgetDto[]>;
}
