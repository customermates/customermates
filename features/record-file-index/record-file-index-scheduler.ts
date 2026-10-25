export abstract class RecordFileIndexScheduler {
  abstract schedule(): Promise<void>;
}
