import type { RecordFieldView, RecordModelView } from "./record-model.schema";

type ChannelsModel = { fields: RecordFieldView[]; types: RecordModelView["types"] };

export function recordChannelsField<F extends RecordFieldView>(model: { fields: F[] }, typeId: string): F | undefined {
  return model.fields.find((field) => field.valueType === "channels" && field.typeId === typeId);
}

export function recordChannelsEnabled(model: { fields: RecordFieldView[] }, typeId: string): boolean {
  return recordChannelsField(model, typeId)?.archived === false;
}

export function recordChannelsTypeIds(model: ChannelsModel): string[] {
  return model.types.filter((type) => !type.archived && recordChannelsEnabled(model, type.id)).map((type) => type.id);
}

export function recordProviderAvatarEnabled(model: { fields: RecordFieldView[] }, typeId: string): boolean {
  const field = recordChannelsField(model, typeId);
  return field?.archived === false && field.format?.providerAvatar === true;
}
