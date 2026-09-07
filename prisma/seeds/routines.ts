import type { SeedContext } from "./context";

import type { Prisma } from "@/generated/prisma";

import {
  AgentConversationOrigin,
  AgentTurnTerminalCode,
  RoutineRunStatus,
  RoutineTriggerKind,
} from "@/generated/prisma";
import { DomainEvent } from "@/features/event/domain-events";

import { fixtureId, upsertFixturesById } from "./helpers";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const ROUTINE_TIMEZONE = "Europe/Berlin";

type SeedOwner = "user" | "sofiaRossiUser" | "elenaHoffmannUser";

type SeedTrigger =
  | { kind: "schedule"; cron: string; nextRunInHours: number }
  | { kind: "event"; events: DomainEvent[]; changedFields?: string[]; debounceSeconds: number };

type SeedRun = {
  status: RoutineRunStatus;
  startedHoursAgo: number;
  durationSeconds: number;
  chargedCredits: number;
  summary?: string;
  error?: string;
};

const RUN_TRANSCRIPT_OPENER: Record<string, string> = {
  schedule: "Scheduled run started.",
  event: "Triggered by a record change.",
};

const runFailureNote = (error: string) =>
  error === "providerUnavailable"
    ? "I could not reach the model provider on this attempt, so I stopped before reading or changing anything. Nothing was modified. The next scheduled run will pick this up."
    : "I stopped before doing any work because this run would have exceeded the credit ceiling set on the routine. Nothing was read or changed.";

export type SeedRoutine = {
  index: number;
  owner: SeedOwner;
  name: string;
  prompt: string;
  enabled: boolean;
  maxCreditsPerRun: number;
  maxRunsPerHour: number;
  trigger: SeedTrigger;
  runs: SeedRun[];
};

