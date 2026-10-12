"use client";

import { useEffect, useState } from "react";

import type { RecordChoicesInput } from "@/features/records/get-record-choices.interactor";

import { RecordChoicesStore, recordChoicesKey } from "./record-choices.store";

export function useRecordChoices(input: RecordChoicesInput, enabled: boolean, attempt: number) {
  const [store] = useState(() => new RecordChoicesStore());
  const key = enabled ? recordChoicesKey(input, attempt) : null;
  const [request, setRequest] = useState({ key, input });
  if (request.key !== key) setRequest({ key, input });
  useEffect(() => {
    if (request.key === null) return;
    void store.load(request.key, request.input);
    return store.cancel;
  }, [request, store]);
  return store.read(key);
}
