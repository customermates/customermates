import type { SolutionDataLocale } from "@/core/solutions/solution-catalog";

import type { AgentAppSpec, ApiKeySpec, RecordSpec, WikiPageSpec } from "./define-solution";

export const AGENT_APPS = [
  {
    name: "Claude",
    slug: "claude",
    device: "Claude Desktop · MacBook Pro",
    redirectUrl: "https://claude.ai/api/mcp/auth_callback",
    activeMinutesAgo: 95,
  },
  {
    name: "ChatGPT",
    slug: "chatgpt",
    device: "chatgpt.com",
    redirectUrl: "https://chatgpt.com/connector_platform_oauth_redirect",
    activeMinutesAgo: 26 * 60,
  },
  {
    name: "Codex",
    slug: "codex",
    device: "Codex CLI · MacBook Pro",
    redirectUrl: "http://127.0.0.1:1455/auth/callback",
    activeMinutesAgo: 3 * 24 * 60 + 40,
  },
] as const;

export const AGENT_APP_NAMES = AGENT_APPS.map((app) => app.name);

export type AgentAppName = (typeof AGENT_APPS)[number]["name"];

/** Further AI apps a demo workspace may have connected next to Claude, ChatGPT and Codex, so each one looks its own. */
export const EXTRA_AGENT_APPS = {
  cursor: {
    name: "Cursor",
    device: "Cursor · Windows laptop",
    redirectUrl: "cursor://anysphere.cursor-mcp/oauth/callback",
  },
  gemini: {
    name: "Gemini CLI",
    device: "Gemini CLI · Ubuntu workstation",
    redirectUrl: "http://localhost:7777/oauth/callback",
  },
  grok: { name: "Grok", device: "grok.com", redirectUrl: "https://grok.com/connectors/oauth/callback" },
  langdock: {
    name: "Langdock",
    device: "app.langdock.com",
    redirectUrl: "https://app.langdock.com/api/mcp/oauth/callback",
  },
  claudeCode: {
    name: "Claude Code",
    device: "Claude Code · MacBook Air",
    redirectUrl: "http://localhost:54545/callback",
  },
} as const;

export type ExtraAgentApp = keyof typeof EXTRA_AGENT_APPS;

export const INTEGRATION_KEYS = [
  { name: "Zapier", lastUsedMinutesAgo: 40, requestCount: 1840 },
  { name: "n8n", lastUsedMinutesAgo: 9 * 60, requestCount: 612 },
  { name: "Webflow", lastUsedMinutesAgo: 2 * 24 * 60 + 180, requestCount: 87 },
  { name: "Make", lastUsedMinutesAgo: 75, requestCount: 1320 },
  { name: "Typeform", lastUsedMinutesAgo: 5 * 60, requestCount: 264 },
  { name: "Calendly", lastUsedMinutesAgo: 3 * 60, requestCount: 418 },
  { name: "Pipedream", lastUsedMinutesAgo: 26 * 60, requestCount: 351 },
  { name: "Tally", lastUsedMinutesAgo: 4 * 24 * 60, requestCount: 96 },
  { name: "Framer", lastUsedMinutesAgo: 6 * 24 * 60, requestCount: 58 },
] as const;

export type IntegrationKeyName = (typeof INTEGRATION_KEYS)[number]["name"];

/** A runner on someone's machine that runs agent steps with Claude Code, Codex or Gemini CLI under their own login. */
export type RunnerSpec = {
  name: string;
  machine: string;
  clients: readonly { name: "claude" | "codex" | "gemini"; version: string }[];
  createdDaysAgo: number;
  lastSeenMinutesAgo: number;
};

/** What makes one demo workspace's connections its own: extra AI apps, the tools with API keys and its runner. */
export type AgentConnectionProfile = {
  apps?: readonly ExtraAgentApp[];
  keys?: readonly IntegrationKeyName[];
  runner?: RunnerSpec;
};

const AGENT_EDIT_DAYS_AGO = 3;

type AuthoredRecords = Record<string, ReadonlyArray<Omit<RecordSpec, "avatar">>>;