export const SYNTHETIC_ROUTINES: SeedRoutine[] = [
  {
    index: 1,
    owner: "user",
    name: "Monday weighted pipeline digest",
    prompt:
      'Every Monday morning, produce the weighted pipeline digest for the sales team. This is a read-only report: create nothing, update nothing, link nothing, delete nothing, and never call send_email or send_chat_message.\n\nSteps:\n1. get_record_schema for entity "deal". Read the single-select column labelled "Status": note its column id, and for each option its value (a uuid), its label (Open, Won, Lost, Abandoned) and its weight. Read these fresh every run; never reuse ids from a previous run. Also note the id of the "Project Period" dateRange column.\n2. list_records for entity "deal" with filters [{ field: "<Status column id>", operator: "equals", value: "<Open option value>" }], sortDescriptor { field: "weightedValue", direction: "desc" }, pageSize 100. Read `total` and the `sums` block: sums covers every matching deal, not just this page, so never add the items up yourself.\n3. Repeat step 2 once per remaining Status option (Won, Lost, Abandoned) to get each one\'s count and totalValue. Report every option you found, so the counts add up to the whole deal list.\n4. list_records for deals again with filters [ Status equals Open, { field: "contactIds", operator: "hasNone" } ]. These are the open deals with no contact attached: coverage gaps, not errors.\n5. get_records for the open deals from step 2 (entity "deal", one item per id) to read the linked organization, the "Project Period" range, and the linked services with their quantities and amounts.\n\nThen write the digest in plain English, under 400 words:\n- Headline: how many deals are open, their total value, and their weighted value. Say which weight you applied to Open (read it from the schema, do not assume) and that Won counts at its own weight.\n- One line per open deal, ranked by weighted value: name, organization, total value, weighted value, Project Period.\n- Timing: for each open deal whose Project Period end date is before today, say how many days it is overdue, worst first. If every open deal is overdue, say so plainly in one sentence rather than repeating the list.\n- Coverage: the open deals from step 4 that have no linked contact, by name.\n- Context: the count and total value of Won, Lost and Abandoned deals, and the single largest service line (service name, quantity, amount) inside the open pipeline.\n\nIn this demo workspace the open deals should be "Data & Analytics Transformation" (PwC), "Workplace Hardware Rollout" (Deutsche Post) and "Digital Customer Platform" (BMW). If what you find differs, report what you actually found and do not mention this expectation. Never invent a number: if `sums` or a field is missing from a response, say it is missing rather than estimating it.',
    enabled: true,
    maxCreditsPerRun: 40,
    maxRunsPerHour: 1,
    trigger: { kind: "schedule", cron: "30 7 * * 1", nextRunInHours: 6 },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 20,
        durationSeconds: 74,
        chargedCredits: 12,
        summary: "Reviewed 3 open deals and filed 1 follow-up task.",
      },
    ],
  },
  {
    index: 2,
    owner: "sofiaRossiUser",
    name: "Daily sweep: stale open deals get a follow-up task",
    prompt:
      'Each morning, sweep the open deal pipeline for hygiene problems and prepare the follow-up work. You may create tasks, append notes to deals, and link an existing contact to a deal. Do not delete anything, do not change deal values, deal status or service quantities, and never send an email or a chat message.\n\n1. Call get_record_schema for deal and for task. Read: the deal "Status" single-select column id and its "Open" option id; the deal "Project Period" dateRange column id; the task "Status" column id with its "Open" option id; the task "Priority" column id with its "Medium" and "High" option ids. Never guess a column id or an option id; filters and custom field values must use the ids the schema returns.\n2. Call list_records with entity "deal", pageSize 100, filters [{ field: <deal Status column id>, operator: "equals", value: <Open option id> }]. Keep each deal\'s totalValue from the result.\n3. Call get_records for those deals (entity "deal", include "withNotes"). Each record gives updatedAt, customFieldValues, and the linked organizations, contacts, services and tasks.\n\nFlag a deal when any of these is true:\n- updatedAt is more than 21 days ago;\n- its Project Period end date is before today, or the Project Period is missing;\n- it has no linked contact.\n\nFor each flagged deal, in this order:\na. If it has no linked contact but has a linked organization, call list_records with entity "contact", pageSize 5, filters [{ field: "organizationIds", operator: "in", value: [<organization id>] }]. Link at most one returned contact using manage_record_links (action "add", entity "deal", sourceId <deal id>, relation "contacts", ids [<contact id>]). If that organization returns no contact, link nothing and say so in the task notes.\nb. The deal\'s linked tasks arrive with id, name and type only, and no status. If one of them is named "Pipeline review: <deal name>", stop here and move to the next deal: the follow-up already exists and this routine must never create a second one. Do not fetch those tasks just to read their status.\nc. Otherwise call create_tasks with a single task: name "Pipeline review: <deal name>"; notes stating each failed check with the number behind it (days since last update, Project Period end date, number of linked contacts, totalValue) plus the contact you linked in step a, if any; dealIds [<deal id>]; organizationIds [<the deal\'s organization id>]; customFieldValues setting the task Status column to Open and the task Priority column to High when totalValue is above 100000 and Medium otherwise.\nd. Call update_record_notes (entity "deal", mode "append", one item) adding a single line: "Pipeline hygiene <today\'s date>: <the checks that failed>."\n\nFinish by reporting how many open deals you read, which you flagged and why, which contacts you linked, and which tasks you created.\n\nExpected in this workspace: the open deals are "Data & Analytics Transformation" (PwC), "Workplace Hardware Rollout" (Deutsche Post) and "Digital Customer Platform" (BMW). None of them has a linked contact and all three have a Project Period that ended earlier this year, so all three are flagged on the first run and get one task each. Later runs flag the same three deals again, because those Project Period end dates stay in the past and your own note in step d refreshes updatedAt. Step b stops each of them, so no second task and no second note is ever created. That is the routine working correctly, not something to fix.',
    enabled: true,
    maxCreditsPerRun: 45,
    maxRunsPerHour: 1,
    trigger: { kind: "schedule", cron: "0 8 * * *", nextRunInHours: 15 },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 26,
        durationSeconds: 51,
        chargedCredits: 8,
        summary: "Nothing had drifted since the last run.",
      },
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 50,
        durationSeconds: 63,
        chargedCredits: 9,
        summary: "Linked 2 records and appended 2 notes.",
      },
    ],
  },
  {
    index: 3,
    owner: "elenaHoffmannUser",
    name: "Deal service and quantity consistency check",
    prompt:
      "The service lines or the value of a deal just changed. Check that the deal's service lines are coherent, repair only a quantity of 0, and record every judgement call as a note for a human. Do not delete anything, do not change the deal's name or its Status, do not link or unlink records, and never send an email or a chat message.\n\n1. Call get_records for the changed deal, entity deal, include withNotes. That single result already carries the deal's `services` array with each line's id, name, catalogue amount and quantity on this deal, plus totalValue, totalQuantity and weightedValue and the existing notes. Do not call get_records for the individual services: a service record holds the catalogue amount, never the quantity on this deal.\n2. Call get_record_schema for entity service once, to read the \"Type\" column and its options (Service, Hardware) so you can tell hardware lines from delivery work.\n\nTreat totalValue, totalQuantity and weightedValue as read-only numbers the system maintains: Customermates recomputes them from amount times quantity and the Status option weight (Open 30 percent, Won 100 percent, Lost and Abandoned 0) on every write. Never report them as wrong and never try to correct them. Quote them only as context.\n\nCheck for:\n- A line whose quantity is 0. This is the only thing you may repair.\n- Per-seat hardware lines that no longer agree. In this workspace \"Workplace Hardware Rollout\" (Deutsche Post) is a 300 seat rollout: Laptop (Business Class) 300, Docking Station 300, Device Provisioning & Imaging 300, and the 27 inch monitor 150. The half count monitor line is by design; a laptop or docking station count that no longer matches the other 300 unit lines is not.\n- A deal whose Status is Open carrying no service line at all.\n- The same service appearing on the deal twice.\n\nTo repair a quantity of 0, call update_deals once with the full `services` array. That array REPLACES the deal's entire service set, so write back every line the deal currently has and change only the 0 to 1. Never omit a line you did not intend to remove. Make at most one such call per run.\n\nFor every other finding, change no field. Call update_record_notes, entity deal, mode append, one line per finding, dated today, naming the service and the exact numbers. Append preserves what is already there, so first re-read the notes you loaded in step 1 and skip any finding already recorded, otherwise repeated edits stack duplicate lines.\n\nFinish by reporting the deal name, its organization, its current total and weighted value, what you checked, what you changed, and what a human still has to decide. If every line is coherent, say so plainly and change nothing at all.",
    enabled: true,
    maxCreditsPerRun: 25,
    maxRunsPerHour: 4,
    trigger: {
      kind: "event",
      events: [DomainEvent.DEAL_UPDATED],
      debounceSeconds: 900,
    },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 14,
        durationSeconds: 88,
        chargedCredits: 18,
        summary: "Prepared 2 reply drafts for review.",
      },
      {
        status: RoutineRunStatus.failed,
        startedHoursAgo: 38,
        durationSeconds: 12,
        chargedCredits: 2,
        error: "providerUnavailable",
      },
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 62,
        durationSeconds: 77,
        chargedCredits: 15,
        summary: "Triaged 4 threads, 1 needed a human.",
      },
    ],
  },
  {
    index: 4,
    owner: "user",
    name: "Weekly duplicate and data-quality sweep for contacts and accounts",
    prompt:
      "Run a read-only data-quality sweep over every contact and organization in the workspace, then record the findings in one task. Change no contact and no organization during this run.\n\n1. Call get_workspace_context for the current user id (you run as the routine owner), and get_record_schema for contact and for organization to read the current custom-column ids, including the contact columns 'Phones' and 'Sales Pipeline' and the organization columns 'Type' and 'Website'. Never guess a column id or a singleSelect option id.\n2. Inventory. Call list_records for entity contact with pageSize 100, then for entity organization. Every response carries a total, so keep paging until you have covered it. list_records returns only id and name, so read values with get_records, passing all ids of one entity in a single batched call with include masterData, not one call per record.\n3. Duplicate candidates. Group contacts that share a last name, or share a first name and the same linked organization, or share an email domain with a near-identical name. Before calling anything a duplicate, compare the candidates' email identifiers, their Phones values and their linked organization. Two people at the same account are not a duplicate, and the same surname at two different accounts is usually two different people. This workspace contains collisions that need exactly that judgement: Tim Wagner and Tim Weber, Lea Bauer and Mara Bauer, and Laura Fischer, Lukas Fischer and Paul Fischer. Concluding that none of them is a duplicate is a correct result: report it as 'no duplicates found' and list the pairs you cleared. Never promote a name similarity to a duplicate just to have something to report. For organizations look for a spelling or legal-form variant of an account that already exists, for example a second record for McKinsey & Company, Deutsche Post or NRW.BANK.\n4. Missing enrichment. Use list_records filters with the noValue operators (isNull, hasUnset) against the column ids from step 1: contacts with no Phones value and contacts with no Sales Pipeline value, organizations with no Website and organizations with no Type. Also list contacts with no linked organization. If a filter is rejected, fall back to the values you already read in step 2. Where a section has no rows, write 'none' under it and move on.\n5. Orphaned records. List organizations with no linked contact, no linked deal and no linked task; a link to a workspace user does not count.\n6. Write exactly one thing this run: a single task via create_tasks named 'Data quality review, week of <ISO date>', with userIds set to the current user id from step 1, and the full findings in its notes as markdown under the headings 'Likely duplicates', 'Cleared collisions', 'Missing fields' and 'Orphaned records'. Every line names the record id and says what is wrong, so a human can act without re-running the analysis. If ten or fewer accounts are affected, pass their ids as organizationIds. Set the task Status custom column to the 'Open' option id from step 1.\n\nRank the duplicate section with the strongest evidence first: identical email address, then identical phone in E.164 form, then identical full name at the same account, then a name similarity alone. Say which tier each candidate reached.\n\nNever call delete_records, never merge or edit a contact or organization, never edit or delete a custom column, and never call send_email or send_chat_message. Merging and deletion are the operator's decision; this routine only prepares the evidence.",
    enabled: true,
    maxCreditsPerRun: 40,
    maxRunsPerHour: 1,
    trigger: { kind: "schedule", cron: "15 7 * * 1", nextRunInHours: 33 },
    runs: [
      {
        status: RoutineRunStatus.blocked,
        startedHoursAgo: 9,
        durationSeconds: 4,
        chargedCredits: 0,
        error: "creditLimitReached",
      },
    ],
  },
  {
    index: 5,
    owner: "sofiaRossiUser",
    name: "Triage every new contact: link the account, set the pipeline stage, flag duplicates",
    prompt:
      'A new contact was just created. Bring it up to the workspace standard, and hand anything ambiguous to a human instead of deciding it yourself. The contact\'s id is the entityId attribute of the routine_trigger block above.\n\n1. Read the workspace. Call get_workspace_context, then get_record_schema for contact and organization to read the current custom column ids and singleSelect option ids (Sales Pipeline, Phones). Never guess an id.\n2. Load the trigger record. Call get_records for entity contact with that entityId and include masterData, so you have firstName, lastName, the mail identifier, the Phones value, and existing organization links.\n3. Duplicate check first, before any enrichment. Call search_records with entities ["contact"], limitPerEntity 25 and searchTerm the contact\'s last name, then again with the local part of its mail identifier. search_records returns only id and name, so call get_records on each candidate that is not the trigger contact before judging. Treat a candidate as a duplicate when it has the same full name and the same linked organization, or the same Phones value in E.164 form (a leading + and digits only). Saving a contact reassigns an email identifier to its newest owner, so an exact email collision appears as the older contact having lost that address rather than two contacts sharing it; a stripped identifier is itself duplicate evidence. On a duplicate: call update_record_notes with entity contact, mode append, on the new contact, notes "Possible duplicate of <name> (<id>), review before use"; call create_tasks with one task named "Review possible duplicate contact: <name>", contactIds holding both contact ids, and the evidence in notes; then stop. Never delete or merge either record; neither is your call.\n4. If there is no duplicate, link the account. Take the domain of the mail identifier and map it: wavestone.example to Wavestone, sthree.example to SThree, hays.example to Hays, arbeitsagentur.example to Bundesagentur für Arbeit, deloitte.example to Deloitte, asml.example to ASML, kpmg.example to KPMG, deutsche-post.example to Deutsche Post, deutsche-bahn.example to Deutsche Bahn, continental.example to Continental, pwc.example to PwC, mckinsey.example to McKinsey & Company, nrw-bank.example to NRW.BANK, roche.example to Roche, bmw.example to BMW, tui.example to TUI, volkswagen.example to Volkswagen, telekom.example to Deutsche Telekom, siemens.example to Siemens. Organization records store no email domain, so this map is the only lookup; resolve the mapped name to a real record with search_records, entities ["organization"], searchTerm that name. If the contact has no organization link yet and exactly one organization matches, call manage_record_links with action add, entity contact, sourceId the contact id, relation organizations, ids the matched organization\'s uuid. If the domain maps to nothing, or the search returns none or several, link nothing and never create an organization.\n5. Fill only what is empty. If the Sales Pipeline column has no value, call update_contacts with customFieldValues setting it to the "New" option id you read in step 1. Change nothing else: leave every value a human already entered, and never touch firstName, lastName or identifiers.\n6. Close out. If the contact still has no organization link, no Phones value, or a mail domain outside the map, call create_tasks with one task named "Complete contact profile: <firstName> <lastName>", contactIds the contact id, and the open points in notes. If nothing is open, create no task and just report what you changed.\n\nAllowed writes, and nothing else: manage_record_links for the organization link, update_contacts for the Sales Pipeline column only, update_record_notes in append mode, and create_tasks. Never call delete_records; on this unattended surface its approval is auto-declined and the run only fails. Never call send_email or send_chat_message: do not contact the person, this routine only tidies the record.',
    enabled: true,
    maxCreditsPerRun: 25,
    maxRunsPerHour: 20,
    trigger: {
      kind: "event",
      events: [DomainEvent.CONTACT_CREATED],
      debounceSeconds: 600,
    },
    runs: [],
  },
  {
    index: 6,
    owner: "elenaHoffmannUser",
    name: "Complete an account profile when an organization is created or edited",
    prompt:
      "An organization was created or changed in this CRM workspace. The <routine_trigger /> block above carries entityId: that organization is the only record you may write to. Complete its profile from data that already exists in this workspace, stop as soon as nothing is missing, and never invent a fact the workspace does not contain.\n\n1. Read the schema. Call get_record_schema with entity organization, then with entity contact, then with entity task. It returns each entity's custom columns with their ids and option ids: take the ids of the organization columns 'Website' (link) and 'Type' (singleSelect), and the task 'Status' column with its 'Open' option id. Never guess a column id or an option id. Do not call manage_custom_columns; get_record_schema already carries this.\n2. Read the record. Call get_records for { entity: organization, id: <entityId>, include: masterData }. The result carries customFieldValues as columnId plus value, and the contacts already linked to this organization. If Website and Type both hold a value and at least one contact is linked, stop here and report that nothing needed doing. This early exit is what keeps the routine from reacting to its own writes.\n3. Fill Website when it is empty. Take the contact ids returned in step 2 and call get_records for them with entity contact to read their identifiers. For each identifier with provider mail, take the domain after the @. If a strict majority of the linked contacts share one domain, write it with update_organizations, customFieldValues [{ columnId: <Website id>, value: \"https://www.<domain>\" }]. Copy the domain exactly as it appears in the contact address and do not translate it into a public web domain: contacts at roche.example give https://www.roche.example. If no contact is linked, or the domains disagree, leave the column empty and carry \"Website unknown\" as an open point.\n4. Repair missing links, using the domain from step 3 or the host of an existing Website value. Call search_records with searchTerm <domain>, entities [\"contact\"], limitPerEntity 100; contact search covers identifier values, so this returns the candidates. It returns only id and name, so call get_records on those ids to read their identifiers. For every contact whose mail identifier ends in exactly @<domain> and that is not already linked here, link them in one call: manage_record_links with action add, entity organization, sourceId <entityId>, relation contacts, ids [...]. Exact domain match only, never a partial or fuzzy one. Never unlink anything: do not use action remove.\n5. Leave Type alone. Its options are 'Direct customer' and 'Affiliated company', and only a human knows which commercial relationship applies. If Type is empty, leave it empty and carry \"Type not set\" as an open point.\n6. Hand open points to a human. If step 3 or step 5 left one, call create_tasks exactly once with name \"Complete account profile: <organization name>\", organizationIds [<entityId>], notes listing each open point on its own line, and customFieldValues setting the task Status column to its 'Open' option id so the task appears on the task board. If nothing is open, create no task.\n\nFinish by reporting the Website value written, the contacts linked and the task created, or that nothing needed doing.\n\nAllowed writes, and nothing else: update_organizations for the Website column, manage_record_links with action add for contacts, and create_tasks. Never change the organization name or its Type, never call delete_records, never call manage_custom_columns, and never call send_email or send_chat_message: this routine runs unattended, so anything it sends leaves without a human reading it.",
    enabled: true,
    maxCreditsPerRun: 20,
    maxRunsPerHour: 12,
    trigger: {
      kind: "event",
      events: [DomainEvent.ORGANIZATION_CREATED, DomainEvent.ORGANIZATION_UPDATED],
      debounceSeconds: 900,
    },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 26,
        durationSeconds: 51,
        chargedCredits: 8,
        summary: "Nothing had drifted since the last run.",
      },
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 50,
        durationSeconds: 63,
        chargedCredits: 9,
        summary: "Linked 2 records and appended 2 notes.",
      },
    ],
  },
  {
    index: 7,
    owner: "user",
    name: "Triage inbound email and prepare a reply draft",
    prompt:
      'You are triaging one inbound email that just arrived in the shared inbox. Email only: never act on a chat thread here.\n\nThe <routine_trigger> block above carries threadId (the messaging thread) and entityId (the new message). Work on that thread only. If threadId is missing, stop and say so in your run summary.\n\n1. Read it. Call get_messaging_threads with that threadId. Page 1 is the newest messages. Read the newest inbound message in full and take its sender as the person you are answering; on a group thread ignore the other participants and the ones with isSelf true.\n2. Match it to the CRM. If that participant already carries a linked contact (isLinked true), use its contact id. Otherwise call search_records with entities contacts and organizations, first with the sender\'s email address, then with their display name. The people who email this workspace are anna.mueller@roche.example (Anna Müller, Program Manager at Roche), yasmin.farouk@asml.example (Yasmin Farouk, ASML) and amin.hassan@tui.example (Amin Hassan, TUI).\n3. Classify the message into exactly one of: deal progress, contract or legal, scheduling, delivery or support question, internal FYI, bulk or newsletter.\n4. Record what happened. Call update_record_notes with entity contact, mode append, items [{ id, notes }] where id is the matched contact id (an email address also works as an id) and notes is one line: "<today\'s date as YYYY-MM-DD> inbound email, <classification>: <one sentence on what they asked for>". If the thread clearly concerns that organization\'s open deal, append the same line to the deal with entity deal. In this workspace Roche owns the deal "CRM Rollout & Sales Enablement" (threads "Next steps for the Roche rollout", "Roche data mapping review") and ASML owns "Enterprise Integration Program" (threads "ASML retainer: contract review", "ASML partner enablement materials"); TUI has no deal, so an email from Amin gets a contact note only. If the contact is not yet linked to that deal, call manage_record_links with action add, entity contact, sourceId <contact id>, relation deals, ids [<deal id>].\n5. Prepare, never send. Before drafting, call get_records for the deal you touched to read its name and Status, and list_records on tasks for anything still open on it. Then call save_message_draft with the threadId and a reply body that answers the concrete ask, uses those facts, and asks at most one clarifying question. Write no sign-off and no signature; the sending account\'s signature is appended when a human sends it. Never call send_email or send_chat_message under any circumstances. A human reviews and sends this draft from their own inbox.\n6. Set the thread state with update_messaging_thread: open when a human reply is needed, spam only for obvious bulk mail or a newsletter. Never set closed here.\n\nHard limits: change nothing else. Do not edit any contact, organization, deal, service or task field, and do not create records. The notes in step 4, the one deal link, the draft and the thread state are the only writes you may make. Never call delete_records. If you cannot confidently match the sender, skip step 4, still save the draft, and name the unmatched sender in your run summary. Finish with a two-line summary: who wrote, the classification, and what the draft offers.',
    enabled: true,
    maxCreditsPerRun: 25,
    maxRunsPerHour: 20,
    trigger: {
      kind: "event",
      events: [DomainEvent.MESSAGING_EMAIL_RECEIVED],
      debounceSeconds: 300,
    },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 14,
        durationSeconds: 88,
        chargedCredits: 18,
        summary: "Prepared 2 reply drafts for review.",
      },
      {
        status: RoutineRunStatus.failed,
        startedHoursAgo: 38,
        durationSeconds: 12,
        chargedCredits: 2,
        error: "providerUnavailable",
      },
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 62,
        durationSeconds: 77,
        chargedCredits: 15,
        summary: "Triaged 4 threads, 1 needed a human.",
      },
    ],
  },
  {
    index: 8,
    owner: "sofiaRossiUser",
    name: "Flag unknown chat participants before anyone replies",
    prompt:
      'A new inbound message just arrived on a connected account. messaging.message.received covers chat (WhatsApp, LinkedIn, Telegram, Instagram) and email alike, so do not assume the channel. Your job: make sure every person in that conversation is known to the CRM before a human replies.\n\nUse only the threadId from the <routine_trigger> block above.\n\n1. Call get_messaging_threads with that threadId. Read thread.state, thread.name and participants. A participant with isSelf false and isLinked false is not a CRM contact.\n2. If every external participant is linked, stop immediately: write nothing, call no other tool, and make your run summary "all participants linked". That is the common case and it must stay cheap.\n3. Otherwise, for each unlinked participant take displayName and identifier (a phone number, an email address, or a provider handle) and call search_records with searchTerm set to the display name and entities ["contact","organization"]. If the identifier is an email, search again on its domain (bmw.example resolves to the BMW organization). Then read who else is in the thread: an unlinked person talking with sophie.wagner@bmw.example or leon.becker@bmw.example is almost certainly on the BMW account. In this workspace you will meet Marco Silva (+12025550127, implementation partner, in the WhatsApp groups "Mobility rollout working group" and "Launch readiness team" with Sophie Wagner) and Clara Neumann (clara.neumann@partner.demo.example, customer operations consultant, in the email threads "Customer operations working group" and "Pilot steering group" with Anna Müller and Amin Hassan). partner.demo.example matches no organization, so Clara ends at step 4b.\n4. Never create a contact and never invent an email address or phone number. Record the finding where a human will see it. The line is exactly: "YYYY-MM-DD unlinked participant <display name> (<identifier>) in thread <thread name>, no contact record yet".\n   a. Organization inferred: call update_record_notes with entity "organization", mode "append", items [{id: <organization id>, notes: <line>}].\n   b. No organization, but a linked contact shares the thread (Anna Müller in the Clara Neumann case): the same call with entity "contact" and that contact\'s id.\n   c. Neither: write nothing at all.\n5. Only if you appended a note and thread.state is not already "unread", call update_messaging_thread with that threadId and state "unread", so the thread goes back to the human queue. Never set "open", "closed" or "spam": "open" marks the thread read and would bury the message you just flagged.\n6. If the newest inbound message asks a direct question, call save_message_draft with that threadId and a short holding reply that answers what you can and names the next step. The draft waits in the inbox for a human to review and send. Never call send_email or send_chat_message: this routine runs unattended, and nothing it writes may leave the workspace.\n\nYour complete allowance: one appended note, at most one thread state change to "unread", and at most one draft. Never call delete_records, create_contacts, update_contacts, manage_record_links, or any other write tool. Finish with a one-line summary naming each unlinked person and where you recorded them.',
    enabled: true,
    maxCreditsPerRun: 20,
    maxRunsPerHour: 12,
    trigger: {
      kind: "event",
      events: [DomainEvent.MESSAGING_MESSAGE_RECEIVED],
      debounceSeconds: 900,
    },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 9,
        durationSeconds: 4,
        chargedCredits: 11,
        summary: "Completed with no changes needed.",
      },
    ],
  },
  {
    index: 9,
    owner: "elenaHoffmannUser",
    name: "Morning inbox sweep with reply drafts",
    prompt:
      "It is the start of the working day. Sweep the shared inbox and hand the team a ranked queue of everything nobody has answered. Read widely, write little.\n\n1. Call get_messaging_threads with a filter on state unread, sortDescriptor lastMessageAt descending, pageSize 25. Work only the first 10 of those threads so this run stays inside its credit budget, and say in your summary how many you left out.\n2. Open each of those threads with get_messaging_threads and its threadId; page 1 holds the newest messages. Read the newest message's direction: outbound means we already replied, so leave that thread completely alone. Only a thread whose newest message is inbound counts as unanswered.\n3. Identify the sender of each unanswered thread. The thread's participant entry already carries contact { id, name } when that person is linked to the CRM, so use it directly. Only when isLinked is false, call search_records on the participant's identifier (email address or handle) and then on the display name, and treat the sender as not yet in the CRM if neither matches.\n4. For a matched contact, call list_records on deals with a contactIds filter to find their deals, then get_records on those deal ids to read the Status custom column: list_records returns only id and name, never custom-column values. Read the organization the same way when you need its name. Call get_record_schema first if you need the Status column or option ids; never guess them.\n5. Rank the unanswered threads: first contract, pricing, signature and renewal conversations; then threads tied to a deal whose Status is Open; then scheduling and meeting requests; then everything else.\n6. Prepare at most three reply drafts, highest rank first, with save_message_draft on the thread. Each draft answers the concrete open question in the last inbound message, names the deal, organization or meeting it belongs to, and ends with one clear next step. Do not add a sign-off or signature; the sending account appends its own. Never call send_email or send_chat_message, under any circumstances and however routine the reply looks. Every reply leaves this run as a draft for a human to review and send.\n7. Call update_messaging_thread with state \"open\" on exactly the threads you drafted for, so they leave the unread pile and become the review queue. Leave every other thread's state exactly as it is.\n8. Finish with a short written summary, highest rank first: thread subject or name, who it is from, the matched contact, organization and deal with its Status, the rank class, and whether you drafted a reply. Then list the threads you skipped and why: already answered, sender not in the CRM, or past the draft limit.\n\nWrite nothing else. Do not change any record field, do not create contacts, deals or tasks, do not append notes, and never call delete_records: an unattended run has nobody to approve a deletion and it would only be declined. The drafts, the thread states in step 7, and your written summary are the entire output of this run.",
    enabled: true,
    maxCreditsPerRun: 40,
    maxRunsPerHour: 1,
    trigger: { kind: "schedule", cron: "45 7 * * *", nextRunInHours: 33 },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 20,
        durationSeconds: 74,
        chargedCredits: 12,
        summary: "Reviewed 3 open deals and filed 1 follow-up task.",
      },
    ],
  },
  {
    index: 10,
    owner: "user",
    name: "Morning pipeline briefing",
    prompt:
      'You are producing the morning pipeline briefing for the sales team. This is a read-only report. Do not create, update, delete or link any record, do not change custom columns or widgets, and do not send or draft any message.\n\n1. Setup. Call get_workspace_context, then get_record_schema with no entity so all five schemas come back in one call. From it take the real custom-column ids for the deal "Status" column and the task "Status" and "Priority" columns, together with their option ids. Never guess an id.\n\n2. Open pipeline. list_records on entity deal, filters [{"field": <deal Status column id>, "operator": "equals", "value": <"Open" option id>}], sortDescriptor {"field": "totalValue", "direction": "desc"}, pageSize 25. This returns id, name, totalValue, totalQuantity and weightedValue only. Take the pipeline total and the weighted total from the sums field, which covers every matching record and not just this page; never add the page up yourself. Then make one get_records call with all returned deal ids to read each deal\'s organizations relation and updatedAt. Report per deal: name, organization, totalValue, weightedValue, last updated. In this workspace the open deals are normally Data & Analytics Transformation (PwC), Workplace Hardware Rollout (Deutsche Post) and Digital Customer Platform (BMW).\n\n3. What moved in the last 24 hours. get_activities with sortDescriptor {"field": "at", "direction": "desc"} and pageSize 25. This tool has no date filter, so discard anything older than 24 hours yourself, and if all 25 entries fall inside the window say the list may be incomplete. Group what remains by kind: record changes (audit), inbound and outbound messages, and calendar events, naming the record or person each entry is about.\n\n4. Today\'s meetings. get_calendars with list "events", a startsAt filter covering today in Europe/Berlin, and sortDescriptor {"field": "startsAt", "direction": "asc"}. Give start time and title. If today has no events, say so in one line and name the next upcoming event by widening the startsAt filter forward. Do not call get_calendars once per event just to list attendees.\n\n5. Tasks needing attention. list_records on entity task, filters [{"field": <task Status column id>, "operator": "in", "value": [<Open>, <In Progress>, <Blocked> option ids]}], pageSize 25. Filters are AND-combined, so run it once more with the task Priority column equals the "High" option to find the high-priority ones. Report every task that is Blocked or High. Then make one get_records call with those task ids to read the linked deal or organization and the assigned user.\n\nOutput one plain-text briefing of at most 400 words with the sections Open pipeline, What moved, Today\'s meetings and Tasks needing attention. Finish with either "Nothing to flag" or one sentence naming the single thing that most needs a human decision today. State money in EUR. If a section is empty, say so in one short line instead of padding it. If a tool call fails, name the call that failed and continue with the rest. Never state a record, a number or a person that a tool did not return.',
    enabled: true,
    maxCreditsPerRun: 40,
    maxRunsPerHour: 1,
    trigger: { kind: "schedule", cron: "45 7 * * *", nextRunInHours: 42 },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 26,
        durationSeconds: 51,
        chargedCredits: 8,
        summary: "Nothing had drifted since the last run.",
      },
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 50,
        durationSeconds: 63,
        chargedCredits: 9,
        summary: "Linked 2 records and appended 2 notes.",
      },
    ],
  },
  {
    index: 11,
    owner: "sofiaRossiUser",
    name: "Friday team report: pipeline, stalled work and activity",
    prompt:
      'You are producing the Friday team report for the workspace owner. This run is read-only: create, update, link or delete nothing, change no setting, column or widget, and call no messaging tool. Never call delete_records, send_email, send_chat_message or save_message_draft. The report is your final answer; it is not sent anywhere.\n\n1. Context. Call get_workspace_context and list_users for the current members and their roles (this workspace has Max Bergmann as Admin, Sofia Rossi as Sales Manager and Elena Hoffmann in Customer Success). Call get_record_schema for deal and task and read the column ids of the deal "Status", the task "Status" and the task "Priority" columns together with their option ids (deal: Open, Won, Lost, Abandoned; task: Open, In Progress, Blocked, On Hold, Done, Archived). Never guess an id. Single-select columns accept only the "in" and "notIn" operators, so filter with "in" and a one-element value array.\n\n2. Pipeline. list_records returns only id, name and the numeric deal fields, so read the split from filtered calls, not from one page. Make one list_records call on entity deal per deal Status option, pageSize 25, and report each bucket\'s "total" and its named deals. For the Open bucket also report "sums".totalValue and "sums".weightedValue. Then call get_records once with the Open deal ids to read each one\'s linked organization and Project Period. State money in EUR.\n\n3. Stalled work. Call list_records on entity task with two filters: the task Status column "in" [Open, In Progress, Blocked], and updatedAt "lt" the date fourteen days before today. Make a second call filtered to the task Status column "in" [Blocked] so nothing blocked is missed whatever its age. Take at most the eight most important task ids and call get_records on them with include "withNotes" to read Status, Priority, updatedAt, the assigned user in the users relation, and the linked deal, organization or contact. List them Blocked first, then High priority, then oldest updatedAt. Quote a line of context only when notesStatus is "present"; when it is "empty" write that the task carries no notes rather than inventing any. If more tasks are stalled than you list, give the remaining count.\n\n4. Activity. Call get_activities with pageSize 100 and sortDescriptor {field: "at", direction: "desc"}. It takes no date filter, so keep only entries whose "at" falls in the last seven days. Count them by kind (message, audit, activity, calendar_event), name the three records with the most entries, and name every Open deal with no entry at all. If the oldest entry on the page is still inside the window, say the count is a floor.\n\n5. Meetings. Call get_calendars with list "events", sorted by startsAt ascending, and a startsAt "between" filter spanning seven days back to fourteen days ahead. List the upcoming customer meetings with date, title and attendee count. When nothing is upcoming, say so plainly and list this week\'s past meetings instead.\n\n6. Only if the report needs a definition you do not already have, for example how weightedValue is derived, call search_docs and then get_docs_page. Otherwise skip this step.\n\nWrite one report of at most 600 words under the headings Pipeline, Stalled work, Activity and Meetings, and close with up to three recommended actions, each naming one specific record and the person who owns it. Say plainly when a section is empty. Never state a record, a number or a person that a tool did not return.',
    enabled: true,
    maxCreditsPerRun: 40,
    maxRunsPerHour: 1,
    trigger: { kind: "schedule", cron: "0 16 * * 5", nextRunInHours: 6 },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 14,
        durationSeconds: 88,
        chargedCredits: 18,
        summary: "Prepared 2 reply drafts for review.",
      },
      {
        status: RoutineRunStatus.failed,
        startedHoursAgo: 38,
        durationSeconds: 12,
        chargedCredits: 2,
        error: "providerUnavailable",
      },
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 62,
        durationSeconds: 77,
        chargedCredits: 15,
        summary: "Triaged 4 threads, 1 needed a human.",
      },
    ],
  },
  {
    index: 12,
    owner: "elenaHoffmannUser",
    name: "Deal stage-change brief filed on the deal",
    prompt:
      'A deal\'s Status has just changed. The routine_trigger block at the top of this prompt carries that deal\'s id in entityId. Produce a short stage-change brief and file it on that one deal.\n\n1. Call get_record_schema for entity "deal" to resolve the "Status" custom-column id and its option ids (Open, Won, Lost, Abandoned), and for entity "task" to resolve the task "Status" column id and its Open, In Progress and Blocked option ids. Never guess an id; ids differ per workspace.\n2. Call get_records with items [{entity: "deal", id: <entityId>, include: "withNotes"}] to read the deal\'s name, its Status custom-field value, linked organization, contacts and services, totalValue, weightedValue, Project Period and existing notes. Map the stored Status value to a label using the option ids from step 1.\n3. Call get_activities with filters [{field: "dealIds", operator: "in", value: [<entityId>]}], pageSize 25 and sortDescriptor {field: "at", direction: "desc"} to see the run-up: messages, audit changes and calendar events.\n4. Call list_records with entity "task" and filters [{field: "dealIds", operator: "in", value: [<entityId>]}, {field: "<task Status column id>", operator: "in", value: [<Open>, <In Progress>, <Blocked> option ids]}]. list_records returns only id and name, never custom-column values, so the filter is what makes a returned task an open one; read "total" for the count.\n5. Write a brief of at most 150 words: the new Status, the deal value in EUR, the organization and its main contacts, the last three meaningful activities with their dates, and the names of the tasks still open. If the new Status is Won or Lost, add one sentence on what closed it, drawn only from activities you actually read. Invent nothing.\n\nThe only write you may make is one update_record_notes call: entity "deal", mode "append", items [{id: <entityId>, notes: <brief>}], the brief opening on a markdown heading of the form "## Stage change <YYYY-MM-DD>: <new status>". Change nothing else: do not edit the deal\'s fields or custom columns, do not create or update tasks, do not add or remove relations, never call delete_records, and never send or draft a message with send_email, send_chat_message or save_message_draft. If the deal cannot be read, or its Status matches no known option id, or there is nothing worth reporting, write nothing and say so in your run summary.',
    enabled: true,
    maxCreditsPerRun: 25,
    maxRunsPerHour: 6,
    trigger: {
      kind: "event",
      events: [DomainEvent.DEAL_UPDATED],
      debounceSeconds: 600,
    },
    runs: [],
  },
  {
    index: 13,
    owner: "user",
    name: "Research every new LinkedIn connection and file them in the CRM",
    prompt:
      'A LinkedIn connection was accepted on one of our connected accounts. Research that person and file them in the CRM. Send nothing to anybody: no email, no chat message, no LinkedIn invitation, note or reply.\n\n1. Context. Call get_workspace_context and use the connectedAccounts entry with provider linkedin and status \'ok\' as connectedAccountId. If there is none, stop and change nothing.\n\n2. Who connected. The routine_trigger block above carries entityId: the id of the timeline entry for this connection. Call get_activities with filters [{field:"timelineKind", operator:"in", value:["activity"]}], sortDescriptor {field:"at", direction:"desc"}, pageSize 25, and take the item whose id equals that entityId (if it is absent, take the newest activity entry from the last hour). Its payload holds fullName, headline, profileUrl and pictureUrl, and its identifier is the person\'s LinkedIn provider id. Skip the person entirely if their contact notes already record this connection. In this workspace these entries are Leon Becker (IT Transformation Lead at BMW) and Rashid Malik (Digital Strategy Manager at KPMG). Do not use manage_social_relations: action=list returns still-pending invitations only and cannot tell you who accepted.\n\n3. Enrich, best effort. Call get_social_profile with profileType=person and that identifier for location and current_positions. If it errors, keep the name, headline and profile URL from the activity payload and carry on.\n\n4. Talking point, best effort. Call get_social_posts with authorIdentifier \'me\' and limit 3, then get_social_post_engagement on each post with kind comments, limit 25, and kind reactions, limit 25, and check whether this person\'s id appears as items[].author.id or items[].sender.id. Stop at the first match and record the post plus what they said or which reaction they left. If any of this errors, continue without a talking point.\n\n5. Match the CRM. Call search_records with their full name and entities ["contacts"], and again with the company name and entities ["organizations"]. Call get_record_schema for contact to read the "Sales Pipeline" singleSelect column id and the option ids for "New" and "Contact".\n\n6. These are the only writes you may make, once each.\na. Contact exists: update_record_notes with entity "contacts", mode "append", and one short markdown block holding the connection date, headline, current role and the talking point. If their Sales Pipeline is empty or "New", call update_contacts with customFieldValues [{columnId: <Sales Pipeline id>, value: <"Contact" option id>}].\nb. No contact: call create_contacts with firstName, lastName, identifiers [{provider:"linkedin", value:<public handle>, profileUrl:<profile url>}], the same notes, and organizationIds [<matched organization id>] only when that organization already exists. Never create an organization.\nc. Either way, call create_tasks once with name "Follow up with <name> (<company>) after LinkedIn connect", notes carrying the headline and the talking point, contactIds [<contact id>], organizationIds [<organization id> when matched] and userIds [Sofia Rossi\'s id from list_users].\n\n7. Never call manage_social_relations with invite, accept or cancel, never write with linkedin_manage_sales_lists, never call send_email or send_chat_message (both deliver immediately with no human review), and never call delete_records (it needs an approval nobody can give on a routine, so it only fails). If you cannot identify the person with confidence, create the follow-up task describing what you found and change no other record.',
    enabled: false,
    maxCreditsPerRun: 30,
    maxRunsPerHour: 6,
    trigger: {
      kind: "event",
      events: [DomainEvent.MESSAGING_RELATION_CREATED],
      debounceSeconds: 900,
    },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 20,
        durationSeconds: 74,
        chargedCredits: 12,
        summary: "Reviewed 3 open deals and filed 1 follow-up task.",
      },
    ],
  },
  {
    index: 14,
    owner: "sofiaRossiUser",
    name: "Monday workspace, webhook and dashboard health sweep",
    prompt:
      'Every Monday, sweep the workspace for administrative drift and leave one report for the admin. Change as little as possible, and expect most checks to come back clean: still write the closing task.\n\n1. Call get_workspace_context. Record company.currency (the value is the lowercase enum, "eur"), company.terminology, the roles (Admin, Sales Manager, Customer Success) and every entry of connectedAccounts whose status is not "ok". The demo has three accounts (Gmail, Outlook, LinkedIn); if all are "ok", say so.\n\n2. Call list_users. It should return Max Bergmann (Admin), Sofia Rossi (Sales Manager) and Elena Hoffmann (Customer Success), each with a roleId. If an item has roleId null, which happens when an invitation was accepted but never given a role, call manage_team with action update_member, that userId, and the id of the "Sales Manager" role from get_workspace_context.roles. Never assign Admin, never change a roleId that is already set, never pass status, and never call manage_team with action invite: it sends real invitation emails and needs an approval nobody can give on a routine. Raise any other membership question in the closing task instead of acting on it.\n\n3. Call manage_webhooks with action list, then action get on the one result. This workspace has a single webhook, "Webhook for demo" at https://receiver.example/webhooks/customermates, currently enabled=false and subscribed to contact.created, contact.updated, deal.created, deal.updated, organization.created and organization.updated. Then call action list_deliveries with that webhook id and pageSize 25. Read only id, event, status, statusCode and createdAt from each item; every item also carries a full requestBody snapshot of the changed record, so never quote or summarise requestBody. Tally the attempts by status: successes, failures by status code, and attempts still marked processing. Do not add a createdAt filter, the delivery history is a fixed block from early August and a recent-days window returns nothing. This step is read only: never call action delete, which is irreversible; never call action update, because changing an endpoint, the event list or the enabled flag is a human decision; never call action resend_delivery, which needs an approval nobody can give here.\n\n4. Call manage_widgets with action list. The dashboard should carry four charts, Deal Value By Organizations, Sales Pipeline, Total Deal Value and Deal Overview, plus three activity widgets, Recent Changes, Messages and Events. If one of the four charts is missing, recreate it with action create, omitting kind, using the deal Status and contact Sales Pipeline column ids from manage_custom_columns action list (pass entityType deal and entityType contact; use action list only, never upsert and never delete):\n- Deal Value By Organizations: entityType organization, aggregationType dealValue, displayType horizontalBarChartWithLabels, groupByType organization.\n- Sales Pipeline: entityType contact, aggregationType count, displayType doughnutChart, groupByType customColumn, groupByCustomColumnId the contact "Sales Pipeline" column.\n- Total Deal Value: entityType deal, aggregationType dealValue, displayType doughnutChart, groupByType customColumn, groupByCustomColumnId the deal "Status" column.\n- Deal Overview: entityType deal, aggregationType count, displayType verticalBarChart, groupByType customColumn, groupByCustomColumnId the deal "Status" column.\nUse action update only to rename a chart back to one of those exact names. Never call action delete. If an activity widget is missing, report it rather than recreating it.\n\n5. Finish with one call to create_tasks: name "Workspace health <YYYY-MM-DD>", userIds the id of Max Bergmann from list_users, and notes a short markdown summary with one line per check: webhook enabled flag and delivery tally by status code, connected accounts not "ok", role gaps found or filled, charts recreated, and every decision left for a human. Name the webhook and widgets explicitly so the admin can act without opening anything else.\n\n6. Never call update_workspace_settings: currency and terminology belong to the owner. Never call send_email, send_chat_message or delete_records, and never create, update or delete any contact, organization, deal or service.',
    enabled: true,
    maxCreditsPerRun: 35,
    maxRunsPerHour: 1,
    trigger: { kind: "schedule", cron: "15 8 * * 1", nextRunInHours: 33 },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 26,
        durationSeconds: 51,
        chargedCredits: 8,
        summary: "Nothing had drifted since the last run.",
      },
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 50,
        durationSeconds: 63,
        chargedCredits: 9,
        summary: "Linked 2 records and appended 2 notes.",
      },
    ],
  },
  {
    index: 15,
    owner: "elenaHoffmannUser",
    name: "Monday LinkedIn research for accounts that look like our won deals",
    prompt:
      "Every Monday, build a short research list of accounts that resemble the deals this workspace has already won. Create organizations and a LinkedIn list only; never create a deal, never message anyone, and never delete anything.\n\n1. Call get_record_schema for deal and read the Status column id together with its option ids and weights. Do not reuse ids from a previous run.\n2. Call list_records for entity deal filtered to Status equals the Won option, pageSize 100. Then call get_records on those deals so you can read each one's linked organization and linked services.\n3. Describe the pattern you actually see in one sentence: the industries of the won accounts and the services those deals contained. Base this only on what the records say.\n4. Call linkedin_get_sales_search_parameters to read the parameter shapes the search accepts. Do not guess a filter name.\n5. Call linkedin_search_sales_companies using that pattern, restricted to Germany, Austria and Switzerland. Ask for at most 10 companies.\n6. Drop any company that already exists here: call list_records for entity organization, pageSize 100, and compare on name and website. Report the ones you dropped and why.\n7. For the survivors, call linkedin_search_sales_leads for at most two plausible buyer-side contacts each. Do not create contact records from these; the people are research output only.\n8. Call linkedin_manage_sales_lists to save the survivors to a list named 'Looks like our won deals, <ISO week>'.\n9. Call create_organizations for the survivors, setting name and website only, and call manage_record_links to attach nothing further. Leave every other field empty so a human fills it in deliberately.\n\nFinish with a table of the accounts you added, the won deal each one resembles, and the leads you found. If the search returns nothing usable, say so and add no organization at all.",
    enabled: true,
    maxCreditsPerRun: 45,
    maxRunsPerHour: 1,
    trigger: { kind: "schedule", cron: "0 8 * * 1", nextRunInHours: 42 },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 14,
        durationSeconds: 88,
        chargedCredits: 18,
        summary: "Prepared 2 reply drafts for review.",
      },
      {
        status: RoutineRunStatus.failed,
        startedHoursAgo: 38,
        durationSeconds: 12,
        chargedCredits: 2,
        error: "providerUnavailable",
      },
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 62,
        durationSeconds: 77,
        chargedCredits: 15,
        summary: "Triaged 4 threads, 1 needed a human.",
      },
    ],
  },
  {
    index: 16,
    owner: "user",
    name: "Keep service lines and their deal totals consistent",
    prompt:
      "A service or a deal was just changed. Check that the service lines on the affected open deals still make sense, and record anything a human needs to decide. You may update a service's own fields, update or create a task, and append a note. Never change a deal's status or value, and never delete anything.\n\n1. Call get_record_schema for deal, service and task, and read the option ids you will need. Never guess an id.\n2. Call get_records for the record that triggered this run. If it is a service, call list_records for entity deal filtered to that service through the services relation. If it is a deal, read its own linked services.\n3. For each affected deal that is still Open, compare the deal's totalValue and totalQuantity against the sum of its service lines. The list response carries whole-result-set sums, so use those rather than adding pages yourself.\n4. If a service line has a quantity of zero, or an amount of zero, or no pricing model set, call update_services to fill only the field that is plainly missing from the service's own definition. If the right value is not obvious from the record, change nothing.\n5. If a deal's totals do not match its service lines, do not correct the deal. Instead call create_tasks for one task named 'Check service lines: <deal name>' assigned to the deal's owner, with the discrepancy in the description, and link it to the deal. If such a task already exists and is still open, call update_tasks to refresh its description instead of creating a second one.\n6. Call update_record_notes with mode append on each affected deal, adding one line stating what you checked and what you changed.\n\nReport the deals you checked, the services you corrected, and the tasks you opened or refreshed. If everything reconciles, say so in one line and write nothing.",
    enabled: true,
    maxCreditsPerRun: 30,
    maxRunsPerHour: 4,
    trigger: {
      kind: "event",
      events: [DomainEvent.SERVICE_UPDATED, DomainEvent.DEAL_UPDATED],
      debounceSeconds: 900,
    },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 9,
        durationSeconds: 4,
        chargedCredits: 11,
        summary: "Completed with no changes needed.",
      },
    ],
  },
  {
    index: 17,
    owner: "sofiaRossiUser",
    name: "Quarterly workspace configuration review",
    prompt:
      "Once a quarter, review how this workspace is configured and report what has drifted. Change a setting only where the change is unambiguous and reversible; when in doubt, describe it and leave it alone.\n\n1. Call get_workspace_context to read the workspace name, locale, currency, timezone and the connected messaging accounts.\n2. Call list_users and note anyone whose status is not active, and anyone with no role assigned.\n3. Call get_record_schema for contact, organization, deal, service and task. For each entity list the custom columns, and flag any single-select column that has fewer than two options, any column whose label duplicates another, and any column that no record appears to use.\n4. Call search across the workspace for the workspace name to see how it is referred to in existing records, and call fetch on the workspace website if get_workspace_context provides one, so you can tell whether the stored name and website still match reality.\n5. Call search_docs for 'custom columns' and read the most relevant page with get_docs_page, so your recommendations match the documented behaviour rather than your assumption.\n6. If, and only if, the workspace currency or timezone is plainly inconsistent with the records you read, call update_workspace_settings to correct it and say exactly what you changed and why. Otherwise call nothing.\n7. If a single-select column has exactly one option, call manage_custom_columns to describe the problem in your report rather than editing it; adding an option is a decision for a person.\n\nFinish with three short lists: settings that look wrong, columns that look unused or duplicated, and users who need attention. If nothing has drifted, say so in one sentence.",
    enabled: false,
    maxCreditsPerRun: 35,
    maxRunsPerHour: 1,
    trigger: { kind: "schedule", cron: "0 9 1 */3 *", nextRunInHours: 15 },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 20,
        durationSeconds: 74,
        chargedCredits: 12,
        summary: "Reviewed 3 open deals and filed 1 follow-up task.",
      },
    ],
  },
];

