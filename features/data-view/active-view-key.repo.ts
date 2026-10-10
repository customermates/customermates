export abstract class ActiveViewKeyRepo {
  abstract upsertP13n(data: { p13nId: string; activeViewKey: string }): Promise<unknown>;
}
