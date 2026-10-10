export abstract class DeleteWidgetRepo {
  abstract trashWidget(id: string): Promise<{ name: string } | null>;
}
