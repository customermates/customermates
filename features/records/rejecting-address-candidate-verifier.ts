import type { AddressCandidateVerifier } from "./address-candidate-verifier";
import type { RecordAddress } from "./record-model.schema";

export class RejectingAddressCandidateVerifier implements AddressCandidateVerifier {
  verify(): Promise<RecordAddress | null> {
    return Promise.resolve(null);
  }
}
