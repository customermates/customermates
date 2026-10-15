import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordAccessMap } from "@/features/records/record-query.schema";

export type RecordFileSearchScope = { model: RecordModel; access: RecordAccessMap; typeIds: string[] };

export type RecordFileSection = { offset: number; heading: string | null; text: string };

export type RecordFileFullTextCandidates = {
  keys: string[];
  coverage: number;
  sections: Map<string, RecordFileSection>;
  corrected?: string;
};

export type RecordFileSemanticCandidates = {
  keys: string[];
  similarity: number | null;
  sections: Map<string, RecordFileSection>;
  stale: boolean;
};

export type RecordFileSearchTarget = {
  id: string;
  name: string;
  mimeType: string;
  typeId: string;
  recordId: string;
  fieldId: string;
};

export abstract class SearchRecordFilesRepo {
  abstract fullTextFileCandidates(
    query: string,
    scope: RecordFileSearchScope,
    limit: number,
  ): Promise<RecordFileFullTextCandidates>;
  abstract semanticFileCandidates(
    vector: number[],
    model: string,
    scope: RecordFileSearchScope,
    limit: number,
  ): Promise<RecordFileSemanticCandidates | null>;
  abstract getSearchTargets(ids: string[]): Promise<RecordFileSearchTarget[]>;
}
