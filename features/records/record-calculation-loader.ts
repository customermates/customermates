import type { RecordRef } from "./record-model.schema";

const CHUNK = 500;
const key = (ref: RecordRef) => `${ref.typeId}:${ref.recordId}`;

type Waiting<T> = { ref: RecordRef; resolve: (value: T) => void; reject: (error: unknown) => void };

export class CalculationLoader<T> {
  private waiting = new Map<string, Waiting<T>[]>();

  constructor(private readonly load: (refs: RecordRef[]) => Promise<T[]>) {}

  get size() {
    return this.waiting.size;
  }

  enqueue(ref: RecordRef): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.waiting.set(key(ref), [...(this.waiting.get(key(ref)) ?? []), { ref, resolve, reject }]);
    });
  }

  async run(): Promise<void> {
    const batch = [...this.waiting.values()];
    this.waiting.clear();
    for (let offset = 0; offset < batch.length; offset += CHUNK) {
      const chunk = batch.slice(offset, offset + CHUNK);
      try {
        const loaded = await this.load(chunk.map((waiters) => waiters[0].ref));
        chunk.forEach((waiters, index) => waiters.forEach((waiter) => waiter.resolve(loaded[index])));
      } catch (error) {
        for (const waiters of chunk) for (const waiter of waiters) waiter.reject(error);
      }
    }
  }
}
