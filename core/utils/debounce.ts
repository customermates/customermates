export const SEARCH_DEBOUNCE_MS = 300;

export class Debouncer {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly delayMs: number = SEARCH_DEBOUNCE_MS) {}

  run = (fn: () => void): void => {
    this.cancel();
    this.timer = setTimeout(fn, this.delayMs);
  };

  cancel = (): void => {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  };
}
