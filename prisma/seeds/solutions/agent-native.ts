import type { SolutionDataLocale } from "@/core/solutions/solution-catalog";

import type { ApiKeySpec, RecordSpec, WikiPageSpec } from "./define-solution";

export const AGENT_KEY_NAMES = ["Claude Desktop", "ChatGPT", "Codex CLI"] as const;

export type AgentKeyName = (typeof AGENT_KEY_NAMES)[number];

const AGENT_EDIT_DAYS_AGO = 3;

type AuthoredRecords = Record<string, ReadonlyArray<Omit<RecordSpec, "avatar">>>;

/**
 * Records whose notes an agent wrote: each gets one recent update by Max, through the named API key of his profile,
 * that put the note in place. `edits` maps `<list>:<record key>` to the key's name.
 */
export function agentEdited(records: AuthoredRecords, edits: Readonly<Record<string, AgentKeyName>>): AuthoredRecords {
  const unmatched = new Set(Object.keys(edits));
  const edited = Object.fromEntries(
    Object.entries(records).map(([list, specs]) => [
      list,
      specs.map((spec) => {
        const via = edits[`${list}:${spec.key}`];
        if (!via) return spec;
        unmatched.delete(`${list}:${spec.key}`);
        if (!spec.values.notes) throw new Error(`${list}:${spec.key} has no agent note to attribute`);
        return {
          ...spec,
          history: [
            ...(spec.history ?? []),
            {
              daysAgo: Math.max(0, Math.min(AGENT_EDIT_DAYS_AGO, spec.createdDaysAgo - 1)),
              by: "maxBergmann" as const,
              via,
              previous: { notes: "" },
            },
          ],
        };
      }),
    ]),
  );
  if (unmatched.size) throw new Error(`Unknown agent-edited records: ${[...unmatched].join(", ")}`);
  return edited;
}

export function agentApiKeys(createdDaysAgo: readonly [number, number, number]): ApiKeySpec[] {
  return AGENT_KEY_NAMES.map((name, index) => ({ name, createdDaysAgo: createdDaysAgo[index] }));
}

export type AgentsPageText = {
  company: string;
  records: string;
  mate: string;
  claude: string;
  chatgpt: string;
  codex: string;
  followUp: string;
};

type AgentsPageCopy = { title: string; page: (text: AgentsPageText) => string[] };

const en: AgentsPageCopy = {
  title: "How our agents work with this CRM",
  page: (text) => [
    `This page explains how the people and the agents of ${text.company} work in this CRM: Mate inside the app, Claude, ChatGPT and Codex from outside through MCP or an API key. They all read and change the same ${text.records}, and nothing is sent to anyone without a person's review.`,
    "",
    "## Who does what",
    `- **Mate** works inside the app. ${text.mate}`,
    `- **Claude** is connected as a custom connector and works in conversation. ${text.claude}`,
    `- **ChatGPT** is connected the same way. ${text.chatgpt}`,
    `- **Codex** runs in the terminal with its own API key. ${text.codex}`,
    "",
    "## Approval before anything is sent",
    "- Agents save drafts, tasks and notes. A draft waits in the Inbox until a person has read it and presses send.",
    "- Routines never send a message and never delete a record.",
    "- Everything an agent writes into a note starts with who wrote it, for example \"Summary by Claude\", so a person's text and an agent's text are never mixed up.",
    "",
    "## The follow-up routine",
    text.followUp,
    "",
    "## Connecting an agent",
    "1. Claude and ChatGPT connect as a custom connector with a normal sign-in: Settings, API keys, Quick connections. Where a client cannot sign in, an API key from the same page does the same job.",
    "2. Codex, Claude Code and Claude Desktop use an API key from that page: one key per client and device, deleted when the device is gone.",
    "3. An agent can do what Max's role allows and nothing more. It works in this workspace as Max.",
  ],
};

const de: AgentsPageCopy = {
  title: "So arbeiten unsere Agenten mit diesem CRM",
  page: (text) => [
    `Diese Seite erklärt, wie die Menschen und die Agenten von ${text.company} in diesem CRM zusammenarbeiten: Mate in der App, Claude, ChatGPT und Codex von außen über MCP oder einen API-Schlüssel. Alle lesen und ändern dieselben ${text.records}, und ohne die Freigabe einer Person geht nichts an irgendjemanden raus.`,
    "",
    "## Wer macht was",
    `- **Mate** arbeitet in der App. ${text.mate}`,
    `- **Claude** ist als eigener Connector verbunden und arbeitet im Gespräch. ${text.claude}`,
    `- **ChatGPT** ist genauso verbunden. ${text.chatgpt}`,
    `- **Codex** läuft im Terminal mit einem eigenen API-Schlüssel. ${text.codex}`,
    "",
    "## Freigabe, bevor etwas rausgeht",
    "- Agenten speichern Entwürfe, Aufgaben und Notizen. Ein Entwurf wartet im Posteingang, bis eine Person ihn gelesen hat und auf Senden drückt.",
    "- Routinen senden nie eine Nachricht und löschen nie einen Datensatz.",
    "- Alles, was ein Agent in eine Notiz schreibt, beginnt mit dem Absender, zum Beispiel „Zusammenfassung von Claude“, damit Text von Personen und Text von Agenten nie verwechselt werden.",
    "",
    "## Die Nachfass-Routine",
    text.followUp,
    "",
    "## Einen Agenten verbinden",
    "1. Claude und ChatGPT verbinden sich als eigener Connector mit normaler Anmeldung: Einstellungen, API-Schlüssel, Schnellverbindungen. Wo ein Client sich nicht anmelden kann, erledigt ein API-Schlüssel von derselben Seite dasselbe.",
    "2. Codex, Claude Code und Claude Desktop nutzen einen API-Schlüssel von dieser Seite: ein Schlüssel pro Client und Gerät, gelöscht, wenn das Gerät nicht mehr gebraucht wird.",
    "3. Ein Agent darf, was die Rolle von Max erlaubt, und nicht mehr. Er arbeitet in diesem Workspace als Max.",
  ],
};

const COPY: Record<SolutionDataLocale, AgentsPageCopy> = { en, de };

export function agentsPage(locale: SolutionDataLocale, text: AgentsPageText): WikiPageSpec {
  const copy = COPY[locale];
  return { key: "agents", kind: "knowledge", title: copy.title, markdown: copy.page(text) };
}
