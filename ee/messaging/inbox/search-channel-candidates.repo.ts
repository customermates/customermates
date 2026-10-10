import type { ChannelCandidateDto } from "./search-channel-candidates.interactor";

export abstract class SearchChannelCandidatesRepo {
  abstract searchChannelCandidates(query: string): Promise<ChannelCandidateDto[]>;
}
