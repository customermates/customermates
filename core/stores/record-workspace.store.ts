import { action, makeObservable, observable, reaction, runInAction, toJS } from "mobx";
import type { RootStore } from "./root.store";
import type { RecordNavigation } from "@/features/records/record-navigation.schema";
import type { RecordDto, RecordRef } from "@/features/records/record-model.schema";
import type { RecordEditorContext } from "@/features/records/get-record-editor.interactor";
import type { RecordDraft } from "@/app/[locale]/(protected)/records/[typeId]/components/record-editor.store";
import { RecordEditorStore } from "@/app/[locale]/(protected)/records/[typeId]/components/record-editor.store";
import { getRecordEditorAction, getRecordNavigationAction } from "@/app/[locale]/(protected)/records/actions";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import type { RecordDetailLayoutResult } from "@/features/records/record-detail-layout.schema";
import { RecordDetailLayoutStore, type RecordDetailLayoutNotifications } from "./record-detail-layout.store";
import { toast } from "sonner";
import { handOffSheet } from "@/components/ui/overlay-contract";

export type RecordDraftHandoff = {
  presentation: RecordEditorContext;
  record: RecordDto;
  savedState: RecordDraft;
  form: RecordDraft;
};

const recordKey = (ref: RecordRef) => `${ref.typeId}:${ref.recordId}`;

export class RecordWorkspaceStore {
  navigation: RecordNavigation | null = null;
  navigationRefreshFailed = false;
  editor: RecordEditorStore | null = null;
  isOpening = false;
  private opening = 0;
  private navigationRequest = 0;
  private listeners = new Set<() => Promise<void>>();
  private readyRoutes = observable.map<string, number>();
  private detailLayouts = new Map<string, RecordDetailLayoutStore>();
  private draftHandoff: { key: string; draft: RecordDraftHandoff } | null = null;
  private pageEditor: {
    editor: RecordEditorStore;
    actorScope: string | null;
  } | null = null;

  constructor(private root: RootStore) {
    makeObservable(this, {
      navigation: observable.ref,
      navigationRefreshFailed: observable,
      editor: observable.ref,
      isOpening: observable,
      setNavigation: action,
      setEditor: action,
      setOpening: action,
      close: action,
      registerRoute: action,
    });
    reaction(
      () => this.actorScope,
      () => {
        for (const layout of this.detailLayouts.values()) {
          layout.dispose();
          this.root.navigationGuard.unregister(layout);
        }
        this.detailLayouts.clear();
        this.draftHandoff = null;
        this.pageEditor = null;
        this.close();
        this.setEditor(null);
        this.setNavigation(null);
        this.navigationRequest += 1;
      },
    );
  }

  get activeEditor(): RecordEditorStore | null {
    if (this.editor?.isOpen && this.editor.record) return this.editor;
    const page = this.pageEditor;
    return page && page.actorScope === this.actorScope && page.editor.record ? page.editor : null;
  }

  private get actorScope() {
    const user = this.root.userStore.user;
    return user ? `${user.companyId}:${user.id}` : null;
  }

  setNavigation = (navigation: RecordNavigation | null) => {
    if (navigation && navigation.companyId !== this.root.userStore.user?.companyId) return;
    if (navigation && this.navigation && navigation.schemaRevision < this.navigation.schemaRevision) return;
    const recovered = !navigation || !this.navigation || navigation.schemaRevision > this.navigation.schemaRevision;
    this.navigation = navigation;
    if (recovered) this.navigationRefreshFailed = false;
  };

  refreshNavigation = async () => {
    const scope = this.actorScope;
    const request = ++this.navigationRequest;
    try {
      const navigation = await getRecordNavigationAction();
      if (scope !== this.actorScope || request !== this.navigationRequest) return;
      runInAction(() => {
        this.setNavigation(navigation);
        if (this.navigation === navigation) this.navigationRefreshFailed = false;
      });
    } catch (error) {
      if (scope === this.actorScope && request === this.navigationRequest) {
        runInAction(() => {
          this.navigationRefreshFailed = true;
        });
      }
      throw error;
    }
  };

  setOpening = (opening: boolean) => {
    this.isOpening = opening;
  };

  setEditor = (editor: RecordEditorStore | null) => {
    if (this.editor) {
      this.editor.close();
      this.root.unregisterModalStore(this.editor);
    }
    this.editor = editor;
    if (editor) this.root.registerModalStore(editor);
  };

  subscribe = (listener: () => Promise<void>) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  registerRoute = (pathname: string) => {
    this.readyRoutes.set(pathname, (this.readyRoutes.get(pathname) ?? 0) + 1);
    return action(() => {
      const count = this.readyRoutes.get(pathname) ?? 0;
      if (count <= 1) this.readyRoutes.delete(pathname);
      else this.readyRoutes.set(pathname, count - 1);
    });
  };

  routeReady = (pathname: string) =>
    (!pathname.startsWith("/records/") && pathname !== "/configure") || this.readyRoutes.has(pathname);

