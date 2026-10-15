export type RecordFileIndexRequest = { companyId: string; fileIds: string[] };

export interface RecordFileIndexDispatcher {
  dispatch(request: RecordFileIndexRequest): Promise<void>;
}
