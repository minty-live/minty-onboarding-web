"use client";

/**
 * The wizard's auto-saved drafts (`@minty/shared/drafts`, the owner's decisions doc L1): what is
 * typed on the OPEN step is kept in this browser 2 seconds after the last change, as one draft per
 * step - form `onb.step`, record = the step number - and offered back when the step opens again
 * ("You have unsaved changes from 10:42" - Restore / Discard). It never writes the company: only
 * the step's own Save & Next (or its own save buttons) does.
 *
 * The draft's value is `{ state, locals }`:
 * - `state` - the part of `WizardState` the step edits (`draftSlice`). Steps 3 and 4 keep nothing
 *   there: step 3 sends each invitation as it is made, and step 4 holds its picks in its screens.
 * - `locals` - inputs a step holds in its own React state until its save (the invite form, step 4's
 *   screen picks, its expense list's held ticks, edits, adds and removes, and its account form, a
 *   new sales-method name), registered with `useStepDraftField` and kept only while they differ
 *   from what they opened with.
 *
 * `basedOn` is `fingerprint(normalizeSlice(step, server slice))`: the step's values as the server
 * last gave or took them (GET /state on resume, the step's loads, each successful save). A draft
 * taken against other values is `stale` - shown, never put back.
 *
 * This module never touches `minty_onboarding_session` (the /state-failure fallback and the Xero
 * resume keep that blob as they were).
 */

import { createContext, useContext, useEffect, useRef, useState } from "react";

import { fingerprint } from "@minty/shared/drafts";

import type { WizardState } from "./types";
import { phoneForApi } from "./validation";

export const STEP_DRAFT_FORM = "onb.step";
/** Bump when a step's draft value changes shape: an older draft is then dropped, never restored. */
export const STEP_DRAFT_SHAPE = 1;
/** The steps that keep a draft: All Set (9) holds nothing to type. */
export const DRAFT_STEPS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type StepSlice = Record<string, unknown>;
export type StepDraftValue = { state: StepSlice; locals: Record<string, unknown> };

/** Whether `step` keeps a draft at all. */
export const isDraftStep = (step: number): boolean =>
  (DRAFT_STEPS as readonly number[]).includes(step);

/** The part of the wizard state `step` edits, as typed (restorable as it stands). */
export function draftSlice(step: number, s: WizardState): StepSlice {
  const p = s.pettyCash;
  switch (step) {
    case 1:
      return {
        name: s.entity.name,
        country: s.entity.country,
        currency: s.entity.currency,
        phone: s.entity.phone,
        phoneCountry: s.entity.phoneCountry,
        email: s.entity.email,
      };
    case 2:
      return { modules: s.modules };
    case 5:
      return {
        electronicMethods: p.electronicMethods,
        deliveryMethods: p.deliveryMethods,
        openingDate: p.openingDate,
        openingBalance: p.openingBalance,
      };
    case 6:
      return {
        pcAccount: p.pcAccount,
        depositAccount: p.depositAccount,
        directorCode: p.directorCode,
        cashSalesCode: p.cashSalesCode,
        discrepancyCode: p.discrepancyCode,
        expenseCodes: p.expenseCodes,
        pettyCodes: p.pettyCodes,
      };
    case 7:
      return {
        directorContact: p.directorContact,
        cashSaleContact: p.cashSaleContact,
        discrepancyContact: p.discrepancyContact,
      };
    case 8:
      return { billCodes: s.bills.billCodes };
    default:
      // 3 (invitations, each sent as it is made) and 4 (Accounting Setup, its screens' own state).
      return {};
  }
}

const amountKey = (v: unknown): string => {
  const text = v === undefined || v === null ? "" : String(v).replace(/,/g, "").trim();
  if (!text) return "";
  const n = Number(text);
  return Number.isFinite(n) ? String(n) : text;
};

/**
 * The slice as the server would hold it, so the same values compare equal however they are
 * written: the phone compact (E.164), the email and name trimmed, the modules in one order, the
 * opening balance as a number. Step 5's date counts only with a balance - it is filled for you
 * (the server's today) and saved only beside a balance (`submitOpeningBalance`).
 */
export function normalizeSlice(step: number, slice: StepSlice): StepSlice {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  switch (step) {
    case 1:
      return {
        name: text(slice.name),
        country: slice.country ?? "",
        currency: slice.currency ?? "",
        phone: phoneForApi(typeof slice.phone === "string" ? slice.phone : ""),
        email: text(slice.email),
      };
    case 2:
      return { modules: [...((slice.modules as string[] | undefined) ?? [])].sort() };
    case 5: {
      const balance = amountKey(slice.openingBalance);
      return {
        electronicMethods: slice.electronicMethods ?? [],
        deliveryMethods: slice.deliveryMethods ?? [],
        openingBalance: balance,
        openingDate: balance ? (slice.openingDate ?? "") : "",
      };
    }
    default:
      return slice;
  }
}