/**
 * Records whose notes an agent wrote: each gets one recent update by Max, through the named API key of his profile,
 * that put the note in place. `edits` maps `<list>:<record key>` to the key's name.
 */
export function agentEdited(records: AuthoredRecords, edits: Readonly<Record<string, AgentAppName>>): AuthoredRecords {
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

/**
 * What a workspace shows under its connections: Claude, ChatGPT and Codex signed in over OAuth, connected
 * `connectedDaysAgo` days before the story end, and API keys of the tools that feed the CRM, created at the same
 * spacing and used recently.
 */
export function agentConnections(
  connectedDaysAgo: readonly [number, number, number],
  profile: AgentConnectionProfile = {},
): {
  agentApps: AgentAppSpec[];
  apiKeys: ApiKeySpec[];
  runners: RunnerSpec[];
} {
  const base = AGENT_APPS.map((app, index) => ({
    name: app.name,
    slug: app.slug,
    device: app.device,
    redirectUrl: app.redirectUrl,
    connectedDaysAgo: connectedDaysAgo[index],
    activeMinutesAgo: app.activeMinutesAgo,
  }));
  const extra = (profile.apps ?? []).map((slug, index) => ({
    ...EXTRA_AGENT_APPS[slug],
    slug,
    connectedDaysAgo: Math.max(2, connectedDaysAgo[2] - 3 - index * 2),
    activeMinutesAgo: 50 + index * 7 * 60,
  }));
  const keyNames = profile.keys ?? INTEGRATION_KEYS.slice(0, 3).map((key) => key.name);
  const apiKeys = keyNames.map((name, index) => {
    const key = INTEGRATION_KEYS.find((candidate) => candidate.name === name);
    if (!key) throw new Error(`Unknown integration key ${name}`);
    return {
      name: key.name,
      createdDaysAgo: connectedDaysAgo[Math.min(index, 2)] + 9 + index,
      lastUsedMinutesAgo: key.lastUsedMinutesAgo,
      requestCount: key.requestCount,
    };
  });
  return { agentApps: [...base, ...extra], apiKeys, runners: profile.runner ? [profile.runner] : [] };
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
    `- **Codex** runs in the terminal and signs in the same way. ${text.codex}`,
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
    "2. Codex, Claude Code and Claude Desktop sign in the same way; each device shows up under connected AI apps and is disconnected when it is gone. API keys are for tools such as Zapier or n8n: one key per tool, deleted when the tool is no longer used.",
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
    `- **Codex** läuft im Terminal und meldet sich genauso an. ${text.codex}`,
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
    "2. Codex, Claude Code und Claude Desktop melden sich genauso an; jedes Gerät erscheint unter den verbundenen KI-Apps und wird getrennt, wenn es nicht mehr gebraucht wird. API-Schlüssel sind für Tools wie Zapier oder n8n: ein Schlüssel pro Tool, gelöscht, wenn das Tool nicht mehr genutzt wird.",
    "3. Ein Agent darf, was die Rolle von Max erlaubt, und nicht mehr. Er arbeitet in diesem Workspace als Max.",
  ],
};

const es: AgentsPageCopy = {
  title: "Cómo trabajan nuestros agentes con este CRM",
  page: (text) => [
    `Esta página explica cómo trabajan juntos en este CRM las personas y los agentes de ${text.company}: Mate dentro de la app, y Claude, ChatGPT y Codex desde fuera, mediante MCP o una clave de API. Todos leen y modifican los mismos datos de ${text.records}, y sin la aprobación de una persona no se envía nada a nadie.`,
    "",
    "## Quién hace qué",
    `- **Mate** trabaja dentro de la app. ${text.mate}`,
    `- **Claude** está conectado como conector personalizado y trabaja en conversación. ${text.claude}`,
    `- **ChatGPT** está conectado de la misma forma. ${text.chatgpt}`,
    `- **Codex** se ejecuta en el terminal e inicia sesión de la misma manera. ${text.codex}`,
    "",
    "## Aprobación antes de enviar nada",
    "- Los agentes guardan borradores, tareas y notas. Un borrador espera en la Bandeja de entrada hasta que una persona lo lea y pulse Enviar.",
    "- Las rutinas nunca envían un mensaje ni eliminan un registro.",
    "- Todo lo que un agente escribe en una nota empieza por quién lo escribió, por ejemplo «Resumen de Claude», para que el texto de una persona y el de un agente nunca se confundan.",
    "",
    "## La rutina de seguimiento",
    text.followUp,
    "",
    "## Conectar un agente",
    "1. Claude y ChatGPT se conectan como conector personalizado con un inicio de sesión normal: Ajustes, Claves de API, Conexiones rápidas. Donde un cliente no puede iniciar sesión, una clave de API de la misma página hace el mismo trabajo.",
    "2. Codex, Claude Code y Claude Desktop inician sesión de la misma manera; cada dispositivo aparece en las apps de IA conectadas y se desconecta cuando deja de usarse. Las claves de API son para herramientas como Zapier o n8n: una clave por herramienta, que se elimina cuando la herramienta deja de usarse.",
    "3. Un agente puede hacer lo que permite el rol de Max y nada más. Trabaja en este espacio de trabajo como Max.",
  ],
};

