import { SYNTHETIC_AVATAR_PATHS } from "../avatars";

export type PersonKey = "amin" | "anna" | "clara" | "jonas" | "leon" | "marco" | "rashid" | "sophie" | "yasmin";

export type SenderKey = PersonKey | "self";

export type MessageFixture = {
  sender: SenderKey;
  text: string;
  reaction?: { sender: SenderKey; value: string };
};

export type ThreadFixture = {
  account: "google" | "linkedin" | "whatsapp";
  latestMinutesAgo: number;
  messages: MessageFixture[];
  name: string | null;
  participants: PersonKey[];
  state: "open" | "unread";
  subject: string | null;
  type: "single" | "group";
};

export const people: Record<
  PersonKey,
  {
    avatarPath: string;
    contactIndex: number | null;
    displayName: string;
    email?: string;
    headline?: string;
    linkedin?: string;
    occupation?: string;
    phone?: string;
    profileUrl?: string;
  }
> = {
  anna: {
    avatarPath: SYNTHETIC_AVATAR_PATHS.annaMueller,
    contactIndex: 22,
    displayName: "Anna Müller",
    email: "anna.mueller@roche.example",
    occupation: "Program Manager at Roche",
  },
  amin: {
    avatarPath: SYNTHETIC_AVATAR_PATHS.aminHassan,
    contactIndex: 7,
    displayName: "Amin Hassan",
    email: "amin.hassan@tui.example",
    occupation: "Customer Experience Lead at TUI",
  },
  clara: {
    avatarPath: SYNTHETIC_AVATAR_PATHS.claraNeumann,
    contactIndex: null,
    displayName: "Clara Neumann",
    email: "clara.neumann@partner.demo.example",
    occupation: "Customer Operations Consultant",
  },
  leon: {
    avatarPath: SYNTHETIC_AVATAR_PATHS.leonBecker,
    contactIndex: 0,
    displayName: "Leon Becker",
    headline: "Leading practical IT transformation",
    linkedin: "leon-becker.linkedin.example",
    occupation: "IT Transformation Lead at BMW",
    profileUrl: "https://linkedin.example/in/leon-becker",
  },
  sophie: {
    avatarPath: SYNTHETIC_AVATAR_PATHS.sophieWagner,
    contactIndex: 19,
    displayName: "Sophie Wagner",
    occupation: "Sales Operations Manager at BMW",
    phone: "+12025550119",
  },
  jonas: {
    avatarPath: SYNTHETIC_AVATAR_PATHS.jonasWeber,
    contactIndex: 6,
    displayName: "Jonas Weber",
    occupation: "Product Lead at Continental",
    phone: "+12025550106",
  },
  marco: {
    avatarPath: SYNTHETIC_AVATAR_PATHS.marcoSilva,
    contactIndex: null,
    displayName: "Marco Silva",
    occupation: "Implementation Partner",
    phone: "+12025550127",
  },
  rashid: {
    avatarPath: SYNTHETIC_AVATAR_PATHS.rashidMalik,
    contactIndex: 26,
    displayName: "Rashid Malik",
    headline: "Turning digital strategy into measurable change",
    linkedin: "rashid-malik.linkedin.example",
    occupation: "Digital Strategy Manager at KPMG",
    profileUrl: "https://linkedin.example/in/rashid-malik",
  },
  yasmin: {
    avatarPath: SYNTHETIC_AVATAR_PATHS.yasminFarouk,
    contactIndex: 23,
    displayName: "Yasmin Farouk",
    email: "yasmin.farouk@asml.example",
    occupation: "Partner Manager at ASML",
  },
};

