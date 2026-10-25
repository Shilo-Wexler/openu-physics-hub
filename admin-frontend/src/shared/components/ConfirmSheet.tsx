/** The console's own "are you sure?": a sheet that rises from the bottom, like an iOS action sheet, in place
    of the browser's window.confirm (which can't be styled, and shows the site's address and English buttons).
    One sheet serves the whole console: ConfirmProvider holds it, and useConfirm() asks it from any screen. */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import styles from "./ConfirmSheet.module.css";

export interface ConfirmRequest {
  /** What is about to happen, in a sentence. */
  message: string;
  /** The button that goes ahead, such as "הסרת ההודעה". */
  action: string;
  /** Red: the action removes, blocks or throws something away. */
  danger?: boolean;
  /** The button that stays; "ביטול" unless said otherwise. */
  cancel?: string;
}

/** Shows the sheet and answers true (go ahead) or false (cancel, Esc, or a tap outside). */
export type Confirm = (request: ConfirmRequest) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm needs a ConfirmProvider above it");
  return confirm;
}

interface Pending {
  request: ConfirmRequest;
  resolve: (answer: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  // The open question, also outside React's render: a new one answers it "no" before taking its place.
  const open = useRef<Pending | null>(null);

  const confirm = useCallback<Confirm>(
    (request) =>
      new Promise<boolean>((resolve) => {
        open.current?.resolve(false);
        open.current = { request, resolve };
        setPending(open.current);
      }),
    [],
  );

  function answer(ok: boolean) {
    open.current?.resolve(ok);
    open.current = null;
    setPending(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {/* key: a new question is a fresh sheet, opened again. */}
      {pending && <Sheet key={pending.request.message} request={pending.request} onAnswer={answer} />}
    </ConfirmContext.Provider>
  );
}

function Sheet({ request, onAnswer }: { request: ConfirmRequest; onAnswer: (ok: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // showModal: the page behind can't be reached, and a screen reader stays inside the sheet.
    dialog.current?.showModal();
    // The safe button gets the focus, so Enter never removes anything by accident.
    cancel.current?.focus();
  }, []);

  return (
    <dialog
      ref={dialog}
      className={styles.sheet}
      aria-labelledby="confirm-message"
      // Esc: answered here (not closed by the browser), so the state and the dialog stay in step.
      onCancel={(event) => {
        event.preventDefault();
        onAnswer(false);
      }}
      // The dialog fills the screen and the panel sits at its bottom: a tap on the dialog itself is outside.
      onClick={(event) => {
        if (event.target === event.currentTarget) onAnswer(false);
      }}
    >
      <div className={styles.panel}>
        <div className={styles.group}>
          <p id="confirm-message" className={styles.message}>
            {request.message}
          </p>
          <button
            type="button"
            className={request.danger ? `${styles.button} ${styles.danger}` : styles.button}
            onClick={() => onAnswer(true)}
          >
            {request.action}
          </button>
        </div>
        <button ref={cancel} type="button" className={`${styles.button} ${styles.cancel}`} onClick={() => onAnswer(false)}>
          {request.cancel ?? "ביטול"}
        </button>
      </div>
    </dialog>
  );
}