  registerPageEditor = (editor: RecordEditorStore) => {
    const registration = { editor, actorScope: this.actorScope };
    this.pageEditor = registration;
    return () => {
      if (this.pageEditor === registration) this.pageEditor = null;
    };
  };

  handOffDraft = (editor: RecordEditorStore, discardPageDraft = false): boolean => {
    const handoff =
      editor.record && editor.hasUnsavedChanges
        ? {
            key: recordKey(editor.record.ref),
            draft: {
              presentation: editor.presentation,
              record: editor.record,
              savedState: toJS(editor.savedState),
              form: toJS(editor.form),
            },
          }
        : null;
    const page = this.pageEditor?.actorScope === this.actorScope ? this.pageEditor.editor : null;
    if (
      page &&
      page !== editor &&
      page.record &&
      editor.record &&
      recordKey(page.record.ref) === recordKey(editor.record.ref)
    ) {
      const compose = this.root.threadComposeStore;
      const ownsCompose = compose?.sourceContextKey === page.channelComposeKey;
      if (page.isLoading || page.pendingOperationId || (ownsCompose && compose.isLoading)) return false;
      if ((page.hasUnsavedChanges || page.hasRelatedDraft) && !discardPageDraft) return false;
      const pageIsLatest =
        page.presentation.model.revision >= editor.presentation.model.revision &&
        page.record.version >= editor.record.version;
      const drawerIsLatest =
        editor.presentation.model.revision >= page.presentation.model.revision &&
        editor.record.version >= page.record.version;
      if (!pageIsLatest && !drawerIsLatest) {
        editor.markStale();
        return false;
      }
      const latest = drawerIsLatest ? editor : page;
      if (ownsCompose) compose.discardNewThread();
      if (handoff) page.restoreDraft(handoff.draft, latest.presentation, latest.record as RecordDto);
      else {
        page.resetForm();
        page.receiveLatest({ ...latest.presentation, record: latest.record });
      }
      this.draftHandoff = null;
      return true;
    }
    this.draftHandoff = handoff;
    return true;
  };

  takeDraftHandoff = (ref: RecordRef | undefined) => {
    const handoff = this.draftHandoff;
    this.draftHandoff = null;
    return handoff && ref && handoff.key === recordKey(ref) ? handoff.draft : null;
  };

  invalidate = async () => {
    await Promise.all([...this.detailLayouts.values()].map((layout) => layout.refresh()));
    const results = await Promise.allSettled([...this.listeners].map((listener) => listener()));
    for (const result of results) if (result.status === "rejected") reportApplicationError(result.reason);
  };

  private readonly layoutNotifications: RecordDetailLayoutNotifications = {
    saveFailed: (layout) => {
      const t = this.root.localeStore.getTranslation;
      toast.error(t("RecordModel.detailLayoutSaveFailed"), {
        id: `record-detail-layout:${layout.state.typeId}`,
        duration: Infinity,
        action: {
          label: t("ErrorCard.retry"),
          onClick: () => runUserAction(layout.retry),
        },
        cancel: { label: t("Common.actions.discard"), onClick: layout.discard },
      });
    },
    saveRecovered: (layout) => {
      toast.dismiss(`record-detail-layout:${layout.state.typeId}`);
    },
  };

  getDetailLayout = (initial: RecordDetailLayoutResult) => {
    let layout = this.detailLayouts.get(initial.typeId);
    if (!layout) {
      layout = new RecordDetailLayoutStore(initial, this.layoutNotifications);
      this.detailLayouts.set(initial.typeId, layout);
      this.root.navigationGuard.register(layout);
    }
    return layout;
  };

  close = () => {
    this.opening += 1;
    this.setOpening(false);
    this.editor?.close();
  };

  open = (
    input: { typeId: string; recordId?: string; values?: Record<string, unknown> },
    target?: HTMLElement | null,
    fallback?: HTMLElement | null,
  ) => {
    this.root.navigationGuard.tryNavigate(() =>
      runUserAction(async () => {
        const scope = this.actorScope;
        const opening = ++this.opening;
        this.setOpening(true);
        try {
          const result = await getRecordEditorAction({
            typeId: input.typeId,
            ...(input.recordId ? { recordId: input.recordId } : {}),
          });
          if (opening !== this.opening || scope !== this.actorScope) return;
          if (!result.ok) {
            toastZodErrorTree(result.error);
            return;
          }
          const editor = new RecordEditorStore(this.root, result.data, this.invalidate);
          handOffSheet();
          this.setEditor(editor);
          editor.edit(result.data, result.data.record);
          for (const [fieldId, value] of Object.entries(input.values ?? {}))
            editor.onChange(`values.${fieldId}`, value);
          if (target) editor.openFrom(target, fallback);
        } finally {
          if (opening === this.opening) this.setOpening(false);
        }
      }),
    );
  };
}
