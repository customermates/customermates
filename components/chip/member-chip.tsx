import type { RecordMember } from "@/features/records/record-model.schema";

import { AppChip } from "@/components/chip/app-chip";
import { Avatar } from "@/components/ui/avatar";

export function memberName(member: RecordMember) {
  return `${member.firstName} ${member.lastName}`.trim();
}

export function MemberAvatar({ member }: { member: RecordMember }) {
  return <Avatar aria-hidden name={[member.firstName, member.lastName]} size="sm" src={member.avatarUrl} />;
}

export function MemberChip({ member }: { member: RecordMember }) {
  return <AppChip startContent={<MemberAvatar member={member} />}>{memberName(member)}</AppChip>;
}
