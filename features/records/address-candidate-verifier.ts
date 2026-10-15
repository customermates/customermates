import type { RecordAddress } from "./record-model.schema";

export interface AddressCandidateVerifier {
  verify(candidateToken: string): Promise<RecordAddress | null>;
}
