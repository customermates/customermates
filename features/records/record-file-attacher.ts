import type { RecordRef } from "./record-model.schema";

export type RecordFileAttachment = {
  ref: RecordRef;
  fieldId: string;
  fileIds: string[];
  previousFileIds: string[];
};

export interface RecordFileAttacher {
  attach(attachment: RecordFileAttachment): Promise<boolean>;
}
