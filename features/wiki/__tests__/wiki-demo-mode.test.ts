import { describe, expect, it } from "vitest";

import { isAllowedInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

import { ApproveWikiPageProposalInteractor } from "../approve-wiki-page-proposal.interactor";
import { CreateWikiPagesInteractor } from "../create-wiki-pages.interactor";
import { DeleteWikiPageInteractor } from "../delete-wiki-page.interactor";
import { GetWikiCatalogInteractor } from "../get-wiki-catalog.interactor";
import { GetWikiGraphInteractor } from "../get-wiki-graph.interactor";
import { GetWikiHomepageSetupStateInteractor } from "../get-wiki-homepage-setup-state.interactor";
import { GetWikiLinkReportInteractor } from "../get-wiki-link-report.interactor";
import { GetWikiPageLinksInteractor } from "../get-wiki-page-links.interactor";
import { GetWikiPageProposalsInteractor } from "../get-wiki-page-proposals.interactor";
import { GetWikiPageInteractor } from "../get-wiki-page.interactor";
import { GetWikiPagesInteractor } from "../get-wiki-pages.interactor";
import { PinWikiGraphNodeInteractor } from "../pin-wiki-graph-node.interactor";
import { RejectWikiPageProposalInteractor } from "../reject-wiki-page-proposal.interactor";
import { SearchWikiPagesInteractor } from "../search-wiki-pages.interactor";
import { StartWikiHomepageSetupInteractor } from "../start-wiki-homepage-setup.interactor";
import { UpdateWikiPageInteractor } from "../update-wiki-page.interactor";

describe("Wiki demo-mode policy", () => {
  it("allows every read while keeping every write blocked", () => {
    expect(isAllowedInDemoMode(GetWikiPagesInteractor)).toBe(true);
    expect(isAllowedInDemoMode(GetWikiPageInteractor)).toBe(true);
    expect(isAllowedInDemoMode(SearchWikiPagesInteractor)).toBe(true);
    expect(isAllowedInDemoMode(GetWikiCatalogInteractor)).toBe(true);
    expect(isAllowedInDemoMode(GetWikiHomepageSetupStateInteractor)).toBe(true);
    expect(isAllowedInDemoMode(GetWikiGraphInteractor)).toBe(true);
    expect(isAllowedInDemoMode(GetWikiPageLinksInteractor)).toBe(true);
    expect(isAllowedInDemoMode(GetWikiLinkReportInteractor)).toBe(true);
    expect(isAllowedInDemoMode(GetWikiPageProposalsInteractor)).toBe(true);

    expect(isAllowedInDemoMode(CreateWikiPagesInteractor)).toBe(false);
    expect(isAllowedInDemoMode(UpdateWikiPageInteractor)).toBe(false);
    expect(isAllowedInDemoMode(DeleteWikiPageInteractor)).toBe(false);
    expect(isAllowedInDemoMode(StartWikiHomepageSetupInteractor)).toBe(false);
    expect(isAllowedInDemoMode(PinWikiGraphNodeInteractor)).toBe(false);
    expect(isAllowedInDemoMode(ApproveWikiPageProposalInteractor)).toBe(false);
    expect(isAllowedInDemoMode(RejectWikiPageProposalInteractor)).toBe(false);
  });
});
