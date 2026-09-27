import type { UpsertP13nData } from "@/features/p13n/upsert-p13n.interactor";

import { upsertP13nAction } from "@/app/actions";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

type PersistenceChannel = {
  latest: UpsertP13nData;
  pending: UpsertP13nData | null;
  running: boolean;
  timer: number | null;
};

const persistenceChannels = new Map<string, PersistenceChannel>();

export function latestP13nSnapshot<T extends UpsertP13nData>(channelKey: string): T | undefined {
  return persistenceChannels.get(channelKey)?.latest as T | undefined;
}

export function flushP13nPersistence(channelKey: string) {
  const channel = persistenceChannels.get(channelKey);
  if (!channel) return;

  if (channel.timer !== null) {
    window.clearTimeout(channel.timer);
    channel.timer = null;
  }
  if (channel.running) return;

  const snapshot = channel.pending;
  channel.pending = null;
  if (!snapshot) return;

  channel.running = true;
  void Promise.resolve()
    .then(async () => {
      const result = await upsertP13nAction(snapshot);
      if (!result.ok) toastZodErrorTree(result.error);
    })
    .catch(reportApplicationError)
    .finally(() => {
      channel.running = false;
      if (channel.pending && channel.timer === null) flushP13nPersistence(channelKey);
    });
}

export function scheduleP13nPersistence(channelKey: string, snapshot: UpsertP13nData, delayMs = 0) {
  let channel = persistenceChannels.get(channelKey);
  if (!channel) {
    channel = { latest: snapshot, pending: null, running: false, timer: null };
    persistenceChannels.set(channelKey, channel);
  }

  channel.latest = snapshot;
  channel.pending = snapshot;
  if (channel.timer !== null) window.clearTimeout(channel.timer);
  channel.timer = null;
  if (delayMs <= 0) {
    flushP13nPersistence(channelKey);
    return;
  }
  channel.timer = window.setTimeout(() => flushP13nPersistence(channelKey), delayMs);
}
