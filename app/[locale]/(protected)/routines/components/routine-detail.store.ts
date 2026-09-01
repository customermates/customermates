import type { RootStore } from "@/core/stores/root.store";
import type { RoutineDto, RoutineRunDto } from "@/ee/routines/routine.schema";
import type { RoutineTranscriptMessage } from "@/ee/routines/get-routine-run-transcript.interactor";

import { action, computed, makeObservable, observable, runInAction } from "mobx";

import { getRoutineRunTranscriptAction, getRoutineRunsAction, runRoutineNowAction } from "../actions";

import { BaseStore } from "@/core/base/base.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export class RoutineDetailStore extends BaseStore {
  routine: RoutineDto | null = null;
  runs: RoutineRunDto[] = [];
  selectedRunId: string | null = null;
  transcript: RoutineTranscriptMessage[] = [];
  isTranscriptLoading = false;
  isStartingRun = false;

  constructor(rootStore: RootStore) {
    super(rootStore);

    makeObservable(this, {
      routine: observable,
      runs: observable,
      selectedRunId: observable,
      transcript: observable,
      isTranscriptLoading: observable,
      isStartingRun: observable,

      selectedRun: computed,

      hydrate: action,
      selectRun: action,
      refreshRuns: action,
      runNow: action,
      loadTranscript: action,
    });
  }

  get selectedRun(): RoutineRunDto | null {
    return this.runs.find((run) => run.id === this.selectedRunId) ?? null;
  }

  hydrate = (routine: RoutineDto, runs: RoutineRunDto[]) => {
    this.routine = routine;
    this.runs = runs;
    if (!this.selectedRunId || !runs.some((run) => run.id === this.selectedRunId))
      this.selectedRunId = runs[0]?.id ?? null;
  };

  selectRun = (runId: string) => {
    this.selectedRunId = runId;
  };

  refreshRuns = async () => {
    if (!this.routine) return;

    const runs = await getRoutineRunsAction({ routineId: this.routine.id, limit: 25 });
    runInAction(() => {
      this.runs = runs;
      if (!this.selectedRunId || !runs.some((run) => run.id === this.selectedRunId))
        this.selectedRunId = runs[0]?.id ?? null;
    });
  };

  runNow = async () => {
    if (!this.routine) return;

    this.isStartingRun = true;
    try {
      const res = await runRoutineNowAction({ routineId: this.routine.id });
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return;
      }

      await this.refreshRuns();
    } finally {
      runInAction(() => {
        this.isStartingRun = false;
      });
    }
  };

  loadTranscript = async (routineRunId: string) => {
    runInAction(() => {
      this.isTranscriptLoading = true;
    });

    try {
      const transcript = await getRoutineRunTranscriptAction({ routineRunId });
      runInAction(() => {
        if (this.selectedRunId === routineRunId) this.transcript = transcript;
      });
    } finally {
      runInAction(() => {
        this.isTranscriptLoading = false;
      });
    }
  };
}
