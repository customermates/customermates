export type EntityDrawerLoadAttempt = { generation: number; key: string };

export class EntityDrawerLoadGate {
  private generation = 0;

  begin(key: string): EntityDrawerLoadAttempt {
    this.generation += 1;
    return { generation: this.generation, key };
  }

  cancel(): void {
    this.generation += 1;
  }

  isCurrent(attempt: EntityDrawerLoadAttempt, key: string): boolean {
    return attempt.generation === this.generation && attempt.key === key;
  }
}