const pt: AgentsPageCopy = {
  title: "Como nossos agentes trabalham com este CRM",
  page: (text) => [
    `Esta página explica como as pessoas e os agentes de ${text.company} trabalham juntos neste CRM: o Mate dentro do app, e o Claude, o ChatGPT e o Codex por fora, por meio do MCP ou de uma chave de API. Todos leem e alteram os mesmos dados de ${text.records}, e nada é enviado a ninguém sem a aprovação de uma pessoa.`,
    "",
    "## Quem faz o quê",
    `- **Mate** trabalha dentro do app. ${text.mate}`,
    `- **Claude** está conectado como conector personalizado e trabalha em conversa. ${text.claude}`,
    `- **ChatGPT** está conectado do mesmo jeito. ${text.chatgpt}`,
    `- **Codex** roda no terminal e faz login da mesma forma. ${text.codex}`,
    "",
    "## Aprovação antes de enviar qualquer coisa",
    "- Os agentes salvam rascunhos, tarefas e notas. Um rascunho fica esperando na Caixa de entrada até uma pessoa ler e clicar em Enviar.",
    "- As rotinas nunca enviam uma mensagem e nunca excluem um registro.",
    "- Tudo o que um agente escreve em uma nota começa por quem escreveu, por exemplo “Resumo do Claude”, para que o texto de uma pessoa e o de um agente nunca sejam confundidos.",
    "",
    "## A rotina de acompanhamento",
    text.followUp,
    "",
    "## Conectar um agente",
    "1. O Claude e o ChatGPT se conectam como conector personalizado com um login normal: Configurações, Chaves de API, Conexões rápidas. Onde um cliente não consegue fazer login, uma chave de API da mesma página faz o mesmo trabalho.",
    "2. O Codex, o Claude Code e o Claude Desktop fazem login da mesma forma; cada dispositivo aparece nos apps de IA conectados e é desconectado quando deixa de ser usado. As chaves de API são para ferramentas como Zapier ou n8n: uma chave por ferramenta, excluída quando a ferramenta deixa de ser usada.",
    "3. Um agente pode fazer o que a função do Max permite e nada além disso. Ele trabalha neste espaço de trabalho como o Max.",
  ],
};

