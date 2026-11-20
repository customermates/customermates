import type { DiscoveryChoice } from "./discovery-answer";

export type DiscoveryAnswerWrite = {
  userId: string;
  choice: DiscoveryChoice | null;
  detail: string | null;
};

export abstract class DiscoveryAnswerRepo {
  abstract recordDiscoveryAnswer(answer: DiscoveryAnswerWrite): Promise<boolean>;
}
