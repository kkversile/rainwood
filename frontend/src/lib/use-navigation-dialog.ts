'use client';

import { useEffect, useRef, type RefObject } from 'react';

/** Keep a mobile navigation drawer modal for keyboard and pointer users. */
export function useNavigationDialog(open: boolean, panel: RefObject<HTMLElement | null>, trigger: RefObject<HTMLButtonElement | null>, onClose: () => void, capture = false) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), summary, [tabindex="0"]') ?? []).filter((element) => element.getClientRects().length > 0 && !element.closest('[inert], [aria-hidden="true"]'));
    const frame = requestAnimationFrame(() => controls()[0]?.focus());
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (capture) event.stopImmediatePropagation(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const items = controls(); const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keyboard, capture);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', keyboard, capture); document.body.style.overflow = previousOverflow; trigger.current?.focus(); };
  }, [open, panel, trigger, capture]);
}
