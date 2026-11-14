export abstract class RecordAgentFirstCallRepo {
  abstract recordAgentFirstCall(): Promise<boolean>;
  abstract recordAgentCall(staleBefore: Date): Promise<void>;
}
