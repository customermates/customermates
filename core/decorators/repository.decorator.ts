import { injectable } from "inversify";

export function Repository<T extends { new (...args: any[]): object }>(constructor: T) {
  injectable()(constructor);

  return constructor;
}
