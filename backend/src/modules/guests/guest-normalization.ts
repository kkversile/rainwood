export function normalizeGuestEmail(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

export function normalizeGuestMobile(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  return hasPlus ? `+${digits}` : digits;
}
