import type { MessagingFilterOptions } from "./messaging-filter-options.schema";

export abstract class MessagingFilterOptionsRepo {
  abstract listInboxFilterOptions(): Promise<MessagingFilterOptions>;
}
