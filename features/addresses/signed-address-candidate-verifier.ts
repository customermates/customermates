import type { AddressCandidateVerifier } from "@/features/records/address-candidate-verifier";
import type { RecordAddress } from "@/features/records/record-model.schema";

import { UserAccessor } from "@/core/base/user-accessor";
import { addressCandidateSigningSecret, decodeAddressCandidate } from "./address-candidate-token";

export class SignedAddressCandidateVerifier extends UserAccessor implements AddressCandidateVerifier {
  constructor(
    private readonly secret: string | undefined,
    private readonly now: () => Date = () => new Date(),
  ) {
    super();
  }

  verify(candidateToken: string): Promise<RecordAddress | null> {
    const secret = addressCandidateSigningSecret(this.secret);
    return Promise.resolve(secret ? decodeAddressCandidate(candidateToken, this.companyId, secret, this.now()) : null);
  }
}
