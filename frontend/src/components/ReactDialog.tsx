'use client';

import { FormEvent, useContext, useEffect, useRef, useState, createContext, useId } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle, Info, X } from 'lucide-react';

type PromptOptions = {
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type AlertOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
};

type DialogState =
  | { kind: 'prompt'; options: PromptOptions; value: string; resolve: (value: string | null) => void }
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: 'alert'; options: AlertOptions; resolve: () => void };

type DialogApi = {
  prompt: (options: PromptOptions) => Promise<string | null>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions) => Promise<void>;
};

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog() {
  const value = useContext(DialogContext);
  if (!value) throw new Error('useDialog must be used inside DialogProvider');
  return value;
}

export function AccessibleDialog({ title, eyebrow, onClose, children, actions, className = '' }: { title: string; eyebrow?: string; onClose: () => void; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  const dialogRef = useRef<HTMLElement>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [portalReady, setPortalReady] = useState(false);
  const titleId = useId();
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { setPortalReady(true); }, []);
  useEffect(() => {
    if (!portalReady) return undefined;
    previousActiveRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus());
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')).filter((element) => !element.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow; previousActiveRef.current?.focus(); };
  }, [portalReady]);
  if (!portalReady) return null;
  return createPortal(<div className="dialogBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCloseRef.current(); }}><section ref={dialogRef} className={`dialogCard ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId}><div className="dialogHeader"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2 id={titleId}>{title}</h2></div><button className="iconButton" type="button" aria-label="Close dialog" onClick={() => onCloseRef.current()}><X size={17} /></button></div>{children}{actions && <div className="dialogActions">{actions}</div>}</section></div>, document.body);
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const api: DialogApi = {
    prompt: (options) => new Promise((resolve) => setDialog({ kind: 'prompt', options, value: options.defaultValue ?? '', resolve })),
    confirm: (options) => new Promise((resolve) => setDialog({ kind: 'confirm', options, resolve })),
    alert: (options) => new Promise((resolve) => setDialog({ kind: 'alert', options, resolve })),
  };

  function closePrompt(value: string | null) {
    if (!dialog || dialog.kind !== 'prompt') return;
    dialog.resolve(value);
    setDialog(null);
  }

  function closeConfirm(value: boolean) {
    if (!dialog || dialog.kind !== 'confirm') return;
    dialog.resolve(value);
    setDialog(null);
  }

  function closeAlert() {
    if (!dialog || dialog.kind !== 'alert') return;
    dialog.resolve();
    setDialog(null);
  }

  return <DialogContext.Provider value={api}>
    {children}
    {dialog && <DialogSurface dialog={dialog} onPrompt={closePrompt} onConfirm={closeConfirm} onAlert={closeAlert} />}
  </DialogContext.Provider>;
}

function DialogSurface({ dialog, onPrompt, onConfirm, onAlert }: { dialog: DialogState; onPrompt: (value: string | null) => void; onConfirm: (value: boolean) => void; onAlert: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const [value, setValue] = useState(dialog.kind === 'prompt' ? dialog.value : '');

  useEffect(() => {
    previousActiveRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog.kind === 'prompt') {
      setValue(dialog.value);
    }
    const frame = requestAnimationFrame(() => inputRef.current?.focus() ?? dialogRef.current?.querySelector<HTMLElement>('button')?.focus());
    return () => { cancelAnimationFrame(frame); previousActiveRef.current?.focus(); };
  }, [dialog]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (dialog.kind === 'prompt') onPrompt(null);
        else if (dialog.kind === 'confirm') onConfirm(false);
        else onAlert();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')).filter((element) => !element.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dialog, onAlert, onConfirm, onPrompt]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (dialog.kind === 'prompt') onPrompt(value);
    else if (dialog.kind === 'confirm') onConfirm(true);
    else onAlert();
  }

  const isDanger = dialog.kind === 'confirm' && dialog.options.danger;
  const title = dialog.options.title;
  const icon = dialog.kind === 'confirm' ? (isDanger ? <AlertTriangle size={18} /> : <HelpCircle size={18} />) : dialog.kind === 'alert' ? <Info size={18} /> : <HelpCircle size={18} />;

  return <div className="uiModalBackdrop" role="presentation" onMouseDown={(event) => { if (event.target !== event.currentTarget) return; if (dialog.kind === 'prompt') onPrompt(null); else if (dialog.kind === 'confirm') onConfirm(false); }}>
    <form ref={dialogRef} className={`uiModal${isDanger ? ' uiModalDanger' : ''}`} role="dialog" aria-modal="true" aria-labelledby="ui-modal-title" onSubmit={submit}>
      <header className="uiModalHeader"><div className="uiModalHeading"><span className="uiModalIcon">{icon}</span><h2 id="ui-modal-title">{title}</h2></div><button className="uiModalClose" type="button" aria-label="Close dialog" onClick={() => dialog.kind === 'prompt' ? onPrompt(null) : dialog.kind === 'confirm' ? onConfirm(false) : onAlert()}><X size={17} /></button></header>
      <div className="uiModalBody">
        {dialog.kind === 'prompt' && <label className="uiModalField"><span>{dialog.options.label ?? 'Value'}</span><input ref={inputRef} value={value} placeholder={dialog.options.placeholder} onChange={(event) => setValue(event.target.value)} /></label>}
        {dialog.kind !== 'prompt' && <p className="uiModalMessage">{dialog.options.message}</p>}
      </div>
      <footer className="uiModalActions">
        {dialog.kind !== 'alert' && <button className="uiModalButton secondary" type="button" onClick={() => dialog.kind === 'prompt' ? onPrompt(null) : onConfirm(false)}>{dialog.kind === 'prompt' ? (dialog.options.cancelLabel ?? 'Cancel') : (dialog.options.cancelLabel ?? 'Cancel')}</button>}
        <button className={`uiModalButton primary${isDanger ? ' danger' : ''}`} type="submit">{dialog.kind === 'prompt' ? (dialog.options.confirmLabel ?? 'Continue') : dialog.kind === 'confirm' ? (dialog.options.confirmLabel ?? 'Confirm') : (dialog.options.confirmLabel ?? 'Close')}</button>
      </footer>
    </form>
  </div>;
}
