ALTER TABLE "AgentTurnRequest"
ADD COLUMN "wikiHomepageSetupDomain" TEXT;

ALTER TABLE "AgentTurnRequest"
ADD CONSTRAINT "AgentTurnRequest_wiki_homepage_setup_domain_bounded"
CHECK ("wikiHomepageSetupDomain" IS NULL OR length("wikiHomepageSetupDomain") <= 253);
