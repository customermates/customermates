import type { ActivityEntryDto } from "@/ee/messaging/activities/activities.schema";

export function activityEntryKey(entry: Pick<ActivityEntryDto, "id" | "kind">): string {
  return `${entry.kind}:${entry.id}`;
}
