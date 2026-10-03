import type { WikiSynthesisRole } from "./wiki-synthesis.schema";

export const WIKI_SYNTHESIS_OWN_QUOTE_INSTRUCTION =
  "Each factual claim must follow that candidate's own selected evidence quotations. A section uses only its own sections.evidence; page metadata may use that page's flattened section evidence. Corresponding canonical source passages provide attribution and nearby conditions and limitations for those selected quotations, not permission to add further facts absent from them.";

export const WIKI_SYNTHESIS_PLAN_INSTRUCTION = [
  "You plan a company Knowledge Base from a crawled public website. The Knowledge Base helps a sales assistant answer questions about this company accurately.",
  "Use only the inventory: each source has a key, URL, title, headings and a few representative passages.",
  "Plan one page per distinct offering (product, service or package) the website evidences, citing the one to six sources that describe it. Combine translations of the same page. Do not plan an offering that is only a navigation label.",
  "Plan procedures only when a source describes concrete customer-facing steps.",
  "Sources marked imported are already in the Knowledge Base word for word; cite them only when another page needs them.",
  "Write titles in the Knowledge Base language, unique and specific.",
].join(" ");

export const WIKI_SYNTHESIS_INITIAL_PLAN_INSTRUCTION =
  "Also plan exactly one page for each foundation role, each citing the most relevant one to six sources: company_overview, customers_and_use_cases (customer types, industries, cases), sales_messaging (value propositions, differentiators and frequently asked questions), voice_and_tone (how the company writes, observed from its own wording). End with exactly one operating_guide citing the homepage and contact or about sources.";

export const WIKI_SYNTHESIS_EXTEND_PLAN_INSTRUCTION =
  "Plan offering and procedure pages only; the Knowledge Base already has its foundations and Operating Guide.";

export const WIKI_SYNTHESIS_PAGE_INSTRUCTION = [
  "You write one Knowledge Base page from the cited source text only.",
  "Choose supporting evidence before composing content. For each intended claim, first copy a complete, exact sentence or contiguous passage from the source text into evidence, preserving its spelling, punctuation and whitespace. Then write one conservative paraphrase that keeps its attribution, scope, conditions and limitations. If no passage supports the entire claim, narrow or omit it.",
  "Report security, compliance, savings, accuracy and customer outcomes as attributed public source claims, not independently verified assurances. Keep the original possibility, degree of risk reduction, conditions, exceptions, approximate figures and whether work is ongoing, proposed or completed. A passage describing a threat does not prove the product implements a countermeasure. Do not infer technical inputs, integrations, APIs, customer roles, storage design, guarantees or internal rules from general industry practice.",
  "Give each customer case or outcome its own section and supporting passage. Keep delivered results separate from ongoing work and partial applicability.",
  "A narrower paraphrase is safer than a broader claim. Present support stays present support; a completed result requires an explicit completed result in the cited passage.",
  "Write headings, content and gaps in the Knowledge Base language. Translate source-language examples and label them as translations; only proper names and technical identifiers keep their original spelling. Raw quotations belong only in evidence.",
  "Unknown internal rules, approvals, qualification criteria, prices or handover steps become neutral questions in gaps. Never invent a policy, and label any writing or sales recommendation as a recommendation.",
].join(" ");

const ROLE_GUIDANCE: Record<WikiSynthesisRole, string> = {
  company_overview:
    "Explain the business, evidenced audiences, problems it solves and stated outcomes; retain qualifications on expertise and numerical claims. Do not substitute registry, imprint or contact details for a business overview.",
  customers_and_use_cases:
    "Organize evidenced audiences and concrete use cases by situation or problem, relevant offering and stated outcome. Name customers only when sources name them. Distinguish published examples from completed customer engagements and preserve ongoing or proposed project status. Unknown customer or qualification facts belong in gaps.",
  sales_messaging:
    "Preserve evidenced value propositions, differentiators and limitations. Include actual FAQ questions with faithful answers where supported; a list of FAQ topics is insufficient. Label suggested sales wording as source-based recommendations, and do not turn qualified capabilities into guarantees.",
  voice_and_tone:
    "Describe observable formality, form of address, terminology, sentence style and treatment of benefits or technical details, each backed by a brief example from customer-facing text. Label these as observations of the public website, not an approved brand policy, and keep writing recommendations separate from observations.",
  offering:
    "Describe this offering: what it is, who it is for, how it works, its scope, integrations, conditions and limitations, and any documented customer cases.",
  procedure:
    "Describe only the customer-facing steps the sources document, as numbered steps, one per line, and set whenToUse to a third-person trigger in the customer's words. Contact details alone are not a procedure.",
  operating_guide:
    "Write the Operating Guide for the sales assistant, under 2,000 characters: how to communicate, which Knowledge Base pages to consult (they are linked automatically), and public contact routes the sources show. A rule is confirmed only when a cited source states it. Put unknown internal rules (qualification, follow-up ownership, offer and discount approval, won-deal handover) into gaps as questions, and never appoint an approver from a job title.",
};

export function wikiSynthesisRoleGuidance(role: WikiSynthesisRole): string {
  return ROLE_GUIDANCE[role];
}
