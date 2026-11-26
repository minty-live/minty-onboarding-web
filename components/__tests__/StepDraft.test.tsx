// The wizard's auto-saved drafts (lib/stepDraft.ts, components/StepDraft.tsx; @minty/shared/drafts):
// what is typed on the open step is kept in this browser 2 s after the last change, and a reload -
// which rebuilds the wizard from GET /state - puts it back at once, with no notice (the user,
// 2026-11-24); a stale one is dropped silently. The company is never written by the draft; the
// step's own save clears it.
//
// The whole wizard is mounted, with fetch stubbed: a "reload" is an unmount (which keeps what was
// typed in the last 2 s) and a fresh mount resuming from this tab's token and company.

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetDraftsForTests } from "@minty/shared/drafts";

import OnboardingApp from "../OnboardingApp";
import { ToastProvider } from "../Toast";
import { TAB_ENTITY_KEY, TAB_TOKEN_KEY } from "../../lib/wizardSession";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const ENTITY = "360812e1-9f94-46a3-aa31-347e21afde8e";
const USER = "u-1";
const draftKeyFor = (step: number) => `minty:draft:1:${USER}:${ENTITY}:onb.step:${step}`;

const b64url = (v: unknown) =>
  btoa(JSON.stringify(v)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const TOKEN = `${b64url({ alg: "HS256" })}.${b64url({
  user_id: USER,
  entity_id: ENTITY,
  scope: "onboarding",
  exp: Math.floor(Date.now() / 1000) + 3600,
})}.sig`;

type Payload = Record<string, unknown>;
const companyAt = (savedStep: number, name = "Olive & Vine"): Payload => ({
  entity_id: ENTITY,
  entity: { name, country: "c-hk", currency: "cur-hkd", phone: "", email: "" },
  modules: ["PETTY_CASH"],
  saved_step: savedStep,
  invites: [],
});

let payload: Payload;
let puts: string[];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  resetDraftsForTests();
  window.localStorage.clear();
  window.sessionStorage.clear();
  // A plain reload: nothing in the address bar, this tab's token and company in sessionStorage.
  window.sessionStorage.setItem(TAB_TOKEN_KEY, TOKEN);
  window.sessionStorage.setItem(TAB_ENTITY_KEY, ENTITY);
  puts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/onboarding/state")) return json(payload);
      if (url.includes(`/api/onboarding/entity/`) && init?.method === "PUT") {
        puts.push(String(init.body));
        return json({ entity_id: ENTITY, name: "saved" });
      }
      return json({});
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

function mount() {
  return render(
    <ToastProvider>
      <OnboardingApp />
    </ToastProvider>,
  );
}

const nameInput = () => screen.getByLabelText(/Entity Name/) as HTMLInputElement;
/** Nothing about a draft is drawn: no notice, no Restore or Discard. */
const noNotice = () => {
  expect(document.querySelector("[data-draft-notice]")).toBeNull();
  expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
};
const kept = (step: number) => {
  const raw = window.localStorage.getItem(draftKeyFor(step));
  return raw ? (JSON.parse(raw) as { value: { state: Payload; locals: Payload } }) : null;
};

/** Mount on step 1, resumed from /state, and wait for the company's name. */
async function onStepOne() {
  payload = companyAt(1);
  const view = mount();
  await waitFor(() => expect(nameInput().value).toBe("Olive & Vine"));
  return view;
}

/** Type a new name and "reload": unmounting keeps what was typed within the last 2 s. */
async function typedThenReloaded(typed = "Olive & Vine Two") {
  const first = await onStepOne();
  fireEvent.change(nameInput(), { target: { value: typed } });
  first.unmount();
  expect(kept(1)?.value.state.name).toBe(typed);
  return mount();
}

describe("keeping what is typed", () => {
  it("keeps a draft 2 s after the last change on the open step, never sooner", async () => {
    await onStepOne();
    vi.useFakeTimers();
    fireEvent.change(nameInput(), { target: { value: "Olive & Vine Two" } });
    act(() => vi.advanceTimersByTime(1999));
    expect(kept(1)).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(kept(1)?.value.state.name).toBe("Olive & Vine Two");
    // Nothing was written to the company: only Save & Next does that.
    expect(puts).toHaveLength(0);
  });

  it("keeps nothing when what is on the step is what the server holds", async () => {
    await onStepOne();
    vi.useFakeTimers();
    fireEvent.change(nameInput(), { target: { value: "Olive & Vine Two" } });
    fireEvent.change(nameInput(), { target: { value: "Olive & Vine" } });
    act(() => vi.advanceTimersByTime(2500));
    expect(kept(1)).toBeNull();
  });
});

describe("a reload puts the draft back at once", () => {
  it("the step opens with what was typed, no notice, nothing saved to the company", async () => {
    await typedThenReloaded();
    await waitFor(() => expect(nameInput().value).toBe("Olive & Vine Two"));
    noNotice();
    expect(puts).toHaveLength(0);
  });

  it("a company saved again since drops the draft silently - never put back", async () => {
    const first = await onStepOne();
    fireEvent.change(nameInput(), { target: { value: "Olive & Vine Two" } });
    first.unmount();
    expect(kept(1)).not.toBeNull();
    // Someone saved the company in the meantime.
    payload = companyAt(1, "Olive & Vine Holdings");
    mount();
    await waitFor(() => expect(nameInput().value).toBe("Olive & Vine Holdings"));
    await waitFor(() => expect(kept(1)).toBeNull());
    expect(nameInput().value).toBe("Olive & Vine Holdings");
    noNotice();
  });
});

describe("step-local inputs", () => {
  it("the invite form is back as soon as the step opens (kept until it is sent)", async () => {
    payload = companyAt(3);
    const first = mount();
    await userEvent.click(await screen.findByRole("button", { name: "Go to invite" }));
    await userEvent.type(screen.getByPlaceholderText("Enter first name"), "Ann");
    await userEvent.type(screen.getByPlaceholderText("Enter email address"), "ann@example.com");
    first.unmount();
    expect(kept(3)?.value.locals.invite).toMatchObject({ first: "Ann", email: "ann@example.com" });
    expect(kept(3)?.value.state).toEqual({}); // invitations are saved as they are sent

    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Go to invite" }));
    await waitFor(() =>
      expect((screen.getByPlaceholderText("Enter first name") as HTMLInputElement).value).toBe(
        "Ann",
      ),
    );
    expect((screen.getByPlaceholderText("Enter email address") as HTMLInputElement).value).toBe(
      "ann@example.com",
    );
    noNotice();
  });
});

describe("the step's own save", () => {
  it("Save & Next clears the step's draft", async () => {
    await onStepOne();
    fireEvent.change(nameInput(), { target: { value: "Olive & Vine Two" } });
    // A page being hidden writes what is pending at once.
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(kept(1)).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Save & Next" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    await waitFor(() => expect(kept(1)).toBeNull());
    expect(JSON.parse(puts[0]).entity_name).toBe("Olive & Vine Two");
  });
});
