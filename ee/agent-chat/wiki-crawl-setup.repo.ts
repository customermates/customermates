export type WikiCrawlSetupIdentity = {
  userId: string;
  clientRequestId: string;
  homepageUrl: string;
};

export abstract class WikiCrawlSetupRepo {
  abstract hasActiveWikiHomepageSetup(now: Date): Promise<boolean>;
  abstract protectedWikiHomepageSetupUrls(now: Date): Promise<string[]>;
  abstract findWikiHomepageSetupConversation(identity: WikiCrawlSetupIdentity): Promise<string | null>;
}
