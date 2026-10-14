import type { WikiCrawlRecord } from "./wiki-website-crawl.service";
import type { WikiSynthesisRole } from "./wiki-synthesis.schema";

export type WikiSynthesisAddressForm = "formal" | "informal";

export type WikiSynthesisBriefTopic = {
  key: string;
  role: WikiSynthesisRole;
  title: string;
  outline: string[];
  competitor?: string;
};

export type WikiSynthesisBrief = {
  topics: WikiSynthesisBriefTopic[];
  extraRoles: WikiSynthesisRole[];
  addressForm: WikiSynthesisAddressForm | null;
};

export type WikiSynthesisBriefState =
  | { status: "none" }
  | { status: "wait" }
  | { status: "cancelled" }
  | { status: "ready"; brief: WikiSynthesisBrief };

export abstract class WikiSynthesisBriefSource {
  abstract brief(
    crawl: Pick<WikiCrawlRecord, "id" | "payer" | "locale">,
    giveUp: boolean,
  ): Promise<WikiSynthesisBriefState>;
}
