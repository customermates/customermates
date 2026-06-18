import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { CustomFieldValueDto } from "@/core/base/base-entity.schema";
import type { IntlStore } from "@/core/stores/intl.store";
import type { UserModalStore } from "@/app/[locale]/(protected)/company/components/user/user-modal.store";
import type { ColumnDef } from "@tanstack/react-table";

import { AvatarStack } from "@/components/shared/avatar-stack";

import { CustomFieldValue } from "./custom-columns/custom-field-value";

type UserReference = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  email?: string | null;
};

type StandardEntity = HasId & {
  users?: UserReference[];
  customFieldValues: CustomFieldValueDto[];
  createdAt: Date;
  updatedAt: Date;
};

type Args<E extends StandardEntity> = {
  store: BaseDataViewStore<E>;
  intlStore: IntlStore;
  userModalStore: UserModalStore;
};

export function standardTailColumns<E extends StandardEntity>({
  store,
  intlStore,
  userModalStore,
}: Args<E>): ColumnDef<E>[] {
  return [
    ...store.customColumns.map<ColumnDef<E>>((column) => ({
      id: column.id,
      header: column.label,
      cell: ({ row }) => <CustomFieldValue column={column} item={row.original} store={store} />,
    })),
    {
      id: "users",
      cell: ({ row }) => (
        <AvatarStack items={row.original.users || []} onAvatarClick={(user) => void userModalStore.loadById(user.id)} />
      ),
    },
    {
      id: "updatedAt",
      cell: ({ row }) => (
        <span className="text-sm">{intlStore.formatNumericalShortDateTime(row.original.updatedAt)}</span>
      ),
    },
    {
      id: "createdAt",
      cell: ({ row }) => (
        <span className="text-sm">{intlStore.formatNumericalShortDateTime(row.original.createdAt)}</span>
      ),
    },
  ];
}
