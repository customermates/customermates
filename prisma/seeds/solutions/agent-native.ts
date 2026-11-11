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

const es: AgentsPageCopy = {
  title: "Cómo trabajan nuestros agentes con este CRM",
  page: (text) => [
    `Esta página explica cómo trabajan juntos en este CRM las personas y los agentes de ${text.company}: Mate dentro de la app, y Claude, ChatGPT y Codex desde fuera, mediante MCP o una clave de API. Todos leen y modifican los mismos datos de ${text.records}, y sin la aprobación de una persona no se envía nada a nadie.`,
    "",
    "## Quién hace qué",
    `- **Mate** trabaja dentro de la app. ${text.mate}`,
    `- **Claude** está conectado como conector personalizado y trabaja en conversación. ${text.claude}`,
    `- **ChatGPT** está conectado de la misma forma. ${text.chatgpt}`,
    `- **Codex** se ejecuta en el terminal con su propia clave de API. ${text.codex}`,
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
    "2. Codex, Claude Code y Claude Desktop usan una clave de API de esa página: una clave por cliente y dispositivo, que se elimina cuando el dispositivo deja de usarse.",
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
    `- **Codex** roda no terminal com a própria chave de API. ${text.codex}`,
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
    "2. O Codex, o Claude Code e o Claude Desktop usam uma chave de API dessa página: uma chave por cliente e dispositivo, excluída quando o dispositivo deixa de ser usado.",
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
    `- **Codex** działa w terminalu z własnym kluczem API. ${text.codex}`,
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
    "2. Codex, Claude Code i Claude Desktop używają klucza API z tej strony: jeden klucz na klienta i urządzenie, usuwany, gdy urządzenie przestaje być używane.",
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
    `- **Codex** draait in de terminal met een eigen API-sleutel. ${text.codex}`,
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
    "2. Codex, Claude Code en Claude Desktop gebruiken een API-sleutel van die pagina: één sleutel per client en apparaat, verwijderd zodra het apparaat niet meer wordt gebruikt.",
    "3. Een agent mag wat de rol van Max toestaat en niets meer. Hij werkt in deze werkruimte als Max.",
  ],
};

const COPY: Record<SolutionDataLocale, AgentsPageCopy> = { en, de, es, pt, pl, nl };

export function agentsPage(locale: SolutionDataLocale, text: AgentsPageText): WikiPageSpec {
  const copy = COPY[locale];
  return { key: "agents", kind: "knowledge", title: copy.title, markdown: copy.page(text) };
}