const routineId = (index: number) => fixtureId("31000000", index);
const routineRunId = (routineIndex: number, runIndex: number) => fixtureId("32000000", routineIndex * 100 + runIndex);
const runConversationId = (routineIndex: number, runIndex: number) =>
  fixtureId("33000000", routineIndex * 100 + runIndex);
const runMessageId = (routineIndex: number, runIndex: number, messageIndex: number) =>
  fixtureId("34000000", routineIndex * 10000 + runIndex * 100 + messageIndex);

const OWNER_NAMES: Record<SeedOwner, string> = {
  user: "Max Bergmann",
  sofiaRossiUser: "Sofia Rossi",
  elenaHoffmannUser: "Elena Hoffmann",
};

export async function seedRoutines(context: SeedContext): Promise<void> {
  const now = Date.now();

  const fixtures = SYNTHETIC_ROUTINES.map((routine) => ({ id: routineId(routine.index), routine }));

  await upsertFixturesById(fixtures, async ({ id, routine }) => {
    const ownerUserId = context.ids[routine.owner];
    const schedule = routine.trigger.kind === "schedule" ? routine.trigger : undefined;
    const event = routine.trigger.kind === "event" ? routine.trigger : undefined;
    const lastRun = routine.runs.at(0);

    const data = {
      companyId: context.ids.company,
      ownerUserId,
      name: routine.name,
      prompt: routine.prompt,
      enabled: routine.enabled,
      triggerKind: schedule ? RoutineTriggerKind.schedule : RoutineTriggerKind.event,
      cronExpression: schedule?.cron ?? null,
      timezone: schedule ? ROUTINE_TIMEZONE : null,
      runOnceAt: null,
      triggerEvents: event?.events ?? [],
      changedFields: event?.changedFields ?? [],
      triggerFilters: undefined,
      debounceSeconds: event?.debounceSeconds ?? 300,
      maxRunsPerHour: routine.maxRunsPerHour,
      maxCreditsPerRun: routine.maxCreditsPerRun,
      nextRunAt: schedule && routine.enabled ? new Date(now + schedule.nextRunInHours * HOUR) : null,
      lastRunAt: lastRun ? new Date(now - lastRun.startedHoursAgo * HOUR) : null,
      lastRunStatus: lastRun?.status ?? null,
      disabledReason: null,
      suppressedEventCount: 0,
    };

    await context.prisma.routine.upsert({ where: { id }, create: { id, ...data }, update: data });

    await upsertFixturesById(
      routine.runs.map((run, runIndex) => ({ id: routineRunId(routine.index, runIndex), run })),
      async ({ id: runId, run }) => {
        const startedAt = new Date(now - run.startedHoursAgo * HOUR);
        const finishedAt = new Date(startedAt.getTime() + run.durationSeconds * 1000);
        const runIndex = routine.runs.indexOf(run);
        const conversationId = runConversationId(routine.index, runIndex);

        const conversation = {
          companyId: context.ids.company,
          userId: ownerUserId,
          origin: AgentConversationOrigin.routine,
          title: routine.name,
          archivedAt: null,
          selectedAt: null,
          createdAt: startedAt,
          updatedAt: finishedAt,
        };

        await context.prisma.agentConversation.upsert({
          where: { id: conversationId },
          create: { id: conversationId, ...conversation },
          update: conversation,
        });

        const transcript = [
          { role: "user" as const, text: RUN_TRANSCRIPT_OPENER[schedule ? "schedule" : "event"] },
          { role: "assistant" as const, text: run.summary ?? runFailureNote(run.error ?? "") },
        ];

        for (const [messageIndex, message] of transcript.entries()) {
          const messageId = runMessageId(routine.index, runIndex, messageIndex);
          const messageRow = {
            conversationId,
            companyId: context.ids.company,
            role: message.role,
            parts: [{ type: "text", text: message.text }] as Prisma.InputJsonValue,
            sequence: BigInt(500_000 + routine.index * 1_000 + runIndex * 10 + messageIndex),
            createdAt: new Date(startedAt.getTime() + messageIndex * 1_000),
          };

          await context.prisma.agentMessage.upsert({
            where: { id: messageId },
            create: { id: messageId, ...messageRow },
            update: messageRow,
          });
        }

        const runData = {
          companyId: context.ids.company,
          routineId: id,
          executedByUserId: ownerUserId,
          executedByName: OWNER_NAMES[routine.owner],
          status: run.status,
          triggerKind: schedule ? RoutineTriggerKind.schedule : RoutineTriggerKind.event,
          triggerEvent: event?.events[0] ?? null,
          conversationId,
          triggerEntityId: null,
          scheduledFor: startedAt,
          startedAt,
          finishedAt,
          terminalCode: run.status === RoutineRunStatus.succeeded ? AgentTurnTerminalCode.completed : null,
          chargedCredits: run.chargedCredits,
          summary: run.summary ?? null,
          error: run.error ?? null,
        };

        await context.prisma.routineRun.upsert({
          where: { id: runId },
          create: { id: runId, ...runData },
          update: runData,
        });
      },
    );
  });
}
