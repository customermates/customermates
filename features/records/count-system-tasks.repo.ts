export abstract class CountSystemTasksRepo {
  abstract getSystemTasksCount(): Promise<number>;
}
