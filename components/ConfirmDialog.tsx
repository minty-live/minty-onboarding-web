"use client";

/**
 * A yes/no question (owner, 2026-11-17: every question uses minty-web's ConfirmDialog): PORT of
 * minty-web/components/ui/ConfirmDialog.tsx in this app's plain CSS (`.mw-dialog*` in
 * app/globals.css) - the title with Minty beside it, the sentences, the grey-edged way back and the
 * confirming button in the tone the change calls for (teal to add, orange to change, red to take
 * away). Escape and the backdrop take the way back; while the change is applied nothing closes it.
 * minty-web's is the design source: change them together.
 */

import { useId, type ReactNode } from "react";

import { ModalFrame } from "./ModalFrame";

export type ConfirmTone = "teal" | "orange" | "red";

export function ConfirmDialog({
  title,
  busy = false,
  confirmLabel,
  confirmTone = "teal",
  backLabel = "Go back",
  onConfirm,
  onBack,
  children,
}: {
  title: ReactNode;
  busy?: boolean;
  confirmLabel: string;
  confirmTone?: ConfirmTone;
  backLabel?: string;
  onConfirm: () => void;
  onBack: () => void;
  children?: ReactNode;
}) {
  const titleId = useId();
  return (
    <ModalFrame labelledBy={titleId} busy={busy} onDismiss={onBack} className="mw-dialog">
      <div className="mw-dialog-head">
        <div className="mw-dialog-head-text">
          <h2 id={titleId} className="mw-dialog-title">
            {title}
          </h2>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/minty-dont.png" alt="" className="mw-dialog-figure" />
      </div>
      {children}
      <div className="mw-dialog-actions">
        <button type="button" className="mw-dialog-btn is-grey" onClick={onBack} disabled={busy}>
          {backLabel}
        </button>
        <button
          type="button"
          className={`mw-dialog-btn is-${confirmTone}`}
          onClick={onConfirm}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          {confirmLabel}
        </button>
      </div>
    </ModalFrame>
  );
}
