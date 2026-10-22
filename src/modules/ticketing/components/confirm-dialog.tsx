"use client";
import { useEffect, useId, useRef, type RefObject } from "react";
import { useTicketText } from "./shared";

export function TicketConfirmDialog({
  busy,
  close,
  confirm,
  returnFocus,
}: {
  busy: boolean;
  close: () => void;
  confirm: () => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTicketText();
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    // Child autofocus may already have run before this effect.
    const previous = returnFocus.current;
    const dialog = ref.current!;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      // Wait until React has removed the modal and background inertness clears.
      requestAnimationFrame(() => {
        if (previous?.isConnected) previous.focus();
      });
    };
  }, [returnFocus]);
  return (
    <dialog
      ref={ref}
      className="tk-confirm-dialog"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) {
          // Restore while the dialog is still attached; native close on a
          // detached node can race React cleanup and browser focus restoration.
          event.currentTarget.close();
          returnFocus.current?.focus();
          close();
        }
      }}
    >
      <h2 id={id}>{t.closeTitle}</h2>
      <p>{t.confirmClose}</p>
      <div>
        <button
          className="tk-button tk-secondary"
          disabled={busy}
          onClick={() => {
            ref.current?.close();
            returnFocus.current?.focus();
            close();
          }}
          autoFocus
        >
          {t.keepOrder}
        </button>
        <button
          className="tk-button tk-primary"
          disabled={busy}
          onClick={confirm}
        >
          {busy ? t.busy : t.closeAndChange}
        </button>
      </div>
    </dialog>
  );
}
