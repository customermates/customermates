"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActivityEntryDto, ActivityKind } from "@/ee/messaging/activities/activities.schema";
import type { RecordActivitiesInput, RecordActivityQuery } from "@/ee/messaging/activities/record-activities.schema";
import { ACTIVITY_KINDS } from "@/ee/messaging/activities/activities.schema";
import { getRecordActivitiesAction } from "@/app/[locale]/(protected)/records/actions";
import { useRootStore } from "@/core/stores/root-store.provider";
import { activityEntryKey } from "./activity-entry-key";

export function useRecordActivities(query: RecordActivityQuery) {
  const key = JSON.stringify(query);
  const stableQuery = useMemo(() => JSON.parse(key) as RecordActivityQuery, [key]);
  const root = useRootStore();
  const [items, setItems] = useState<ActivityEntryDto[]>([]);
  const [available, setAvailable] = useState<ActivityKind[]>([...ACTIVITY_KINDS]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const cursor = useRef<RecordActivitiesInput["cursor"]>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const load = useCallback(
    async (older = false) => {
      if (older && (pending.current || !cursor.current)) return;
      const request = ++generation.current;
      pending.current = true;
      setLoading(true);
      setError(false);
      try {
        const result = await getRecordActivitiesAction({
          ...stableQuery,
          cursor: older ? cursor.current : null,
          limit: 25,
        });
        if (request !== generation.current) return;
        if (!result.ok) throw new Error("Record activity request failed");
        setItems((previous) =>
          older
            ? [
                ...new Map(
                  [...previous, ...result.data.items].map((entry) => [activityEntryKey(entry), entry]),
                ).values(),
              ]
            : result.data.items,
        );
        cursor.current = result.data.nextCursor;
        setHasMore(Boolean(result.data.nextCursor));
        setAvailable(result.data.availableSources);
        setLoaded(true);
      } catch {
        if (request === generation.current) setError(true);
      } finally {
        if (request === generation.current) {
          pending.current = false;
          setLoading(false);
        }
      }
    },
    [stableQuery],
  );
  useEffect(() => {
    void load();
    const unsubscribe = root.recordWorkspaceStore.subscribe(() => load());
    return () => {
      generation.current += 1;
      unsubscribe();
    };
  }, [load, root]);
  return { items, available, loading, loaded, error, hasMore, load };
}
