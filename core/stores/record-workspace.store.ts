import { action, makeObservable, observable, reaction, runInAction } from "mobx";
import type { RootStore } from "./root.store";
import type { RecordNavigation } from "@/features/records/record-navigation.schema";
import { RecordEditorStore } from "@/app/[locale]/(protected)/records/[typeId]/components/record-editor.store";
import { getRecordEditorAction, getRecordNavigationAction } from "@/app/[locale]/(protected)/records/actions";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import type { RecordDetailLayoutResult } from "@/features/records/record-detail-layout.schema";
import { RecordDetailLayoutStore } from "./record-detail-layout.store";

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
        this.close();
        this.setEditor(null);
        this.setNavigation(null);
        this.navigationRequest += 1;
      },
    );
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
    (!pathname.startsWith("/records/") && pathname !== "/company/data-model") || this.readyRoutes.has(pathname);

  invalidate = async () => {
    await Promise.all([...this.detailLayouts.values()].map((layout) => layout.refresh()));
    const results = await Promise.allSettled([...this.listeners].map((listener) => listener()));
    for (const result of results) if (result.status === "rejected") reportApplicationError(result.reason);
  };

  getDetailLayout = (initial: RecordDetailLayoutResult) => {
    let layout = this.detailLayouts.get(initial.typeId);
    if (!layout) {
      layout = new RecordDetailLayoutStore(initial);
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

  open = (input: { typeId: string; recordId?: string }, target?: HTMLElement | null, fallback?: HTMLElement | null) => {
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
          this.setEditor(editor);
          editor.edit(result.data, result.data.record);
          if (target) editor.openFrom(target, fallback);
        } finally {
          if (opening === this.opening) this.setOpening(false);
        }
      }),
    );
  };
}
