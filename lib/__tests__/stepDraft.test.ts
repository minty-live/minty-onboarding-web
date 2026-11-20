// The open step's draft value and what it is compared with (lib/stepDraft.ts): the part of the
// wizard state each step edits, written the way the server holds it so a saved value never looks
// unsaved (or a draft stale) only because it is spelled differently.

import { describe, expect, it } from "vitest";

import {
  applyDraftSlice,
  describeStepDraft,
  draftSlice,
  isDraftStep,
  serverSlicesOf,
  sliceMark,
} from "../stepDraft";
import { initialState } from "../wizardSteps";
import type { WizardState } from "../types";

const withEntity = (patch: Partial<WizardState["entity"]>): WizardState => {
  const s = initialState();
  return { ...s, entity: { ...s.entity, ...patch } };
};
const withPetty = (patch: Partial<WizardState["pettyCash"]>): WizardState => {
  const s = initialState();
  return { ...s, pettyCash: { ...s.pettyCash, ...patch } };
};

describe("which steps keep a draft", () => {
  it("is 1-8; All Set holds nothing to type", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].every(isDraftStep)).toBe(true);
    expect(isDraftStep(9)).toBe(false);
  });

  it("steps 3 and 4 keep only their step-local inputs (they save each change as it is made)", () => {
    expect(draftSlice(3, initialState())).toEqual({});
    expect(draftSlice(4, initialState())).toEqual({});
  });
});

describe("the same value, however it is written, compares equal", () => {
  it("step 1: the phone as typed or as stored, the name and email with spaces", () => {
    const typed = withEntity({ name: "Acme ", phone: "+852 9123 4567", email: " a@b.co" });
    const stored = withEntity({ name: "Acme", phone: "+85291234567", email: "a@b.co" });
    expect(sliceMark(1, draftSlice(1, typed))).toBe(sliceMark(1, draftSlice(1, stored)));
    expect(sliceMark(1, draftSlice(1, withEntity({ name: "Acme Two" })))).not.toBe(
      sliceMark(1, draftSlice(1, stored)),
    );
  });

  it("step 2: the modules in any order", () => {
    const a = { ...initialState(), modules: ["pettyCash", "bills"] } as WizardState;
    const b = { ...initialState(), modules: ["bills", "pettyCash"] } as WizardState;
    expect(sliceMark(2, draftSlice(2, a))).toBe(sliceMark(2, draftSlice(2, b)));
  });

  it("step 5: the balance with commas or as a number", () => {
    const typed = withPetty({ openingBalance: "1,000.00", openingDate: "2026-11-20" });
    const stored = withPetty({ openingBalance: 1000, openingDate: "2026-11-20" });
    expect(sliceMark(5, draftSlice(5, typed))).toBe(sliceMark(5, draftSlice(5, stored)));
  });

  it("step 5: the date filled for you counts only beside a balance (it is saved only with one)", () => {
    const filled = withPetty({ openingDate: "2026-11-20" });
    expect(sliceMark(5, draftSlice(5, filled))).toBe(sliceMark(5, draftSlice(5, initialState())));
    const withBalance = withPetty({ openingBalance: "50", openingDate: "2026-11-20" });
    const otherDay = withPetty({ openingBalance: "50", openingDate: "2026-11-19" });
    expect(sliceMark(5, draftSlice(5, withBalance))).not.toBe(
      sliceMark(5, draftSlice(5, otherDay)),
    );
  });

  it("step 5: a method added or reordered is a change", () => {
    const one = withPetty({ electronicMethods: ["Visa", "FPS"] });
    const two = withPetty({ electronicMethods: ["FPS", "Visa"] });
    expect(sliceMark(5, draftSlice(5, one))).not.toBe(sliceMark(5, draftSlice(5, two)));
  });
});

describe("putting a draft back", () => {
  it("merges the step's slice into the state, leaving the rest", () => {
    const prev = withEntity({ id: "e-1", name: "Old" });
    const patch = applyDraftSlice(1, prev, draftSlice(1, withEntity({ name: "New" })));
    expect(patch.entity).toMatchObject({ id: "e-1", name: "New" });

    const petty = applyDraftSlice(5, withPetty({ pcAccount: "kept" }), {
      electronicMethods: ["Visa"],
    });
    expect(petty.pettyCash).toMatchObject({ pcAccount: "kept", electronicMethods: ["Visa"] });

    expect(applyDraftSlice(3, initialState(), {})).toEqual({});
  });

  it("every draft step has a server slice from a state", () => {
    expect(Object.keys(serverSlicesOf(initialState())).map(Number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });
});

describe("Show what I typed (a stale draft)", () => {
  it("lists the named values and the typed step-local inputs, never ids", () => {
    const rows = describeStepDraft({
      state: draftSlice(1, withEntity({ name: "Acme", country: "uuid-hk" })),
      locals: { invite: { first: "Ann", last: "", email: "ann@example.com", role: "" } },
    });
    expect(rows).toEqual([
      { label: "Entity name", value: "Acme" },
      { label: "Invite", value: "Ann, ann@example.com" },
    ]);
  });
});
