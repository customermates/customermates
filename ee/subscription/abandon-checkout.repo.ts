export abstract class AbandonCheckoutRepo {
  abstract clearCheckoutStart(): Promise<void>;
}
