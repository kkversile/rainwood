'use client';

import { FormEvent, useContext, useEffect, useRef, useState, createContext } from 'react';
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
  const [value, setValue] = useState(dialog.kind === 'prompt' ? dialog.value : '');

  useEffect(() => {
    if (dialog.kind === 'prompt') {
      setValue(dialog.value);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [dialog]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (dialog.kind === 'prompt') onPrompt(null);
      else if (dialog.kind === 'confirm') onConfirm(false);
      else onAlert();
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
    <form className={`uiModal${isDanger ? ' uiModalDanger' : ''}`} role="dialog" aria-modal="true" aria-labelledby="ui-modal-title" onSubmit={submit}>
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
