export function formatHotelDateTime(value?: string | null, timezoneName?: string | null) {
  if (!value) return '—';
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: timezoneName || 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('day')} ${part('month')} ${part('year')}, ${part('hour')}:${part('minute')} ${part('dayPeriod').toUpperCase()}`;
}
