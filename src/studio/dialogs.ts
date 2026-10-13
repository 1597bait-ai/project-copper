// Copper Studio's dialogs (not the browser's confirm(), which sandboxed pages may not show).

import { h, type Child } from './dom';

export interface DialogAction {
  label: string;
  kind?: 'primary' | 'danger';
  /** Return false to keep the dialog open. A promise shows the dialog busy until it settles. */
  run?: () => unknown;
  disabled?: boolean;
}

export interface Dialog {
  root: HTMLElement;
  body: HTMLElement;
  /** The action buttons, in order. */
  buttons: HTMLButtonElement[];
  close(): void;
  /** Busy: the buttons and Escape do nothing. */
  setBusy(on: boolean): void;
}

let ids = 0;

/** Opens a modal dialog inside `parent` (the Studio). Escape and the first button (when it has no `run`) close it. */
export function openDialog(parent: HTMLElement, opts: { title: string; body: Child[]; actions: DialogAction[]; onClose?: () => void }): Dialog {
  const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const titleId = `cs-dlg-${++ids}`;
  const body = h('div', { class: 'cs-dialog-body' }, ...opts.body);
  let busy = false;
  let closed = false;
  const buttons = opts.actions.map((a) => {
    const b = h('button', { class: `cs-btn${a.kind ? ` is-${a.kind}` : ''}`, type: 'button' }, a.label);
    b.disabled = !!a.disabled;
    b.addEventListener('click', () => {
      if (busy || closed) return;
      let result: unknown;
      try {
        result = a.run?.();
      } catch (e) {
        console.error(e);
        return;
      }
      if (result instanceof Promise) {
        dialog.setBusy(true);
        result.then(
          (v) => {
            dialog.setBusy(false);
            if (v !== false) dialog.close();
          },
          (e: unknown) => {
            console.error(e);
            dialog.setBusy(false);
          },
        );
      } else if (result !== false) dialog.close();
    });
    return b;
  });
  const box = h(
    'div',
    { class: 'cs-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div', { class: 'cs-dialog-head' }, h('h2', { id: titleId }, opts.title)),
    body,
    h('div', { class: 'cs-dialog-foot' }, buttons),
  );
  // Focusable, so a click on the dialog's text (or around it) keeps the focus inside the Studio
  // instead of dropping it on the page, where keys would reach the game and the map editor.
  const root = h('div', { class: 'cs-layer', tabindex: -1 }, box);
  const disabledBefore = new Map<HTMLButtonElement, boolean>();

  /** The newest dialog is the one keys go to. */
  const onTop = () => [...parent.querySelectorAll(':scope > .cs-layer')].pop() === root;
  // Keys pressed with the focus outside the Studio anyway (the page itself) are the dialog's too: they
  // never reach the game or the map editor behind it. (Keys inside the Studio never get this far.)
  const stray = (e: KeyboardEvent) => {
    if (closed || !onTop()) return;
    e.stopPropagation();
    if (e.key === 'Escape' && !busy) {
      e.preventDefault();
      dialog.close();
    } else root.focus({ preventScroll: true });
  };

  const dialog: Dialog = {
    root,
    body,
    buttons,
    close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', stray);
      root.remove();
      opts.onClose?.();
      if (before?.isConnected) before.focus();
    },
    setBusy(on) {
      if (busy === on) return;
      busy = on;
      root.setAttribute('aria-busy', String(on));
      for (const b of buttons) {
        if (on) {
          disabledBefore.set(b, b.disabled);
          b.disabled = true;
        } else b.disabled = disabledBefore.get(b) ?? false;
      }
    },
  };

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !busy) {
      e.preventDefault();
      dialog.close();
    } else if (e.key === 'Tab') {
      // Keep the keyboard inside the dialog.
      const items = [...box.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')].filter((el) => !(el as HTMLButtonElement).disabled && el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  parent.append(root);
  document.addEventListener('keydown', stray);
  const start = box.querySelector<HTMLElement>('textarea:not([readonly]), input:not([type=checkbox]), select') ?? buttons.find((b) => !b.disabled && b.classList.contains('is-primary')) ?? buttons[0];
  start?.focus({ preventScroll: true });
  return dialog;
}

/** Asks a yes/no question; resolves true for yes. */
export function confirmDialog(parent: HTMLElement, title: string, message: Child[], yes: string, kind: 'primary' | 'danger' = 'primary'): Promise<boolean> {
  return new Promise((resolve) => {
    let answer = false;
    openDialog(parent, {
      title,
      body: message,
      actions: [
        { label: 'Cancel' },
        {
          label: yes,
          kind,
          run: () => {
            answer = true;
          },
        },
      ],
      onClose: () => resolve(answer),
    });
  });
}
