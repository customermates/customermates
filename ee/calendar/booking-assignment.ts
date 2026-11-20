import type { HostLoad } from "./booking-reservation.repo";

export function orderHostsForBooking(freeHostIds: string[], loads: HostLoad[], pageOrder: string[]): string[] {
  const loadOf = new Map(loads.map((load) => [load.hostUserId, load]));
  const position = (hostId: string) => {
    const index = pageOrder.indexOf(hostId);
    return index === -1 ? pageOrder.length : index;
  };

  return [...freeHostIds].sort((left, right) => {
    const a = loadOf.get(left);
    const b = loadOf.get(right);
    const upcoming = (a?.upcoming ?? 0) - (b?.upcoming ?? 0);
    if (upcoming !== 0) return upcoming;
    const lastBooked = (a?.lastBookedAt?.getTime() ?? 0) - (b?.lastBookedAt?.getTime() ?? 0);
    if (lastBooked !== 0) return lastBooked;

    return position(left) - position(right);
  });
}
