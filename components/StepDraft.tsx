"use client";

/**
 * The open step's auto-saved draft (lib/stepDraft.ts has the rules): one `useAutoSaveDraft` per
 * step, keyed by the step so leaving it (Back, the stepper) unmounts this binding - which writes
 * what was typed in the last 2 seconds under THAT step's key - and the next step opens its own.
 * The step's own save calls `clearRef` first (OnboardingApp `next`), so a finished step leaves
 * nothing behind.
 *
 * The notice sits at the top of the step: "You have unsaved changes from 10:42." - Restore puts the
 * step's values and its step-local inputs back, Discard removes the draft; nothing changes until
 * the person picks. A draft that holds exactly what is on screen already (a Back and forth in the
 * same visit, or the pre-company copy the local session restores) is taken quietly, no notice.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { fingerprint, useAutoSaveDraft, type DraftScope } from "@minty/shared/drafts";
import { DraftNotice } from "@minty/shared/ui";

import {
  STEP_DRAFT_FORM,
  STEP_DRAFT_SHAPE,
  StepDraftContext,
  applyDraftSlice,
  describeStepDraft,
  draftSlice,
  sliceMark,
  type StepDraftRegistry,
  type StepDraftValue,
  type StepSlice,
} from "../lib/stepDraft";
import type { SetState, WizardState } from "../lib/types";

export type StepDraftClear = { current: (() => void) | null };

export function StepDraftBinding({
  step,
  scope,
  ready,
  state,
  set,
  serverSlice,
  clearRef,
  children,
}: {
  step: number;
  /** The person and company (`draftScopeFromToken`); null = no drafts (no token). */
  scope: DraftScope | null;
  /** The step's values are known: the resume has settled and the step's own loads are in. */
  ready: boolean;
  state: WizardState;
  set: SetState;
  /** The step's values as the server last gave or took them; null until known. */
  serverSlice: StepSlice | null;
  /** Where the wizard finds this step's `clear` (its Save & Next / Save & Exit call it). */
  clearRef: StepDraftClear;
  children: ReactNode;
}) {
  // ---- step-local inputs (useStepDraftField) ----
  const [locals, setLocals] = useState<Record<string, unknown>>({});
  const setters = useRef(new Map<string, (value: unknown) => void>());
  const pending = useRef(new Map<string, unknown>());
  const [registry] = useState<StepDraftRegistry>(() => ({
    attach(name, put) {
      setters.current.set(name, put);
      if (pending.current.has(name)) {
        const value = pending.current.get(name);
        pending.current.delete(name);
        put(value);
      }
      return () => {
        if (setters.current.get(name) === put) setters.current.delete(name);
        setLocals((prev) => {
          if (!(name in prev)) return prev;
          const rest = { ...prev };
          delete rest[name];
          return rest;
        });
      };
    },
    report(name, value) {
      setLocals((prev) => {
        if (value === undefined) {
          if (!(name in prev)) return prev;
          const rest = { ...prev };
          delete rest[name];
          return rest;
        }
        if (name in prev && JSON.stringify(prev[name]) === JSON.stringify(value)) return prev;
        return { ...prev, [name]: value };
      });
    },
  }));

  // ---- the draft ----
  const slice = useMemo(() => draftSlice(step, state), [step, state]);
  const value: StepDraftValue = useMemo(() => ({ state: slice, locals }), [slice, locals]);
  const live = ready && serverSlice !== null && scope !== null;
  const basedOn = serverSlice ? sliceMark(step, serverSlice) : null;
  const dirty = live && (sliceMark(step, slice) !== basedOn || Object.keys(locals).length > 0);
  const draft = useAutoSaveDraft<StepDraftValue>({
    scope: live ? scope : null,
    form: STEP_DRAFT_FORM,
    record: String(step),
    shape: STEP_DRAFT_SHAPE,
    ready: live,
    basedOn,
    value,
    dirty,
  });

  useEffect(() => {
    const clear = draft.clear;
    clearRef.current = clear;
    return () => {
      if (clearRef.current === clear) clearRef.current = null;
    };
  }, [clearRef, draft.clear]);

  // What is typed now, as the draft would hold it - to take an offer that changes nothing quietly.
  const shownMark = sliceMark(step, slice) + fingerprint(locals);
  const { offer, restore } = draft;
  useEffect(() => {
    if (!offer || offer.stale) return;
    const offered =
      sliceMark(step, offer.value?.state ?? {}) + fingerprint(offer.value?.locals ?? {});
    if (offered === shownMark) restore();
  }, [offer, restore, shownMark, step]);

  const onRestore = useCallback(() => {
    const taken = restore();
    if (!taken) return;
    const back = taken.value;
    set((prev) => applyDraftSlice(step, prev, back?.state ?? {}));
    for (const [name, v] of Object.entries(back?.locals ?? {})) {
      const put = setters.current.get(name);
      if (put) put(v);
      else pending.current.set(name, v); // its input is not on screen yet: put back when it mounts
    }
  }, [restore, set, step]);

  return (
    <StepDraftContext.Provider value={registry}>
      {offer && (
        <DraftNotice
          className="mb-6"
          savedAt={offer.savedAt}
          stale={offer.stale}
          missing={offer.missing}
          onRestore={onRestore}
          onDiscard={draft.discard}
          describe={() => describeStepDraft(offer.value)}
        />
      )}
      {children}
    </StepDraftContext.Provider>
  );
}
