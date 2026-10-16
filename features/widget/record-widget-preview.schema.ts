import { z } from "zod";

import { CalendarWidgetQuerySchema, CalendarWidgetWindowSchema } from "./record-calendar-widget.schema";
import { MapWidgetQuerySchema } from "./record-map-widget.schema";

export const PreviewRecordCalendarWidgetSchema = z
  .object({ calendarQuery: CalendarWidgetQuerySchema, window: CalendarWidgetWindowSchema.optional() })
  .strict();

export const PreviewRecordMapWidgetSchema = z.object({ mapQuery: MapWidgetQuerySchema }).strict();
