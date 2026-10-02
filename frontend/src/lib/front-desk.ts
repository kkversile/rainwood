export type FrontDeskView = 'arrivals' | 'in-house' | 'departures' | 'exceptions';

export const FRONT_DESK_VIEWS: readonly FrontDeskView[] = ['arrivals', 'in-house', 'departures', 'exceptions'];

export function frontDeskView(value: string | null | undefined): FrontDeskView {
  return FRONT_DESK_VIEWS.includes(value as FrontDeskView) ? value as FrontDeskView : 'arrivals';
}

export function frontDeskQuery(view: FrontDeskView, search: string, page = 1) {
  const query = new URLSearchParams({ view });
  if (search.trim()) query.set('search', search.trim());
  if (page > 1) query.set('page', String(page));
  return query;
}

export function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(element && typeof element.closest === 'function' && element.closest('input, textarea, select, [contenteditable="true"]'));
}

export function frontDeskShortcut(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>, editing: boolean) {
  if (editing || event.altKey || event.shiftKey) return null;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') return 'search' as const;
  if (!event.ctrlKey && !event.metaKey) {
    if (event.key.toLowerCase() === 'a') return 'arrivals' as const;
    if (event.key.toLowerCase() === 'i') return 'in-house' as const;
    if (event.key.toLowerCase() === 'd') return 'departures' as const;
  }
  return null;
}

export type FrontDeskException = {
  id: string;
  kind: 'ROOM' | 'SETTLEMENT' | 'RECONFIRMATION';
  title: string;
  detail: string;
  reference: string;
  guestName: string;
  urgency: 'attention' | 'info';
};

export function categorizeFrontDeskExceptions(rows: Array<{ reference: string; guestName: string; stayStatus?: string | null; status?: string | null; reconfirmed?: boolean; balance?: number | string | null; assignedRooms?: Array<{ status?: string | null }> }>): FrontDeskException[] {
  const result: FrontDeskException[] = [];
  for (const row of rows) {
    const rooms = row.assignedRooms ?? [];
    if (row.stayStatus === 'EXPECTED' && rooms.length === 0) result.push({ id: `${row.reference}-room-missing`, kind: 'ROOM', title: 'Room not assigned', detail: 'Assign a valid room before check-in.', reference: row.reference, guestName: row.guestName, urgency: 'attention' });
    if (row.stayStatus === 'EXPECTED' && rooms.some((room) => ['DIRTY', 'CLEANING', 'OOO', 'OUT_OF_ORDER'].includes(String(room.status)))) result.push({ id: `${row.reference}-room-ready`, kind: 'ROOM', title: 'Room not ready', detail: 'The assigned room needs operational attention before check-in.', reference: row.reference, guestName: row.guestName, urgency: 'attention' });
    if (row.stayStatus === 'EXPECTED' && row.reconfirmed === false) result.push({ id: `${row.reference}-reconfirm`, kind: 'RECONFIRMATION', title: 'Arrival not reconfirmed', detail: 'Review the arrival and reconfirm it if required.', reference: row.reference, guestName: row.guestName, urgency: 'info' });
    if (row.stayStatus === 'CHECKED_IN' && Number(row.balance ?? 0) > 0.005) result.push({ id: `${row.reference}-balance`, kind: 'SETTLEMENT', title: 'Outstanding balance', detail: 'Review the folio and collect or authorize the balance.', reference: row.reference, guestName: row.guestName, urgency: 'attention' });
  }
  return result;
}
