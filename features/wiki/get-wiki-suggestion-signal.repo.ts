export abstract class GetWikiSuggestionSignalRepo {
  abstract findSuggestionWikiPage(): Promise<{ id: string } | null>;
}
