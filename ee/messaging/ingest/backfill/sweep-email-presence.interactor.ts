import type { MessagingService } from "../../messaging.service";
import type { MessagingIngestRepo } from "../messaging-ingest.repo";
import type { ConnectedAccount } from "@/generated/prisma";
import type { BackfillConnectedAccountRepo, EmailPresenceAccount, EmailSighting } from "./backfill.repo";
import type { PageResult } from "./paginate";

import { z } from "zod";

import { ConnectedAccountStatus, MessagingProvider } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import {
  BACKFILL_EMAIL_PAGE_BUDGET,
  BACKFILL_EMAIL_STEP_BUDGET_MS,
  BACKFILL_EMAIL_TIMEOUT_MS,
  paginateStep,
  UNIPILE_EMAIL_MAX_LIMIT,
} from "./paginate";
import { stopWhenAccountGone } from "./account-gone";

const EMAIL_PRESENCE_MAX_PAGES = 2_000;
const EMAIL_PRESENCE_MARGIN_MS = 24 * 60 * 60 * 1000;
const FOLDER_LIST_MAX_PAGES = 20;

const Schema = z.object({
  connectedAccountId: z.uuid(),
  cursor: z.string().nullable(),
});
type SweepEmailPresencePayload = z.infer<typeof Schema>;

const SweepStateSchema = z.object({
  startedAt: z.string(),
  since: z.string(),
  folders: z.array(z.string()).min(1),
  index: z.number().int().min(0),
  page: z.string().nullable(),
  pages: z.number().int().min(0),
});
type SweepState = z.infer<typeof SweepStateSchema>;

const FolderPageSchema = z.looseObject({
  data: z.array(z.looseObject({ id: z.string() })),
  total_count: z.number().nullish(),
  next_cursor: z.string().nullish(),
});

const ListedEmailSchema = z.looseObject({
  id: z.string().min(1),
  message_id: z.string().nullish(),
});

const INCONCLUSIVE: PageResult = { nextCursor: null, done: true, complete: false };

@SystemInteractor
export class SweepEmailPresenceInteractor {
  constructor(
    private repo: BackfillConnectedAccountRepo,
    private messagingService: MessagingService,
    private ingest: MessagingIngestRepo,
  ) {}

  @Enforce(Schema)
  invoke(payload: SweepEmailPresencePayload): Promise<PageResult> {
    return stopWhenAccountGone(() => this.sweepStep(payload));
  }

  private async sweepStep({ connectedAccountId, cursor }: SweepEmailPresencePayload): Promise<PageResult> {
    const account = await this.repo.findAccountByIdUnscoped(connectedAccountId);
    if (!account || account.status === ConnectedAccountStatus.deleted || account.provider !== MessagingProvider.mail)
      return INCONCLUSIVE;

    const scope = { companyId: account.companyId, connectedAccountId: account.id };
    const begun = cursor === null ? await this.begin(account, scope) : parseState(cursor);
    if (begun === "nothing") return { nextCursor: null, done: true, complete: true };
    if (!begun) {
      await this.repo.clearEmailPresenceSweepUnscoped(scope);
      return INCONCLUSIVE;
    }

    const state = begun;
    const stepStartedAt = Date.now();
    let pagesLeft = BACKFILL_EMAIL_PAGE_BUDGET;

    while (state.index < state.folders.length) {
      const timeLeft = BACKFILL_EMAIL_STEP_BUDGET_MS - (Date.now() - stepStartedAt);
      if (pagesLeft <= 0 || timeLeft <= 0) return { nextCursor: JSON.stringify(state), done: false, complete: false };

      const folderId = state.folders[state.index];
      const sightings: EmailSighting[] = [];
      let unreadable = false;
      let fetched = 0;

      const result = await paginateStep({
        startCursor: state.page,
        limit: UNIPILE_EMAIL_MAX_LIMIT,
        maxPages: pagesLeft,
        timeBudgetMs: timeLeft,
        fetchPage: (query) => {
          fetched += 1;
          return this.messagingService.listFolderEmails({
            accountId: account.unipileAccountId,
            folderId,
            after: state.since,
            metaOnly: true,
            limit: UNIPILE_EMAIL_MAX_LIMIT,
            cursor: query.cursor,
            offset: query.offset,
            timeoutMs: BACKFILL_EMAIL_TIMEOUT_MS,
          });
        },
        handleItem: (raw) => {
          const parsed = ListedEmailSchema.safeParse(raw);
          if (!parsed.success) unreadable = true;
          const sighting = parsed.success
            ? { folderId, unipileMessageId: parsed.data.id, providerMessageId: parsed.data.message_id?.trim() || null }
            : null;
          if (sighting) sightings.push(sighting);
          return Promise.resolve();
        },
      });

      pagesLeft -= fetched;
      state.pages += fetched;

      if (unreadable || (result.done && !result.complete) || state.pages > EMAIL_PRESENCE_MAX_PAGES) {
        await this.repo.clearEmailPresenceSweepUnscoped(scope);
        return INCONCLUSIVE;
      }

      await this.repo.recordEmailSightingsUnscoped({ ...scope, sightings });

      state.index += result.done ? 1 : 0;
      state.page = result.done ? null : result.nextCursor;
    }

    const sightings = await this.repo.listEmailSightingsUnscoped(scope);
    await this.ingest.reconcileEmailPresenceUnscoped({ ...scope, startedAt: new Date(state.startedAt), sightings });
    await this.repo.clearEmailPresenceSweepUnscoped(scope);

    return { nextCursor: null, done: true, complete: true };
  }

  private async begin(account: ConnectedAccount, scope: EmailPresenceAccount): Promise<SweepState | "nothing" | null> {
    const startedAt = new Date();
    const folders = await this.listEveryFolder(account.unipileAccountId);
    if (!folders) return null;

    const oldest = await this.ingest.findEmailPresenceHorizonUnscoped({ ...scope, startedAt });
    if (!oldest) return "nothing";

    await this.repo.clearEmailPresenceSweepUnscoped(scope);

    return {
      startedAt: startedAt.toISOString(),
      since: new Date(oldest.getTime() - EMAIL_PRESENCE_MARGIN_MS).toISOString(),
      folders,
      index: 0,
      page: null,
      pages: 0,
    };
  }

  private async listEveryFolder(unipileAccountId: string): Promise<string[] | null> {
    const ids: string[] = [];
    let cursor: string | undefined;
    let expected: number | null = null;

    for (let page = 0; page < FOLDER_LIST_MAX_PAGES; page++) {
      const parsed = FolderPageSchema.safeParse(
        await this.messagingService.listFolders({
          accountId: unipileAccountId,
          cursor,
          timeoutMs: BACKFILL_EMAIL_TIMEOUT_MS,
        }),
      );
      if (!parsed.success) return null;

      ids.push(...parsed.data.data.map((folder) => folder.id));
      expected = parsed.data.total_count ?? expected;

      if (!parsed.data.next_cursor) {
        const unique = [...new Set(ids)].sort();
        if (unique.length === 0) return null;
        if (expected !== null && expected !== unique.length) return null;
        return unique;
      }
      cursor = parsed.data.next_cursor;
    }

    return null;
  }
}

function parseState(cursor: string): SweepState | null {
  try {
    const parsed = SweepStateSchema.safeParse(JSON.parse(cursor));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