const pl: AgentsPageCopy = {
  title: "Jak nasi agenci pracują z tym CRM",
  page: (text) => [
    `Ta strona wyjaśnia, jak ludzie i agenci firmy ${text.company} współpracują w tym CRM: Mate w aplikacji oraz Claude, ChatGPT i Codex z zewnątrz, przez MCP lub klucz API. Wszyscy czytają i zmieniają w tym samym CRM ${text.records}, a bez akceptacji człowieka nic do nikogo nie wychodzi.`,
    "",
    "## Kto co robi",
    `- **Mate** pracuje w aplikacji. ${text.mate}`,
    `- **Claude** jest połączony jako niestandardowy konektor i pracuje w rozmowie. ${text.claude}`,
    `- **ChatGPT** jest połączony w ten sam sposób. ${text.chatgpt}`,
    `- **Codex** działa w terminalu i loguje się w ten sam sposób. ${text.codex}`,
    "",
    "## Akceptacja, zanim cokolwiek wyjdzie",
    "- Agenci zapisują szkice, zadania i notatki. Szkic czeka w skrzynce odbiorczej, aż człowiek go przeczyta i kliknie Wyślij.",
    "- Rutyny nigdy nie wysyłają wiadomości i nigdy nie usuwają rekordów.",
    "- Wszystko, co agent zapisze w notatce, zaczyna się od informacji, kto to napisał, na przykład „Podsumowanie od Claude”, żeby tekst człowieka i tekst agenta nigdy się nie mieszały.",
    "",
    "## Rutyna follow-upów",
    text.followUp,
    "",
    "## Podłączanie agenta",
    "1. Claude i ChatGPT łączą się jako niestandardowy konektor ze zwykłym logowaniem: Ustawienia, Klucze API, Szybkie połączenia. Tam, gdzie klient nie potrafi się zalogować, to samo załatwia klucz API z tej samej strony.",
    "2. Codex, Claude Code i Claude Desktop logują się w ten sam sposób; każde urządzenie pojawia się wśród połączonych aplikacji AI i jest odłączane, gdy przestaje być używane. Klucze API są dla narzędzi takich jak Zapier czy n8n: jeden klucz na narzędzie, usuwany, gdy narzędzie przestaje być używane.",
    "3. Agent może robić to, na co pozwala rola Maxa, i nic więcej. Pracuje w tej przestrzeni roboczej jako Max.",
  ],
};

const nl: AgentsPageCopy = {
  title: "Zo werken onze agents met deze CRM",
  page: (text) => [
    `Deze pagina legt uit hoe de mensen en de agents van ${text.company} in dit CRM samenwerken: Mate in de app, en Claude, ChatGPT en Codex van buitenaf via MCP of een API-sleutel. Ze lezen en wijzigen allemaal dezelfde ${text.records}, en zonder de goedkeuring van een persoon wordt er niets naar wie dan ook verstuurd.`,
    "",
    "## Wie doet wat",
    `- **Mate** werkt in de app. ${text.mate}`,
    `- **Claude** is gekoppeld als eigen connector en werkt in gesprek. ${text.claude}`,
    `- **ChatGPT** is op dezelfde manier gekoppeld. ${text.chatgpt}`,
    `- **Codex** draait in de terminal en meldt zich op dezelfde manier aan. ${text.codex}`,
    "",
    "## Goedkeuring voordat er iets wordt verstuurd",
    "- Agents slaan concepten, taken en notities op. Een concept wacht in de Inbox tot een persoon het heeft gelezen en op Verzenden drukt.",
    "- Routines versturen nooit een bericht en verwijderen nooit een record.",
    "- Alles wat een agent in een notitie schrijft, begint met wie het schreef, bijvoorbeeld “Samenvatting door Claude”, zodat tekst van personen en tekst van agents nooit door elkaar raken.",
    "",
    "## De opvolgroutine",
    text.followUp,
    "",
    "## Een agent koppelen",
    "1. Claude en ChatGPT koppelen als eigen connector met een gewone aanmelding: Instellingen, API-sleutels, Snelle koppelingen. Waar een client zich niet kan aanmelden, doet een API-sleutel van dezelfde pagina hetzelfde werk.",
    "2. Codex, Claude Code en Claude Desktop melden zich op dezelfde manier aan; elk apparaat staat bij de gekoppelde AI-apps en wordt ontkoppeld zodra het niet meer wordt gebruikt. API-sleutels zijn voor tools zoals Zapier of n8n: één sleutel per tool, verwijderd zodra de tool niet meer wordt gebruikt.",
    "3. Een agent mag wat de rol van Max toestaat en niets meer. Hij werkt in deze werkruimte als Max.",
  ],
};

const COPY: Record<SolutionDataLocale, AgentsPageCopy> = { en, de, es, pt, pl, nl };

export function agentsPage(locale: SolutionDataLocale, text: AgentsPageText): WikiPageSpec {
  const copy = COPY[locale];
  return { key: "agents", kind: "knowledge", title: copy.title, markdown: copy.page(text) };
}
