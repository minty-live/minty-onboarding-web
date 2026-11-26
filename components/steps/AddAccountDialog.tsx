"use client";

/**
 * "+ Add account" on the Petty Cash and Payment account-code lists (the user, 2026-11-26; Minty
 * keeping the books - with Xero, accounts are added in Xero). Accounting Setup's own add form in a
 * pop-up: an expense account (Expense, Direct costs or Overheads), its code suggested, saved at once
 * (POST /accounting/accounts). The list then offers it, ticked; Escape or Cancel adds nothing.
 */
import { useEffect, useId, useState } from "react";

import { ModalFrame } from "../ModalFrame";
import { AccountForm, EXPENSE_TYPES } from "./AccountingSetup";
import { accountingApi, type AccountingSetup } from "../../lib/accountingApi";

export default function AddAccountDialog({
  token,
  entityId,
  onClose,
  onAdded,
}: {
  token: string;
  entityId: string;
  onClose: () => void;
  /** The new account's code, once it is saved. */
  onAdded: (code: string) => void;
}) {
  const titleId = useId();
  const [setup, setSetup] = useState<Pick<AccountingSetup, "types" | "next_code"> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void accountingApi.setup(token, entityId).then((answer) => {
      if (!live) return;
      if (answer.ok) setSetup({ types: answer.types, next_code: answer.next_code });
      else setLoadError(answer.error);
    });
    return () => {
      live = false;
    };
  }, [token, entityId]);

  const typeLabels = Object.fromEntries((setup?.types ?? []).map((t) => [t.value, t.label]));

  return (
    <ModalFrame labelledBy={titleId} onDismiss={onClose} className="mw-dialog add-account-dialog">
      <h2 id={titleId} className="mw-dialog-title">
        Add an account
      </h2>
      {loadError ? (
        <p className="field-required" role="alert">
          {loadError}
        </p>
      ) : !setup ? (
        <p className="acs-loading">Loading…</p>
      ) : (
        <AccountForm
          idPrefix="add-account"
          title=""
          types={EXPENSE_TYPES}
          typeLabels={typeLabels}
          nextCode={setup.next_code}
          submitLabel="Add account"
          onCancel={onClose}
          onSave={async (input) => {
            setError(null);
            const answer = await accountingApi.create(token, entityId, input);
            if (answer.ok) onAdded(answer.account.code);
            // A refusal about a field shows at the field (AccountForm); one about the company
            // (permission, live on Xero) has no field, so it is said here.
            else if (Object.keys(answer.fields).length === 0) setError(answer.error);
            return answer;
          }}
        />
      )}
      {error ? (
        <p className="field-required" role="alert">
          {error}
        </p>
      ) : null}
    </ModalFrame>
  );
}
