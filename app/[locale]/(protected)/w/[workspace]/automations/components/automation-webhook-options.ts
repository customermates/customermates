import { AppErrorCode, ForbiddenError } from "@/core/errors/app-errors";
import { WEBHOOK_AUTOMATION_EVENTS } from "@/features/webhook/webhook-event-registry";

export const WEBHOOK_OPTION_PAGE_SIZE = 100;

export type WebhookOption = { id: string; label: string; subscribed: boolean };

type WebhookRow = { id: string; enabled: boolean; description?: string | null; url: string; events: readonly string[] };

type WebhookPage =
  | { ok: true; data: { items: WebhookRow[]; pagination?: { totalPages: number } } }
  | { ok: false; error?: unknown };

function firesForAutomations(hook: WebhookRow): boolean {
  return WEBHOOK_AUTOMATION_EVENTS.some((event) => hook.events.includes(event));
}

export async function loadWebhookOptions(
  loadPage: (page: number, pageSize: typeof WEBHOOK_OPTION_PAGE_SIZE) => Promise<WebhookPage>,
): Promise<WebhookOption[] | null> {
  const options: WebhookOption[] = [];
  try {
    for (let page = 1; ; page += 1) {
      const result = await loadPage(page, WEBHOOK_OPTION_PAGE_SIZE);
      if (!result.ok) return null;
      for (const hook of result.data.items) {
        if (hook.enabled)
          options.push({ id: hook.id, label: hook.description || hook.url, subscribed: firesForAutomations(hook) });
      }
      if (result.data.items.length === 0 || page >= (result.data.pagination?.totalPages ?? 1)) return options;
    }
  } catch (error) {
    if (error instanceof ForbiddenError && error.code === AppErrorCode.permissionDenied) return null;
    throw error;
  }
}
