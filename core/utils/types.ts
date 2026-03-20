export type RepoArgs<T, K extends keyof T> = T[K] extends (arg: infer A) => any ? A : never;