/** The marker `basedOn` and the dirty check compare. */
export const sliceMark = (step: number, slice: StepSlice): string =>
  fingerprint(normalizeSlice(step, slice));

/** Every draft step's server slice, from a state the server gave (GET /state) or nothing saved. */
export function serverSlicesOf(s: WizardState): Record<number, StepSlice> {
  return Object.fromEntries(DRAFT_STEPS.map((n) => [n, draftSlice(n, s)]));
}

/** The patch that puts a draft's slice back into the wizard state. */
export function applyDraftSlice(
  step: number,
  prev: WizardState,
  slice: StepSlice,
): Partial<WizardState> {
  switch (step) {
    case 1:
      return { entity: { ...prev.entity, ...(slice as Partial<WizardState["entity"]>) } };
    case 2:
      return Array.isArray(slice.modules)
        ? { modules: slice.modules as WizardState["modules"] }
        : {};
    case 5:
    case 6:
    case 7:
      return { pettyCash: { ...prev.pettyCash, ...(slice as Partial<WizardState["pettyCash"]>) } };
    case 8:
      return slice.billCodes
        ? {
            bills: {
              ...prev.bills,
              billCodes: slice.billCodes as WizardState["bills"]["billCodes"],
            },
          }
        : {};
    default:
      return {};
  }
}

// ---- what a stale draft shows (Show what I typed) ----------------------------------------------

const SLICE_LABELS: Record<string, string> = {
  name: "Entity name",
  phone: "Phone number",
  email: "Business email",
  modules: "Modules",
  electronicMethods: "Electronic methods",
  deliveryMethods: "Delivery methods",
  openingBalance: "Opening balance",
  openingDate: "Opening date",
  pcAccount: "Petty cash account",
  depositAccount: "Deposit account",
  directorCode: "Director's account",
  cashSalesCode: "Cash sales account",
  discrepancyCode: "Discrepancy account",
  directorContact: "Director contact",
  cashSaleContact: "Cash sale contact",
  discrepancyContact: "Discrepancy contact",
};
const MODULE_NAMES: Record<string, string> = { pettyCash: "Petty Cash", bills: "Payment Request" };

const shown = (v: unknown): string => {
  if (Array.isArray(v)) return v.map((x) => MODULE_NAMES[String(x)] ?? String(x)).join(", ");
  if (v && typeof v === "object")
    return Object.values(v as Record<string, unknown>)
      .filter((x) => typeof x === "string" && x)
      .join(", ");
  return v === undefined || v === null ? "" : String(v);
};

const localLabel = (name: string): string | null => {
  if (name === "invite") return "Invite";
  if (name.startsWith("method:")) return `New ${name.slice("method:".length)} method`;
  if (name.startsWith("acs-add-")) return "New account";
  if (name.startsWith("acs-edit-")) return "Account being edited";
  return null;
};

/** The rows Show what I typed lists: the slice's named values and the typed step-local inputs. */
export function describeStepDraft(value: StepDraftValue): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  for (const [key, v] of Object.entries(value.state ?? {})) {
    const label = SLICE_LABELS[key];
    const text = shown(v);
    if (label && text) rows.push({ label, value: text });
  }
  for (const [name, v] of Object.entries(value.locals ?? {})) {
    const label = localLabel(name);
    const text = shown(v);
    if (label && text) rows.push({ label, value: text });
  }
  return rows;
}

// ---- step-local inputs ---------------------------------------------------------------------------

/** What a step's draft binding (components/StepDraft.tsx) offers the inputs inside the step. */
export type StepDraftRegistry = {
  /** The input is on screen; returns its detach. A value Restore brought before it mounted is
   * put back now. */
  attach(name: string, set: (value: unknown) => void): () => void;
  /** Its value when it differs from what it opened with, else undefined (nothing to keep). */
  report(name: string, value: unknown): void;
};

export const StepDraftContext = createContext<StepDraftRegistry | null>(null);

/**
 * Keep a step-local input in the open step's draft: `name` is unique on the step, `value` must be
 * JSON (a Set goes in as a sorted array), `set` puts a restored value back. Outside the wizard (a
 * step rendered on its own, as the tests do) it does nothing.
 */
export function useStepDraftField<T>(name: string, value: T, set: (value: T) => void): void {
  const registry = useContext(StepDraftContext);
  const json = JSON.stringify(value) ?? "null";
  const [opened] = useState(json);
  const setRef = useRef(set);
  useEffect(() => {
    setRef.current = set;
  });
  useEffect(() => {
    if (!registry) return;
    return registry.attach(name, (v) => setRef.current(v as T));
  }, [registry, name]);
  useEffect(() => {
    registry?.report(name, json === opened ? undefined : JSON.parse(json));
  }, [registry, name, json, opened]);
}