export const threads: ThreadFixture[] = [
  {
    account: "google",
    latestMinutesAgo: 7,
    messages: [
      {
        sender: "anna",
        text: "Hi Max, the team loved the walkthrough. Could you send the revised rollout plan with the two pilot milestones?",
      },
      {
        sender: "self",
        text: "Absolutely. I tightened the milestones and added owners for onboarding, data import, and the launch review.",
      },
      {
        sender: "anna",
        text: "Perfect. Our operations lead can join the planning call as well. Tuesday morning would work best for us.",
      },
      {
        sender: "self",
        text: "Great — I have held Tuesday at 10:00 and included the updated rollout brief. Looking forward to it.",
      },
      {
        sender: "anna",
        text: "The invite is in and both pilot owners confirmed. I will bring the open data questions so we can close them on Tuesday.",
      },
    ],
    name: null,
    participants: ["anna"],
    state: "open",
    subject: "Next steps for the Roche rollout",
    type: "single",
  },
  {
    account: "google",
    latestMinutesAgo: 32,
    messages: [
      {
        sender: "self",
        text: "Thanks again for the customer operations roundtable. I captured the current journey, the handoff gaps, and the three success metrics we discussed.",
      },
      {
        sender: "anna",
        text: "The summary is spot on. I added a note about the support team so we do not miss their workflow.",
      },
      {
        sender: "self",
        text: "Good catch. I have added support as a separate workstream and moved the measurement review into week two.",
      },
      {
        sender: "amin",
        text: "I added the measurement goals from the TUI team. The 24-hour response target is the one leadership cares about most.",
      },
      {
        sender: "self",
        text: "Thanks, Amin. I added the metric and left one open item for the partner escalation path.",
      },
      {
        sender: "clara",
        text: "I have filled that in: the service desk owns first response, and I am the escalation contact for the pilot.",
      },
    ],
    name: "Customer operations working group",
    participants: ["anna", "amin", "clara"],
    state: "unread",
    subject: "Customer operations roundtable",
    type: "group",
  },
  {
    account: "google",
    latestMinutesAgo: 70,
    messages: [
      {
        sender: "yasmin",
        text: "I reviewed the retainer draft. The scope is clear; I only have two small comments on the renewal language.",
      },
      {
        sender: "self",
        text: "Thank you. I accepted the wording change on notice periods and clarified that quarterly planning is included.",
      },
      {
        sender: "yasmin",
        text: "That resolves both points. I will route the clean version for signature this afternoon.",
      },
      {
        sender: "self",
        text: "Excellent. I will keep Friday open for the kickoff and send the working agenda once the signature is in.",
      },
      {
        sender: "yasmin",
        text: "The signed copy just came back. Friday is confirmed, and I have invited the implementation leads.",
      },
    ],
    name: null,
    participants: ["yasmin"],
    state: "open",
    subject: "ASML retainer — contract review",
    type: "single",
  },
  {
    account: "linkedin",
    latestMinutesAgo: 180,
    messages: [
      {
        sender: "leon",
        text: "Thanks for connecting. Your implementation approach looks refreshingly practical.",
      },
      {
        sender: "self",
        text: "Appreciate that, Leon. We try to get one useful workflow live quickly, then expand from evidence.",
      },
      {
        sender: "leon",
        text: "That fits our situation. The migration checklist is the main thing holding up our internal approval.",
      },
      {
        sender: "self",
        text: "I have a concise checklist for ownership, field mapping, validation, and cutover. I will share it before our call.",
        reaction: { sender: "leon", value: "👍" },
      },
      {
        sender: "leon",
        text: "I ran the checklist through internal review and it cleared the open questions. We can use the call for sequencing.",
      },
    ],
    name: "Leon Becker",
    participants: ["leon"],
    state: "open",
    subject: null,
    type: "single",
  },
  {
    account: "linkedin",
    latestMinutesAgo: 24 * 60,
    messages: [
      {
        sender: "self",
        text: "Hi Rashid — I kept thinking about the pilot pause and the adoption concern you mentioned.",
      },
      {
        sender: "rashid",
        text: "Good timing. We simplified the pilot group and now have a committed regional sponsor.",
      },
      {
        sender: "self",
        text: "That changes the equation. A focused pilot with one sponsor and a weekly feedback loop is much easier to de-risk.",
      },
      {
        sender: "rashid",
        text: "Agreed. Send me the two-week version and I will put it on Thursday's steering agenda.",
      },
      {
        sender: "rashid",
        text: "The steering slot is confirmed for Thursday at 15:30. I will circulate the two-week option before then.",
      },
    ],
    name: "Rashid Malik",
    participants: ["rashid"],
    state: "unread",
    subject: null,
    type: "single",
  },
  {
    account: "whatsapp",
    latestMinutesAgo: 2 * 24 * 60,
    messages: [
      {
        sender: "sophie",
        text: "Morning! Are we still on for the BMW kickoff at 14:00?",
      },
      {
        sender: "self",
        text: "Yes — agenda is ready and the workspace is set up. I will join five minutes early.",
      },
      {
        sender: "sophie",
        text: "Perfect. I invited our operations lead so decisions can happen in the room.",
      },
      {
        sender: "self",
        text: "Smart. I will start with the open decisions, then we can use the remaining time for the delivery plan.",
        reaction: { sender: "sophie", value: "🙌" },
      },
      {
        sender: "sophie",
        text: "That agenda worked perfectly. We left the kickoff with owners for every decision and no open blockers.",
      },
    ],
    name: "Sophie Wagner",
    participants: ["sophie"],
    state: "open",
    subject: null,
    type: "single",
  },
  {
    account: "whatsapp",
    latestMinutesAgo: 4 * 24 * 60,
    messages: [
      {
        sender: "sophie",
        text: "I created this group for quick rollout decisions. Jonas owns product, and Marco coordinates implementation.",
      },
      {
        sender: "jonas",
        text: "Hi all 👋 The first test cohort is confirmed and ready for access next week.",
      },
      {
        sender: "self",
        text: "Great news. I added a lightweight readiness check so every cohort starts from the same baseline.",
      },
      {
        sender: "jonas",
        text: "Looks good. I have completed the product section and tagged the two items that need a decision.",
        reaction: { sender: "self", value: "✅" },
      },
      {
        sender: "marco",
        text: "Device provisioning is on track. Two testers still need access, and I added their names to the readiness check.",
      },
    ],
    name: "Mobility rollout working group",
    participants: ["sophie", "jonas", "marco"],
    state: "unread",
    subject: null,
    type: "group",
  },
  {
    account: "google",
    latestMinutesAgo: 5 * 24 * 60,
    messages: [
      {
        sender: "amin",
        text: "Hi Max, I pulled the first response-time baseline for the service journey. The regional split is more useful than the overall average.",
      },
      {
        sender: "self",
        text: "Agreed. I will put the regional view first and keep the overall number as context for leadership.",
      },
      {
        sender: "amin",
        text: "Could we also separate partner escalations? They are only eight percent of volume but account for most of the long tail.",
      },
      {
        sender: "self",
        text: "Yes. I added a partner segment and a note explaining where ownership changes during escalation.",
      },
      {
        sender: "amin",
        text: "Excellent. That gives us a clean baseline for Friday's customer experience review.",
      },
    ],
    name: null,
    participants: ["amin"],
    state: "open",
    subject: "TUI response-time baseline",
    type: "single",
  },
  {
    account: "google",
    latestMinutesAgo: 6 * 24 * 60,
    messages: [
      {
        sender: "self",
        text: "Hi Anna, I completed the first pass of the account and contact field mapping. The only ambiguity is the regional owner field.",
      },
      {
        sender: "anna",
        text: "The regional owner should come from the active territory assignment, not the legacy account owner.",
      },
      {
        sender: "self",
        text: "Understood. I updated the rule and added a fallback for records without an active territory assignment.",
      },
      {
        sender: "anna",
        text: "I checked a sample of twenty records and the fallback behaves exactly as expected.",
      },
      {
        sender: "self",
        text: "Great. I marked the mapping ready for the dry run and attached the validation checklist.",
      },
    ],
    name: null,
    participants: ["anna"],
    state: "unread",
    subject: "Roche data mapping review",
    type: "single",
  },
  {
    account: "google",
    latestMinutesAgo: 8 * 24 * 60,
    messages: [
      {
        sender: "anna",
        text: "I opened this thread for the pilot steering group. The sponsor wants a concise weekly view of progress, risks, and decisions.",
      },
      {
        sender: "amin",
        text: "I can own the customer experience metric and provide the regional comparison each Thursday.",
      },
      {
        sender: "self",
        text: "Perfect. I will consolidate that with delivery progress and keep the report to one page.",
      },
      {
        sender: "clara",
        text: "I will add the partner escalations and flag anything that needs a sponsor decision before the meeting.",
      },
      {
        sender: "self",
        text: "Thanks all. The first steering update is drafted and each section now has a clear owner.",
      },
    ],
    name: "Pilot steering group",
    participants: ["anna", "amin", "clara"],
    state: "open",
    subject: "Weekly pilot steering update",
    type: "group",
  },
  {
    account: "google",
    latestMinutesAgo: 10 * 24 * 60,
    messages: [
      {
        sender: "yasmin",
        text: "The partner team reviewed the enablement outline. They would like one practical customer scenario in every module.",
      },
      {
        sender: "self",
        text: "That makes sense. I will anchor the modules around qualification, handoff, and the first quarterly review.",
      },
      {
        sender: "yasmin",
        text: "Those scenarios cover the full journey. Could the handoff module include a short role-play exercise?",
      },
      {
        sender: "self",
        text: "Added. It uses a realistic account brief and gives each participant a clear role and outcome.",
      },
      {
        sender: "yasmin",
        text: "Looks strong. I have approved the outline and reserved the partner learning slot for next Wednesday.",
      },
    ],
    name: null,
    participants: ["yasmin"],
    state: "open",
    subject: "ASML partner enablement materials",
    type: "single",
  },
  {
    account: "google",
    latestMinutesAgo: 12 * 24 * 60,
    messages: [
      {
        sender: "self",
        text: "Amin, I mapped the current customer handoff from sales through service. Two approvals are creating most of the delay.",
      },
      {
        sender: "amin",
        text: "That matches what the teams reported. One approval is regulatory; the other is a legacy internal check.",
      },
      {
        sender: "self",
        text: "I kept the regulatory approval and replaced the internal check with an automated completeness rule.",
      },
      {
        sender: "amin",
        text: "The operations lead tested the new path and it removes almost a full day without changing compliance coverage.",
      },
      {
        sender: "self",
        text: "Excellent result. I documented the before-and-after flow so we can include it in the pilot readout.",
      },
    ],
    name: null,
    participants: ["amin"],
    state: "unread",
    subject: "Customer handoff workflow",
    type: "single",
  },
  {
    account: "google",
    latestMinutesAgo: 15 * 24 * 60,
    messages: [
      {
        sender: "anna",
        text: "Security sent the final questionnaire. Most answers are already in the architecture note, but they need explicit retention periods.",
      },
      {
        sender: "self",
        text: "I will cross-reference the architecture note and add a retention table for customer data, logs, and backups.",
      },
      {
        sender: "anna",
        text: "Please include the deletion verification step as well. That was the only open point in the previous review.",
      },
      {
        sender: "self",
        text: "Done. The answer now covers request intake, deletion, verification, and the audit trail.",
      },
      {
        sender: "anna",
        text: "Security accepted the response without follow-up. We can close the review and proceed with the pilot access request.",
      },
    ],
    name: null,
    participants: ["anna"],
    state: "open",
    subject: "Security questionnaire follow-up",
    type: "single",
  },
  {
    account: "google",
    latestMinutesAgo: 18 * 24 * 60,
    messages: [
      {
        sender: "self",
        text: "Anna and Yasmin, here is the sponsor update draft. It leads with achieved outcomes and keeps implementation detail in the appendix.",
      },
      {
        sender: "anna",
        text: "The outcome framing is clear. I would add the response-time improvement to the opening paragraph.",
      },
      {
        sender: "yasmin",
        text: "Agreed, and the partner readiness result is worth one line because it shows the rollout can scale.",
      },
      {
        sender: "self",
        text: "Both points are now in the summary, with the evidence linked in the appendix.",
      },
      {
        sender: "anna",
        text: "Approved from my side. This is concise enough for the executive meeting and still gives us defensible detail.",
      },
    ],
    name: "Executive sponsor update",
    participants: ["anna", "yasmin"],
    state: "unread",
    subject: "Pilot outcomes for executive review",
    type: "group",
  },
  {
    account: "linkedin",
    latestMinutesAgo: 20 * 24 * 60,
    messages: [
      {
        sender: "leon",
        text: "We completed the readiness interviews. The teams understand the new workflow, but managers want a clearer escalation path.",
      },
      {
        sender: "self",
        text: "That is useful feedback. I can turn the escalation path into a one-page decision tree with named owners.",
      },
      {
        sender: "leon",
        text: "Please do. The strongest version would include one example for a data issue and one for a process issue.",
      },
      {
        sender: "self",
        text: "I added both examples and a response-time expectation for each escalation level.",
      },
      {
        sender: "leon",
        text: "This is exactly what the managers asked for. I will include it in the change readiness pack.",
      },
    ],
    name: "Leon Becker",
    participants: ["leon"],
    state: "open",
    subject: null,
    type: "single",
  },
  {
    account: "linkedin",
    latestMinutesAgo: 22 * 24 * 60,
    messages: [
      {
        sender: "self",
        text: "Rashid, I drafted the adoption scorecard around activation, weekly use, and completed customer handoffs.",
      },
      {
        sender: "rashid",
        text: "Good set of measures. Can we distinguish people who opened the workspace from people who completed meaningful work?",
      },
      {
        sender: "self",
        text: "Yes. Activation now requires a completed customer action, while workspace access is reported separately.",
      },
      {
        sender: "rashid",
        text: "That makes the scorecard much more credible. I also like the weekly trend instead of a single launch number.",
      },
      {
        sender: "self",
        text: "Great. I will use this version for the steering baseline and annotate any cohort changes.",
      },
    ],
    name: "Rashid Malik",
    participants: ["rashid"],
    state: "unread",
    subject: null,
    type: "single",
  },
  {
    account: "linkedin",
    latestMinutesAgo: 25 * 24 * 60,
    messages: [
      {
        sender: "leon",
        text: "The transformation forum asked whether we could share the practical side of the migration at their next session.",
      },
      {
        sender: "self",
        text: "Happy to. A format built around decisions, mistakes, and the final checklist would be more useful than a product presentation.",
      },
      {
        sender: "leon",
        text: "Exactly. They have a forty-minute slot and prefer a conversation over formal slides.",
      },
      {
        sender: "self",
        text: "I will bring five decision points and leave half the time for questions from the group.",
      },
      {
        sender: "leon",
        text: "Confirmed for the 18th. I sent the framing to the moderator and they are excited about the practical angle.",
      },
    ],
    name: "Leon Becker",
    participants: ["leon"],
    state: "open",
    subject: null,
    type: "single",
  },
  {
    account: "linkedin",
    latestMinutesAgo: 28 * 24 * 60,
    messages: [
      {
        sender: "rashid",
        text: "The finance sponsor asked for a shorter business case with explicit assumptions instead of a five-year forecast.",
      },
      {
        sender: "self",
        text: "That is a better fit for the pilot. I will show the current handling cost, expected reduction, and the break-even range.",
      },
      {
        sender: "rashid",
        text: "Please separate measured pilot results from assumptions we still need to validate.",
      },
      {
        sender: "self",
        text: "Done. Measured results are in green, open assumptions are clearly labeled, and each has an owner.",
      },
      {
        sender: "rashid",
        text: "Finance approved this framing for the investment discussion. Much stronger than the original forecast.",
      },
    ],
    name: "Rashid Malik",
    participants: ["rashid"],
    state: "open",
    subject: null,
    type: "single",
  },
  {
    account: "linkedin",
    latestMinutesAgo: 32 * 24 * 60,
    messages: [
      {
        sender: "leon",
        text: "I introduced Rashid because his adoption program is facing many of the same sequencing questions we solved last quarter.",
      },
      {
        sender: "rashid",
        text: "Thanks, Leon. The biggest question for us is how much process to standardize before the first regional pilot.",
      },
      {
        sender: "self",
        text: "I would standardize ownership and success measures first, then let the pilot expose which detailed steps truly need consistency.",
      },
      {
        sender: "leon",
        text: "That was our experience too. Locking every exception up front slowed us down without reducing risk.",
      },
      {
        sender: "rashid",
        text: "Very helpful. I am taking this approach into our design workshop next week.",
      },
    ],
    name: "Transformation leaders circle",
    participants: ["leon", "rashid"],
    state: "unread",
    subject: null,
    type: "group",
  },
  {
    account: "linkedin",
    latestMinutesAgo: 36 * 24 * 60,
    messages: [
      {
        sender: "self",
        text: "Leon, good meeting you at the operations conference. Your point about measuring handoff quality stayed with me.",
      },
      {
        sender: "leon",
        text: "Likewise. Teams often optimize speed while missing whether the next owner received enough context to act.",
      },
      {
        sender: "self",
        text: "We use a simple completeness measure alongside response time. I can send the template if it would help.",
      },
      {
        sender: "leon",
        text: "Please do. We are revising our operational scorecard and that balance is exactly what it needs.",
      },
      {
        sender: "self",
        text: "Sent. I included the scoring rubric and an example from a rollout review.",
      },
    ],
    name: "Leon Becker",
    participants: ["leon"],
    state: "open",
    subject: null,
    type: "single",
  },
  {
    account: "whatsapp",
    latestMinutesAgo: 40 * 24 * 60,
    messages: [
      {
        sender: "jonas",
        text: "The first test cohort completed onboarding. Nine of ten people finished without help, and one needed a browser permission reset.",
      },
      {
        sender: "self",
        text: "That is a strong start. I will add the permission check to the onboarding guide before cohort two.",
      },
      {
        sender: "jonas",
        text: "Good idea. The workflow itself was clear, and the cohort completed the sample task faster than expected.",
      },
      {
        sender: "self",
        text: "Excellent. Let us keep the sample task unchanged so we can compare the next cohort fairly.",
      },
      {
        sender: "jonas",
        text: "Agreed. Cohort two is scheduled for Monday with the updated permission step.",
      },
    ],
    name: "Jonas Weber",
    participants: ["jonas"],
    state: "open",
    subject: null,
    type: "single",
  },
  {
    account: "whatsapp",
    latestMinutesAgo: 44 * 24 * 60,
    messages: [
      {
        sender: "sophie",
        text: "Quick pricing question: should the launch support be a fixed package or tracked against actual days?",
      },
      {
        sender: "self",
        text: "For this rollout I recommend a fixed package with a clear scope and an agreed day rate for anything outside it.",
      },
      {
        sender: "sophie",
        text: "That will be easier for procurement. Can you send the included activities in one short list?",
      },
      {
        sender: "self",
        text: "Sent: launch monitoring, daily triage, two enablement sessions, and the final stabilization review.",
      },
      {
        sender: "sophie",
        text: "Perfect. Procurement approved the structure and is preparing the order now.",
      },
    ],
    name: "Sophie Wagner",
    participants: ["sophie"],
    state: "unread",
    subject: null,
    type: "single",
  },
  {
    account: "whatsapp",
    latestMinutesAgo: 48 * 24 * 60,
    messages: [
      {
        sender: "sophie",
        text: "Marco and I are checking the final rollout readiness. The workspace is ready, but two devices are still in transit.",
      },
      {
        sender: "marco",
        text: "Both devices arrive tomorrow morning. I can provision them before the afternoon training session.",
      },
      {
        sender: "self",
        text: "That timing works. I will keep the two users in the second training group so nobody waits for access.",
      },
      {
        sender: "sophie",
        text: "Good call. Everything else on the readiness list is green.",
      },
      {
        sender: "self",
        text: "Great. I marked the launch ready with device delivery as the only monitored item.",
      },
    ],
    name: "Launch readiness team",
    participants: ["sophie", "marco"],
    state: "open",
    subject: null,
    type: "group",
  },
  {
    account: "whatsapp",
    latestMinutesAgo: 52 * 24 * 60,
    messages: [
      {
        sender: "jonas",
        text: "We found the source of the integration delay. One upstream system sends the account code with a regional prefix.",
      },
      {
        sender: "self",
        text: "Good catch. We can normalize that prefix before matching without changing the source system.",
      },
      {
        sender: "jonas",
        text: "I tested the normalization rule against last month's sample and every account matched correctly.",
      },
      {
        sender: "self",
        text: "Excellent. I added the rule to the integration notes and included a warning for unknown prefixes.",
      },
      {
        sender: "jonas",
        text: "The overnight run completed cleanly. We can close the blocker and continue with validation.",
      },
    ],
    name: "Jonas Weber",
    participants: ["jonas"],
    state: "unread",
    subject: null,
    type: "single",
  },
  {
    account: "whatsapp",
    latestMinutesAgo: 58 * 24 * 60,
    messages: [
      {
        sender: "self",
        text: "Good morning Sophie — launch monitoring is active and all scheduled jobs completed successfully.",
      },
      {
        sender: "sophie",
        text: "Great start. The first users are in and the support channel is quiet so far.",
      },
      {
        sender: "self",
        text: "I will send a short health update at noon and keep an eye on the first customer handoffs.",
      },
      {
        sender: "sophie",
        text: "The first three handoffs are complete and the operations team says the context is much clearer than before.",
      },
      {
        sender: "self",
        text: "Fantastic. I captured that feedback in the launch log and everything remains green.",
      },
    ],
    name: "Sophie Wagner",
    participants: ["sophie"],
    state: "open",
    subject: null,
    type: "single",
  },
];
