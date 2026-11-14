import type { NotifyMembersInput } from "./notification.schema";

import { getNotificationService } from "@/core/di";

export async function notifyMembers(input: NotifyMembersInput): Promise<{ created: number; emailed: number }> {
  return getNotificationService().notify(input);
}
