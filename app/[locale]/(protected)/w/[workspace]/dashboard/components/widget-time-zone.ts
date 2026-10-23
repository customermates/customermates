import { isRecordMeasureTimeZone } from "@/features/records/record-measure.schema";

export function browserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isRecordMeasureTimeZone(zone) ? zone : "UTC";
  } catch {
    return "UTC";
  }
}
