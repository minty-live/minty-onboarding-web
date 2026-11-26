"use client";

// Step 4 - Accounting Setup (Xero optional; Figma LGkVZqcyxSIh6pp5ihDjXw node 348:1007), drawn in
// this branch's classic look. 4.1 asks how Minty keeps the books. With Xero, the next screen is
// today's Connect to Xero (X1, StepConnectXero) and the wizard goes on as before. On its own: the
// business type and the cash question (4.2), the sales and expense accounts with Auto Fill (4.3,
// 4.4) and, with Petty Cash, the five accounts daily closing needs (4.5). Each screen holds its
// picks until its Save & Next (minty-onboarding-api's /accounting routes): the expense list sends
// its ticks, edits, adds and removes in one PUT /accounting/accounts (2026-11-20), as the Xero
// expense list sends its ticks in one POST /accounting/xero-accounts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AutofillButton from "../AutofillButton";
import InfoBox from "./InfoBox";
import { ConfirmDialog } from "../ConfirmDialog";
import Icon from "../Icon";
import MintySelect from "../MintySelect";
import { StepConnectXero } from "../OnboardingSteps";
import { useToast } from "../Toast";
import { ErrorSummary, type SummaryItem } from "./ErrorSummary";
import { SaveExitLink } from "./StepChrome";
import {
  accountingApi,
  salesGlyph,
  type Account,
  type AccountInput,
  type AccountingSetup as Setup,
  type AccountKind,
  type Answer,
  type Suggestion,
} from "../../lib/accountingApi";
import { accountingOf, salesTicksOf } from "../../lib/wizardSteps";
import { useStepDraftField } from "../../lib/stepDraft";
import type { Result } from "../../lib/api";
import type { BusinessType, StepProps, SubmitFn } from "../../lib/types";

/** What a screen's Save & Exit save answers (`SubmitFn`): saved, or the refusal's sentence. */
type ExitSaved = { ok: true } | { ok: false; error: string };

// Owner, 2026-11-11: no daily-closing (4.5 / X4) screen any more - the business type's set brings the
// sales accounts and the daily-closing defaults (Minty), and Petty Cash Settings' Account Code maps the
// daily-closing accounts from Xero (Xero). Owner, 2026-11-17: the sales accounts screen is back as
// three ticks (Figma 464:73 row 1) - Sales - Cash, Electronic Payment, Delivery - that decide which
// sales methods step 5 asks for; screen only, no account is made or removed.
type Sub = "mode" | "xero" | "xexpense" | "business" | "sales" | "expense";

type Props = Pick<
  StepProps,
  | "state"
  | "set"
  | "next"
  | "back"
  | "token"
  | "saveAndExit"
  | "connectXero"
  | "disconnectXero"
  | "xeroMismatch"
  | "clearXeroMismatch"
  | "xeroChoose"
  | "clearXeroChoose"
  | "xeroConflict"
  | "clearXeroConflict"
  | "xeroCurrency"
  | "clearXeroCurrency"
  | "releaseXeroConflict"
>;

const BUSINESSES: { value: BusinessType; title: string; body: string }[] = [
  {
    value: "fnb",
    title: "Restaurant & Food",
    body: "Cafés, restaurants, bakeries and other food & beverage businesses.",
  },
  {
    value: "retail",
    title: "Retail shop",
    body: "Shops, boutiques, convenience stores and online shops.",
  },
  {
    value: "service",
    title: "Service business",
    body: "Professional services, agencies, clinics and salons.",
  },
  {
    value: "general",
    title: "General business",
    body: "A standard set of accounts that fits most businesses.",
  },
];
const BUSINESS_WORDS: Record<string, string> = {
  fnb: "Restaurant & Food",
  retail: "Retail shop",
  service: "Service business",
  general: "General business",
};
const KIND_TYPES: Record<AccountKind, string[]> = {
  sales: ["sales", "revenue", "other_income"],
  expense: ["expense", "direct_costs", "overheads"], // the form starts on Expense
};
/** An expense account's types, for "+ Add account" on the code lists (AddAccountDialog). */
export const EXPENSE_TYPES = KIND_TYPES.expense;
const CODE_MAX = 10;
const NAME_MAX = 80;

/** What the list screens draw in the standalone prototype (no company): nothing yet. */
const EMPTY_SETUP: Setup = {
  mode: "minty",
  business_type: null,
  uses_sales_cash: true,
  business_answered: true,
  connected: false,
  accounts: { sales: [], expense: [] },
  slots: {
    petty_cash: { account: null, options: [] },
    bank: { account: null, options: [] },
    cash_sale: { account: null, options: [] },
    discrepancy: { account: null, options: [] },
    director: { account: null, options: [] },
  },
  slots_ready: 0,
  next_code: {},
  types: [],
};

const without = (fields: Record<string, string>, key: string) =>
  Object.fromEntries(Object.entries(fields).filter(([k]) => k !== key));

function firstSub(state: Props["state"]): Sub {
  const a = accountingOf(state);
  if (state.xero.connected || a.mode === "xero") return a.mode ? "xero" : "mode";
  if (a.mode !== "minty") return "mode";
  if (a.usesSalesCash === null) return "business";
  return salesTicksOf(a).chosen ? "expense" : "sales";
}

export function StepAccountingSetup(props: Props) {
  const { state, set, next, back, token, saveAndExit } = props;
  const entityId = state.entity.id || "";
  const accounting = accountingOf(state);
  const toast = useToast();
  const [sub, setSub] = useState<Sub>(() => firstSub(state));
  const [setup, setSetup] = useState<Setup | null>(null);
  const [loadError, setLoadError] = useState("");

  const xeroPath = accounting.mode === "xero";
  const subs: Sub[] = useMemo(
    () =>
      (xeroPath ? ["mode", "xero", "xexpense"] : ["mode", "business", "sales", "expense"]) as Sub[],
    [xeroPath],
  );

  const reload = useCallback(async () => {
    if (!token || !entityId) return;
    const answer = await accountingApi.setup(token, entityId);
    if (!answer.ok) {
      setLoadError(answer.error);
      return;
    }
    setLoadError("");
    setSetup(answer);
  }, [token, entityId]);

  // The lists load when a list screen opens; changes reload through `reload`.
  useEffect(() => {
    if (!["expense", "xexpense"].includes(sub) || !token || !entityId) return;
    let live = true;
    accountingApi.setup(token, entityId).then((answer) => {
      if (!live) return;
      if (answer.ok) {
        setLoadError("");
        setSetup(answer);
      } else setLoadError(answer.error);
    });
    return () => {
      live = false;
    };
  }, [sub, token, entityId]);

  const remember = (patch: Partial<typeof accounting>) =>
    set((prev) => ({ accounting: { ...accountingOf(prev), ...patch } }));

  // The screens this visit has opened, so the side menu can go forward again to any of them.
  const [seen, setSeen] = useState<Set<Sub>>(() => {
    const opened = new Set<Sub>([firstSub(state)]);
    if (state.xero.connected && accounting.mode === "xero") opened.add("xexpense");
    return opened;
  });
  const go = (to: Sub) => {
    setSub(to);
    setSeen((prev) => (prev.has(to) ? prev : new Set(prev).add(to)));
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  const forward = () => {
    const i = subs.indexOf(sub);
    if (i >= 0 && i < subs.length - 1) go(subs[i + 1]);
    else next();
  };
  const backward = () => {
    if (sub === "mode") return back();
    if (sub === "xero") return go("mode");
    const i = subs.indexOf(sub);
    go(i > 0 ? subs[i - 1] : "mode");
  };

  // Accounting Setup's own side menu (owner, 2026-11-18), as Petty Cash Settings has: the path's
  // screens, the current one marked, the ones passed ticked and a click away. Any screen already
  // reached stays a click away after going back (owner, 2026-11-18): the ones between ticked, the
  // furthest one with its number.
  const here = subs.indexOf(sub);
  const furthest = Math.max(here, ...subs.map((s, i) => (seen.has(s) ? i : -1)));
  const SUB_LABEL: Record<Sub, string> = {
    mode: "How Minty works",
    business: "Business type",
    sales: "Sales accounts",
    expense: "Expense accounts",
    xero: "Connect to Xero",
    xexpense: "Expense accounts",
  };
  const menu = (
    <aside className="pc-side-menu is-wide" aria-label="Accounting Setup screens">
      <div className="pc-side-title">Accounting Setup</div>
      {subs.map((s, i) => {
        const active = i === here;
        const done = !active && i < furthest;
        return (
          <button
            key={s}
            type="button"
            className={"pc-side-item" + (active ? " active" : "") + (done ? " done" : "")}
            onClick={() => go(s)}
            disabled={active || i > furthest}
            aria-current={active ? "step" : undefined}
          >
            <span className="substep-circle">{done ? <Icon.CheckSm /> : String(i + 1)}</span>
            <span className="substep-label">{SUB_LABEL[s]}</span>
          </button>
        );
      })}
    </aside>
  );
  const withMenu = (screen: React.ReactNode) => (
    <>
      {menu}
      {screen}
    </>
  );

  if (sub === "xero") {
    return withMenu(
      <StepConnectXero
        state={state}
        // Connected: on to X3, the Xero expense accounts Minty uses; not yet: the wizard goes on.
        next={() => (state.xero.connected ? go("xexpense") : next())}
        back={() => go("mode")}
        connectXero={props.connectXero}
        disconnectXero={props.disconnectXero}
        xeroMismatch={props.xeroMismatch}
        clearXeroMismatch={props.clearXeroMismatch}
        xeroChoose={props.xeroChoose}
        clearXeroChoose={props.clearXeroChoose}
        xeroConflict={props.xeroConflict}
        clearXeroConflict={props.clearXeroConflict}
        xeroCurrency={props.xeroCurrency}
        clearXeroCurrency={props.clearXeroCurrency}
        releaseXeroConflict={props.releaseXeroConflict}
        saveAndExit={saveAndExit}
      />,
    );
  }

  // `submitFn`: what Save & Exit saves first, for a screen that holds its changes until saved.
  const nav = (onNext: () => void, busy = false, submitFn?: SubmitFn) => (
    <div className="step-nav">
      <button className="btn btn-ghost" onClick={backward}>
        <Icon.ArrowLeft /> Back
      </button>
      <div className="step-actions">
        <SaveExitLink saveAndExit={saveAndExit} submitFn={submitFn} disabled={busy} />
        <button className="btn btn-primary" onClick={onNext} disabled={busy}>
          {busy ? (
            "Saving…"
          ) : (
            <>
              Save &amp; Next <Icon.Arrow />
            </>
          )}
        </button>
      </div>
    </div>
  );

  // Each screen's answer saved WITHOUT moving on: Save & Next adds the move, Save & Exit leaves
  // after it (2026-11-20 - Save & Exit used to save nothing but the place to come back to).
  const saveMode = async (mode: "minty" | "xero"): Promise<ExitSaved> => {
    const answer = entityId
      ? await accountingApi.setMode(token, entityId, mode)
      : ({ ok: true } as const);
    if (!answer.ok) return { ok: false, error: answer.error };
    remember({ mode });
    return { ok: true };
  };
  const saveBusiness = async (
    businessType: BusinessType | null,
    usesSalesCash: boolean,
  ): Promise<ExitSaved> => {
    const answer = entityId
      ? await accountingApi.setBusiness(token, entityId, businessType, usesSalesCash)
      : ({ ok: true } as const);
    if (!answer.ok) return { ok: false, error: answer.error };
    remember({ businessType, usesSalesCash });
    return { ok: true };
  };
  const saveSales = async (ticks: SalesTicks): Promise<ExitSaved> => {
    const answer = entityId
      ? await accountingApi.setSalesAccounts(token, entityId, ticks)
      : ({ ok: true } as const);
    if (!answer.ok) return { ok: false, error: answer.error };
    remember({
      usesSalesCash: ticks.cash,
      sellsElectronic: ticks.electronic,
      sellsDelivery: ticks.delivery,
    });
    return { ok: true };
  };

  if (sub === "mode") {
    return withMenu(
      <ModeScreen
        initial={accounting.mode}
        connected={state.xero.connected}
        nav={nav}
        onExitSave={saveMode}
        onSave={async (mode) => {
          const answer = await saveMode(mode);
          if (!answer.ok) {
            toast.error(answer.error);
            return;
          }
          go(mode === "xero" ? "xero" : "business");
        }}
      />,
    );
  }
  if (sub === "business") {
    return withMenu(
      <BusinessScreen
        initial={accounting}
        nav={nav}
        onExitSave={saveBusiness}
        onSave={async (businessType, usesSalesCash) => {
          const answer = await saveBusiness(businessType, usesSalesCash);
          if (!answer.ok) {
            toast.error(answer.error);
            return false;
          }
          forward();
          return true;
        }}
      />,
    );
  }
  if (sub === "sales") {
    return withMenu(
      <SalesAccountsScreen
        initial={salesTicksOf(accountingOf(state))}
        nav={nav}
        onExitSave={saveSales}
        onSave={async (ticks) => {
          const answer = await saveSales(ticks);
          if (!answer.ok) {
            toast.error(answer.error);
            return false;
          }
          forward();
          return true;
        }}
      />,
    );
  }
  const view = entityId ? setup : EMPTY_SETUP;
  if (!view) {
    return withMenu(
      <div className="acs" aria-busy={!loadError}>
        {loadError ? (
          <div className="acs-banner is-warn" role="alert">
            <p>{loadError}</p>
            <button type="button" className="btn btn-ghost" onClick={() => void reload()}>
              Try again
            </button>
          </div>
        ) : (
          <p className="acs-loading">Loading your accounts…</p>
        )}
        {nav(() => {}, true)}
      </div>,
    );
  }
  const refreshXero = async () => {
    const answer = await accountingApi.refreshXero(token, entityId);
    if (!answer.ok) {
      toast.error(answer.error);
      return;
    }
    setSetup(answer);
    toast.success("Your accounts are up to date with Xero.");
  };
  if (sub === "xexpense") {
    return withMenu(
      <XeroAccountsScreen
        key={sub}
        kind="expense"
        setup={view}
        nav={nav}
        onRefresh={refreshXero}
        onExitSave={async (ids) => {
          const answer = await accountingApi.xeroTicks(token, entityId, "expense", ids);
          if (!answer.ok) return { ok: false, error: answer.error };
          setSetup(answer);
          return { ok: true };
        }}
        onSave={async (ids) => {
          const answer = await accountingApi.xeroTicks(token, entityId, "expense", ids);
          if (!answer.ok) return answer.error;
          setSetup(answer);
          forward();
          return null;
        }}
      />,
    );
  }
  if (sub === "expense") {
    return withMenu(
      <AccountsScreen
        key={sub}
        kind={sub}
        setup={view}
        token={token}
        entityId={entityId}
        businessType={accounting.businessType}
        nav={nav}
        onSaved={(answer) => {
          if (answer) setSetup(answer);
          forward();
        }}
      />,
    );
  }
  return null;
}

// ---- 4.1 ----------------------------------------------------------------------------------------

function ModeScreen({
  initial,
  connected,
  nav,
  onSave,
  onExitSave,
}: {
  initial: "minty" | "xero" | null;
  connected: boolean;
  nav: (onNext: () => void, busy?: boolean, submitFn?: SubmitFn) => React.ReactNode;
  onSave: (mode: "minty" | "xero") => Promise<void>;
  /** Save & Exit: the pick saved first, without moving on. */
  onExitSave: (mode: "minty" | "xero") => Promise<ExitSaved>;
}) {
  const [mode, setMode] = useState<"minty" | "xero" | null>(initial ?? (connected ? "xero" : null));
  // Each screen's pick is kept in the step's auto-saved draft until its Save (lib/stepDraft.ts).
  useStepDraftField("acs.mode", mode, setMode);
  const [refused, setRefused] = useState(false);
  const [saving, setSaving] = useState(false);
  // Each card's picture is its own crop of one artwork sheet, as the design places it (Figma
  // 348:1018): a fixed box, the sheet sized and offset inside it.
  const choices = [
    {
      value: "minty" as const,
      title: "Use Minty independently",
      body: "Record and manage your books directly in Minty.",
      art: "is-minty",
    },
    {
      value: "xero" as const,
      title: "Connect with Xero",
      body: "Automatically send your records to Xero and keep your books up to date there.",
      art: "is-xero",
    },
  ];
  return (
    <div className="acs acs-mode">
      <div className="page-head acs-head acs-mode-head">
        <h2 id="acs-mode-title">How would you like Minty to work?</h2>
        <p>Choose how Minty keeps your books.</p>
      </div>
      <InfoBox>Not sure? Start with Minty only — you can connect Xero later in Settings.</InfoBox>
      <div
        className="acs-mode-grid"
        role="radiogroup"
        aria-labelledby="acs-mode-title"
        aria-required
      >
        {choices.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={mode === c.value}
            className={"acs-mode-card" + (mode === c.value ? " is-on" : "")}
            onClick={() => {
              setMode(c.value);
              setRefused(false);
            }}
          >
            <span className="acs-mode-art" aria-hidden>
              <span className={"acs-mode-crop " + c.art}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/accounting/mode-art.jpg" alt="" />
              </span>
            </span>
            <span className="acs-mode-title">{c.title}</span>
            <span className="acs-mode-body">{c.body}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="acs-mode-radio"
              src={mode === c.value ? "/accounting/radio-on.svg" : "/accounting/radio-off.svg"}
              width={24}
              height={24}
              alt=""
              aria-hidden
            />
          </button>
        ))}
      </div>
      {refused && !mode && (
        <p className="field-required" role="alert">
          Choose how Minty should work to continue.
        </p>
      )}
      {nav(
        async () => {
          if (!mode) {
            setRefused(true);
            return;
          }
          setSaving(true);
          await onSave(mode);
          setSaving(false);
        },
        saving,
        async () => (mode ? onExitSave(mode) : null),
      )}
    </div>
  );
}

// ---- the sales accounts (Figma 464:73 row 1) -------------------------------------------------------

type SalesTicks = { cash: boolean; electronic: boolean; delivery: boolean };

const SALES_ACCOUNTS: {
  key: keyof SalesTicks;
  name: string;
  body: string;
  part: string;
  icon: "Payments" | "CreditCard" | "Delivery";
}[] = [
  {
    key: "cash",
    name: "Sales - Cash",
    body: "Cash received at the counter.",
    part: "Cash Sales",
    icon: "Payments",
  },
  {
    key: "electronic",
    name: "Sales - Electronic Payment",
    body: "Card, e-wallet and bank transfer payments.",
    part: "Electronic Payments",
    icon: "CreditCard",
  },
  {
    key: "delivery",
    name: "Sales - Delivery",
    body: "Orders from delivery apps.",
    part: "Delivery Sales",
    icon: "Delivery",
  },
];
const NO_SALES_ACCOUNT = "No sales account is ticked yet. Tick at least one to continue.";

function SalesAccountsScreen({
  initial,
  nav,
  onSave,
  onExitSave,
}: {
  initial: SalesTicks;
  nav: (onNext: () => void, busy?: boolean, submitFn?: SubmitFn) => React.ReactNode;
  onSave: (ticks: SalesTicks) => Promise<boolean>;
  /** Save & Exit: the ticks saved first (none ticked is not saved), without moving on. */
  onExitSave: (ticks: SalesTicks) => Promise<ExitSaved>;
}) {
  const [ticks, setTicks] = useState<SalesTicks>({
    cash: initial.cash,
    electronic: initial.electronic,
    delivery: initial.delivery,
  });
  useStepDraftField("acs.sales", ticks, setTicks);
  const [refused, setRefused] = useState(false);
  const [saving, setSaving] = useState(false);
  const none = !ticks.cash && !ticks.electronic && !ticks.delivery;
  const shown = refused && none;

  const save = async () => {
    if (none) {
      setRefused(true);
      document.getElementById("acs-sales-accounts")?.focus();
      return;
    }
    setSaving(true);
    const ok = await onSave(ticks);
    if (!ok) setSaving(false);
  };

  return (
    <div className="acs acs-sales-accounts">
      <div className="page-head acs-head acs-mode-head">
        <h2 id="acs-sales-title">Your sales accounts</h2>
        <p>How do your customers pay you?</p>
      </div>
      <InfoBox>
        Tick each one you take — your daily report will ask for these amounts every day. You can
        change this later in Settings.
      </InfoBox>
      <div
        id="acs-sales-accounts"
        tabIndex={-1}
        className={"acs-sa-list" + (shown ? " field-error" : "")}
        role="group"
        aria-labelledby="acs-sales-title"
        aria-describedby={shown ? "acs-sales-error" : undefined}
      >
        {SALES_ACCOUNTS.map((a) => {
          const on = ticks[a.key];
          const Glyph = Icon[a.icon];
          return (
            <button
              key={a.key}
              type="button"
              role="checkbox"
              aria-checked={on}
              className={`acs-sa is-${a.key}` + (on ? " is-on" : "")}
              onClick={() => {
                setTicks((t) => ({ ...t, [a.key]: !t[a.key] }));
                setRefused(false);
              }}
            >
              <span className="acs-sa-badge" aria-hidden>
                <Glyph />
              </span>
              <span className="acs-sa-text">
                <span className="acs-sa-name">{a.name}</span>
                <span className="acs-sa-body">{a.body}</span>
                <span className={"acs-sa-pill" + (on ? "" : " is-off")}>
                  {on ? `Shows on your daily report: ${a.part}` : "Not on your daily report"}
                </span>
              </span>
              <span className="acs-sa-check" aria-hidden>
                {on && <Icon.CheckSm width={16} height={16} />}
              </span>
            </button>
          );
        })}
      </div>
      {shown && (
        <p className="field-required" id="acs-sales-error" role="alert">
          {NO_SALES_ACCOUNT}
        </p>
      )}
      {nav(
        () => void save(),
        saving,
        async () => (none ? null : onExitSave(ticks)),
      )}
    </div>
  );
}

// ---- 4.2 ----------------------------------------------------------------------------------------

function BusinessScreen({
  initial,
  nav,
  onSave,
  onExitSave,
}: {
  initial: { businessType: BusinessType | null; usesSalesCash: boolean | null };
  nav: (onNext: () => void, busy?: boolean, submitFn?: SubmitFn) => React.ReactNode;
  onSave: (businessType: BusinessType | null, usesSalesCash: boolean) => Promise<boolean>;
  /** Save & Exit: the business type saved first (none chosen is not saved), without moving on. */
  onExitSave: (businessType: BusinessType | null, usesSalesCash: boolean) => Promise<ExitSaved>;
}) {
  const answered = initial.usesSalesCash !== null;
  const [business, setBusiness] = useState<BusinessType | "none" | "">(
    answered ? (initial.businessType ?? "none") : "",
  );
  useStepDraftField("acs.business", business, setBusiness);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);

  const problems: SummaryItem[] = [
    ...(business
      ? []
      : [
          {
            fieldId: "acs-business",
            message: "Choose what best describes your business to continue.",
          },
        ]),
  ];
  const shown = attempt > 0 ? problems : [];
  const messageFor = (id: string) => shown.find((p) => p.fieldId === id)?.message;

  const save = async () => {
    if (problems.length) {
      setAttempt((a) => a + 1);
      if (problems.length === 1) document.getElementById(problems[0].fieldId)?.focus();
      return;
    }
    setSaving(true);
    // Owner, 2026-11-18: no cash question here - the sales accounts screen's Sales - Cash tick is
    // it. The save keeps the company's answer as it stands (ticked for a new company), which picks
    // the sheet's set (with or without Cash Sales) as before.
    const ok = await onSave(
      business === "none" ? null : (business as BusinessType),
      initial.usesSalesCash !== false,
    );
    if (!ok) setSaving(false);
  };

  return (
    <div className="acs acs-business">
      <div className="page-head acs-head acs-mode-head">
        <h2>What best describes your business?</h2>
        <p>Pick the one closest to your business.</p>
      </div>
      <InfoBox>
        We&apos;ll suggest accounts for your industry on the next screens. Nothing is added until
        you press Auto Fill. You can change your business type or any account later in Settings.
      </InfoBox>
      <ErrorSummary items={shown} attempt={attempt} />

      {/* Figma 348:1135: a picture card per business type, the heading asks the question */}
      <fieldset className={"acs-fieldset" + (messageFor("acs-business") ? " field-error" : "")}>
        <legend className="sr-only">Business type (required)</legend>
        <div
          id="acs-business"
          tabIndex={-1}
          className="acs-biz-grid"
          role="radiogroup"
          aria-label="Business type"
          aria-required
          aria-invalid={!!messageFor("acs-business")}
          aria-describedby={messageFor("acs-business") ? "acs-business-error" : undefined}
        >
          {BUSINESSES.map((b) => {
            const on = business === b.value;
            return (
              <button
                key={b.value}
                type="button"
                role="radio"
                aria-checked={on}
                className={`acs-biz is-${b.value}` + (on ? " is-on" : "")}
                onClick={() => setBusiness(b.value)}
              >
                <span className="acs-biz-art" aria-hidden>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/accounting/business-${b.value}.png`} alt="" />
                </span>
                <span className="acs-biz-text">
                  <span className="acs-biz-title-row">
                    <span className="acs-biz-icon" aria-hidden>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/accounting/glyph-${b.value}.svg`} width={25} height={25} alt="" />
                    </span>
                    <span className="acs-biz-title">{b.title}</span>
                  </span>
                  <span className="acs-biz-body">{b.body}</span>
                  <span className="acs-biz-go" aria-hidden>
                    {on ? (
                      <Icon.CheckSm width={18} height={18} />
                    ) : (
                      <Icon.Arrow width={18} height={18} />
                    )}
                  </span>
                </span>
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={business === "none"}
            className={"acs-biz is-none" + (business === "none" ? " is-on" : "")}
            onClick={() => setBusiness("none")}
          >
            <span className="acs-biz-text">
              <span className="acs-biz-title">
                None of these — I&apos;ll set up my own accounts
              </span>
              <span className="acs-biz-body">
                No suggestions. The account lists on the next screens start empty.
              </span>
            </span>
            <span className="acs-biz-go" aria-hidden>
              {business === "none" ? (
                <Icon.CheckSm width={18} height={18} />
              ) : (
                <Icon.Arrow width={18} height={18} />
              )}
            </span>
          </button>
        </div>
        {messageFor("acs-business") && (
          <div className="field-required" id="acs-business-error">
            {messageFor("acs-business")}
          </div>
        )}
      </fieldset>

      {nav(save, saving, async () =>
        business
          ? onExitSave(
              business === "none" ? null : (business as BusinessType),
              initial.usesSalesCash !== false,
            )
          : null,
      )}
    </div>
  );
}

// ---- one account's form (4.3b, 4.4a, 4.5a) --------------------------------------------------------

export function AccountForm({
  idPrefix,
  title,
  types,
  typeLabels,
  nextCode,
  initial,
  submitLabel,
  onCancel,
  onSave,
}: {
  idPrefix: string;
  title: string;
  types: string[];
  typeLabels: Record<string, string>;
  nextCode: Record<string, string>;
  initial?: AccountInput;
  submitLabel: string;
  onCancel: () => void;
  onSave: (input: AccountInput) => Promise<Answer<object>>;
}) {
  const startType = initial?.type && types.includes(initial.type) ? initial.type : types[0];
  const [type, setType] = useState(startType);
  const [code, setCode] = useState(initial?.code ?? nextCode[startType] ?? "");
  const [codeTouched, setCodeTouched] = useState(!!initial);
  const [name, setName] = useState(initial?.name ?? "");
  // Kept in the step's auto-saved draft until it is saved (one per form: add, or edit that row).
  useStepDraftField(idPrefix, { type, code, name }, (v) => {
    setType(v.type);
    setCode(v.code);
    setCodeTouched(true);
    setName(v.name);
  });
  const [attempt, setAttempt] = useState(0);
  const [server, setServer] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!initial) nameRef.current?.focus();
  }, [initial]);

  // Checked as you type: shape and length. Empty waits for a refused save.
  const live: Record<string, string> = {};
  if (code.length > CODE_MAX)
    live.code = `The code can be up to ${CODE_MAX} characters. Shorten it to continue.`;
  else if (code && !/^[A-Za-z0-9.-]+$/.test(code))
    live.code = "The code can use letters, numbers, dots and dashes. Remove the other characters.";
  if (name.trim().length > NAME_MAX)
    live.name = `The name can be up to ${NAME_MAX} characters. Shorten it to continue.`;
  const empty: Record<string, string> = {};
  if (!code.trim() && type !== "bank")
    empty.code = "The code is still empty. Add a code to continue.";
  if (!name.trim()) empty.name = "The name is still empty. Add a name to continue.";
  const messages = { ...(attempt > 0 ? empty : {}), ...live, ...server };

  const fieldId = (f: string) => `${idPrefix}-${f}`;
  const summary: SummaryItem[] = Object.entries(messages).map(([f, m]) => ({
    fieldId: fieldId(f),
    message: m,
  }));

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const problems = { ...empty, ...live };
    if (Object.keys(problems).length) {
      setAttempt((a) => a + 1);
      if (Object.keys(problems).length === 1)
        document.getElementById(fieldId(Object.keys(problems)[0]))?.focus();
      return;
    }
    setSaving(true);
    const answer = await onSave({ code: code.trim(), name: name.trim(), type });
    setSaving(false);
    if (!answer.ok) {
      setServer(answer.fields);
      setAttempt((a) => a + 1);
      const first = Object.keys(answer.fields)[0];
      if (first) document.getElementById(fieldId(first))?.focus();
    }
  };

  return (
    <form className="acs-form" onSubmit={submit} noValidate>
      {title ? <p className="acs-form-title">{title}</p> : null}
      <ErrorSummary items={summary} attempt={attempt} />
      <div className="acs-form-row">
        <div className={"field" + (messages.code ? " field-error" : "")}>
          <label htmlFor={fieldId("code")}>
            Code
            {type !== "bank" && (
              <>
                <span className="req" aria-hidden>
                  *
                </span>
                <span className="sr-only"> (required)</span>
              </>
            )}
          </label>
          <input
            id={fieldId("code")}
            type="text"
            inputMode="text"
            autoComplete="off"
            value={code}
            aria-required={type !== "bank"}
            aria-invalid={!!messages.code}
            aria-describedby={messages.code ? fieldId("code-error") : fieldId("code-hint")}
            onChange={(e) => {
              setCode(e.target.value);
              setCodeTouched(true);
              setServer((f) => without(f, "code"));
            }}
          />
          {messages.code ? (
            <div className="field-required" id={fieldId("code-error")}>
              {messages.code}
            </div>
          ) : (
            !initial &&
            nextCode[type] && (
              <p className="acs-hint" id={fieldId("code-hint")}>
                {nextCode[type]} is the next free code for {typeLabels[type] || "this type"}. You
                can change it.
              </p>
            )
          )}
        </div>
        <div className="field">
          <label htmlFor={fieldId("type")}>Type</label>
          <MintySelect
            id={fieldId("type")}
            value={type}
            options={types.map((t) => ({ value: t, label: typeLabels[t] || t }))}
            onChange={(t) => {
              setType(t);
              if (!codeTouched) setCode(nextCode[t] ?? "");
              setServer((f) => without(f, "type"));
            }}
          />
        </div>
      </div>
      <div className={"field" + (messages.name ? " field-error" : "")}>
        <label htmlFor={fieldId("name")}>
          Name
          <span className="req" aria-hidden>
            *
          </span>
          <span className="sr-only"> (required)</span>
        </label>
        <input
          ref={nameRef}
          id={fieldId("name")}
          type="text"
          autoComplete="off"
          placeholder="e.g. Catering orders"
          value={name}
          aria-required
          aria-invalid={!!messages.name}
          aria-describedby={messages.name ? fieldId("name-error") : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setServer((f) => without(f, "name"));
          }}
        />
        {messages.name && (
          <div className="field-required" id={fieldId("name-error")}>
            {messages.name}
          </div>
        )}
      </div>
      <div className="acs-form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

// ---- 4.3 and 4.4 ------------------------------------------------------------------------------------

// 4.4's card icon (Figma 348:1267 draws ten), by the account's name; a cost-of-sales account that
// matches none is "products", anything else "other".
const EXPENSE_GLYPHS: [string, RegExp][] = [
  ["packaging", /packag|\bbags?\b|\bbox|container/i],
  ["staff", /staff|salar|wage|mpf|payroll|employee/i],
  ["rent", /\brent|premis|lease/i],
  ["utilities", /utilit|electric|water|\bgas\b|power|light|phone|internet/i],
  ["cleaning", /clean/i],
  ["repairs", /repair|mainten/i],
  ["delivery", /deliver|courier|freight|postage|transport/i],
  ["marketing", /market|advert|promot/i],
  ["products", /product|stock|suppl|purchase|goods|ingredient|food/i],
];
const expenseGlyph = (name: string, type: string) =>
  EXPENSE_GLYPHS.find(([, re]) => re.test(name))?.[0] ??
  (type === "direct_costs" ? "products" : "other");

// The accounting team's sheet accounts each have their own icon in the design (Figma 4.4, owner
// 2026-11-18): by code, for a sheet row (an Auto Fill suggestion or an account it added). An account
// the company made keeps the icon its name matches (expenseGlyph).
const SHEET_ICONS: Record<string, string> = {
  "5000": "inventory",
  "5001": "transport",
  "5002": "packaging",
  "6000": "cleaning",
  "6001": "utilities",
  "6002": "telephone",
  "6003": "rent",
  "6005": "wages",
  "6006": "professional",
  "6007": "repairs",
  "6009": "benefits",
  "6010": "other",
  "6011": "marketing",
  "6012": "licenses",
  "6013": "delivery-platform",
  "6016": "insurance",
  "6017": "stationery",
  "6018": "system",
};
/** The card's icon: the sheet's own for a sheet row, else the name's glyph. */
function expenseIcon(
  code: string,
  name: string,
  type: string,
  fromSheet: boolean,
): { src: string; className: string; size: number } {
  const own = fromSheet ? SHEET_ICONS[code] : undefined;
  if (own) return { src: `/accounting/expense/${own}.png`, className: "is-art", size: 60 };
  const glyph = expenseGlyph(name, type);
  return { src: `/accounting/exp-${glyph}.svg`, className: `is-${glyph}`, size: 40 };
}

/** A row's menu: Edit and Remove. Closes on Escape, on a pick, or on a click elsewhere. */
function RowMenu({
  name,
  disabled,
  onEdit,
  onRemove,
}: {
  name: string;
  disabled: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="acs-menu" ref={ref}>
      <button
        type="button"
        className="acs-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More for ${name}`}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/accounting/more.svg" width={16} height={18} alt="" />
      </button>
      {open && (
        <div className="acs-menu-list" role="menu">
          <button type="button" role="menuitem" onClick={pick(onEdit)}>
            Edit
          </button>
          <button type="button" role="menuitem" onClick={pick(onRemove)}>
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

/** What the list holds until Save & Next (plan item 4, 2026-11-20), as X3 holds its ticks. */
type HeldRow = { key: string; code: string; name: string; type: string; on: boolean };
type Held = {
  /** The company's accounts taken off the list: unticked (still shown) or removed (`hidden` too). */
  off: string[];
  hidden: string[];
  /** Auto Fill suggestions ticked (template ids). */
  ticked: string[];
  /** The company's accounts edited: id -> the new code, name and type. */
  edits: Record<string, AccountInput>;
  /** Accounts added on this screen. */
  added: HeldRow[];
};
const NOTHING_HELD: Held = { off: [], hidden: [], ticked: [], edits: {}, added: [] };

const rowKey = (code: string, name: string) => `${code}|${name.trim().toLowerCase()}`;
const flip = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];
const groupOf = (type: string): Account["group"] =>
  type === "direct_costs"
    ? "cost_of_sales"
    : ["expense", "overheads"].includes(type)
      ? "running_costs"
      : null;

/** One row as the list draws it: an account the company has, one added here, or a suggestion. */
type Item = {
  key: string;
  origin: "account" | "added" | "suggestion";
  code: string;
  name: string;
  type: string;
  description: string;
  group: Account["group"];
  on: boolean;
  /** A row from the accounting team's sheet: an Auto Fill suggestion or an account it added. */
  fromSheet: boolean;
  fromXero: boolean;
};

function AccountsScreen({
  kind,
  setup,
  token,
  entityId,
  businessType,
  nav,
  onSaved,
}: {
  kind: AccountKind;
  setup: Setup;
  token: string;
  entityId: string;
  businessType: BusinessType | null;
  nav: (onNext: () => void, busy: boolean, submitFn: SubmitFn) => React.ReactNode;
  /** Saved (the step as the API now answers it), or nothing to save: the wizard moves on. */
  onSaved: (answer: Setup | null) => void;
}) {
  const toast = useToast();
  const accounts = setup.accounts[kind];
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [asking, setAsking] = useState<Item | null>(null);
  const [saveError, setSaveError] = useState("");
  // Which form is open, so Restore opens it again before putting its fields back.
  useStepDraftField(`acs.adding.${kind}`, adding, setAdding);
  useStepDraftField(`acs.editing.${kind}`, editing, setEditing);
  // Every tick, edit, add and remove waits for Save & Next, and is kept in the step's auto-saved
  // draft until then.
  const [held, setHeldState] = useState<Held>(NOTHING_HELD);
  useStepDraftField(`acs.held.${kind}`, held, setHeldState);
  const setHeld = (change: (h: Held) => Held) => {
    setSaveError("");
    setHeldState(change);
  };

  // Filled = something Revert would take out. A kept row (Cash Over / Short, which daily closing
  // uses) is not Auto Fill's any more, or Revert would seem to fill the list again (2026-11-11).
  const autoFilled = accounts.some((a) => a.auto_filled && !held.off.includes(a.id));
  const filled =
    autoFilled || held.ticked.length > 0 || (suggestions !== null && suggestions.length > 0);
  const basedOn = BUSINESS_WORDS[businessType || "general"];
  const typeLabels = Object.fromEntries(setup.types.map((t) => [t.value, t.label]));

  // Once the list has Auto Fill rows (or a restored draft ticked some), the template's
  // suggestions show beside them, ticked or not.
  const wantsSuggestions = autoFilled || held.ticked.length > 0;
  useEffect(() => {
    if (suggestions !== null || !wantsSuggestions) return;
    let current = true;
    void accountingApi
      .suggestions(token, entityId, kind)
      .then((a) => current && a.ok && setSuggestions(a.options));
    // a Revert in the meantime: the answer no longer belongs on the list
    return () => {
      current = false;
    };
  }, [wantsSuggestions, suggestions, token, entityId, kind]);

  // Auto Fill only READS what the template offers (GET /accounting/autofill writes nothing) and
  // ticks its usual rows here; Save & Next adds them.
  const autoFill = async () => {
    setBusy(true);
    const offer = await accountingApi.suggestions(token, entityId, kind);
    setBusy(false);
    if (!offer.ok) {
      toast.error(offer.error);
      return;
    }
    if (offer.options.length === 0) {
      toast.info("There are no suggestions for this business yet. Add your own accounts instead.");
      return;
    }
    setSuggestions(offer.options);
    setHeld((h) => {
      const own = new Map(accounts.map((a) => [rowKey(a.code, a.name), a.id]));
      const typed = new Set(h.added.map((n) => rowKey(n.code, n.name)));
      const usual = offer.options.filter((o) => o.ticked);
      // an account the company has that a usual row names comes back on, if it was taken off
      const back = usual.flatMap((o) => own.get(rowKey(o.code, o.name)) ?? []);
      const fresh = usual
        .filter((o) => !own.has(rowKey(o.code, o.name)) && !typed.has(rowKey(o.code, o.name)))
        .map((o) => o.template_id);
      return {
        ...h,
        off: h.off.filter((id) => !back.includes(id)),
        hidden: h.hidden.filter((id) => !back.includes(id)),
        ticked: union(h.ticked, fresh),
      };
    });
  };

  // Revert takes the Auto Fill rows off the list (the ones nothing uses yet: `auto_filled`).
  const revert = () => {
    const filledIds = accounts.filter((a) => a.auto_filled).map((a) => a.id);
    setHeld((h) => ({
      ...h,
      ticked: [],
      off: union(h.off, filledIds),
      hidden: union(h.hidden, filledIds),
    }));
    setSuggestions(null);
  };

  // ---- the list as it stands ----
  const offered = new Set((suggestions || []).map((s) => rowKey(s.code, s.name)));
  const accountItems: Item[] = accounts
    // removed ones are gone until Auto Fill offers them again
    .filter((a) => !held.hidden.includes(a.id) || offered.has(rowKey(a.code, a.name)))
    .map((a) => {
      const edit = held.edits[a.id];
      return {
        key: a.id,
        origin: "account",
        code: edit?.code ?? a.code,
        name: edit?.name ?? a.name,
        type: edit?.type ?? a.type,
        description: a.description,
        group: edit ? groupOf(edit.type) : a.group,
        on: !held.off.includes(a.id),
        fromSheet: a.source === "template",
        fromXero: a.from_xero,
      };
    });
  const addedItems: Item[] = held.added.map((n) => ({
    key: n.key,
    origin: "added",
    code: n.code,
    name: n.name,
    type: n.type,
    description: "",
    group: groupOf(n.type),
    on: n.on,
    fromSheet: false,
    fromXero: false,
  }));
  const taken = new Set([
    ...accounts.map((a) => rowKey(a.code, a.name)),
    ...held.added.map((n) => rowKey(n.code, n.name)),
  ]);
  const suggestionItems: Item[] = (suggestions || [])
    .filter((s) => !taken.has(rowKey(s.code, s.name)))
    .map((s) => ({
      key: s.template_id,
      origin: "suggestion",
      code: s.code,
      name: s.name,
      type: s.type,
      description: s.description,
      group: s.group,
      on: held.ticked.includes(s.template_id),
      fromSheet: true,
      fromXero: false,
    }));
  const items = [...accountItems, ...addedItems, ...suggestionItems];

  const changed =
    held.off.length > 0 ||
    held.ticked.length > 0 ||
    Object.keys(held.edits).length > 0 ||
    held.added.some((n) => n.on);

  const toggle = (it: Item) => {
    if (it.fromXero) return;
    setHeld((h) =>
      it.origin === "account"
        ? { ...h, off: flip(h.off, it.key), hidden: h.hidden.filter((id) => id !== it.key) }
        : it.origin === "added"
          ? { ...h, added: h.added.map((n) => (n.key === it.key ? { ...n, on: !n.on } : n)) }
          : { ...h, ticked: flip(h.ticked, it.key) },
    );
  };

  // An account the company has asks first (it is taken out at Save & Next); a row added here
  // simply goes.
  const remove = (it: Item) => {
    if (it.origin === "account") setAsking(it);
    else if (it.origin === "added")
      setHeld((h) => ({ ...h, added: h.added.filter((n) => n.key !== it.key) }));
    if (editing === it.key) setEditing(null);
  };
  const confirmRemove = () => {
    if (!asking) return;
    const id = asking.key;
    setHeld((h) => ({ ...h, off: union(h.off, [id]), hidden: union(h.hidden, [id]) }));
    if (editing === id) setEditing(null);
    setAsking(null);
  };

  /** A code or name another row on the list already has (the API checks again on save). */
  const clashes = (input: AccountInput, except?: string): Record<string, string> => {
    const others = items.filter((i) => i.on && i.key !== except);
    const byCode = input.code ? others.find((i) => i.code === input.code) : undefined;
    const byName = others.find(
      (i) => i.name.trim().toLowerCase() === input.name.trim().toLowerCase(),
    );
    return {
      ...(byCode
        ? { code: `The code ${input.code} is already used by ${byCode.name}. Choose another code.` }
        : {}),
      ...(byName
        ? { name: `Another account is already called ${byName.name}. Choose another name.` }
        : {}),
    };
  };
  const refusedOrOk = (fields: Record<string, string>): Answer<object> =>
    Object.keys(fields).length
      ? { ok: false, error: Object.values(fields)[0], fields }
      : { ok: true };

  const addRow = async (input: AccountInput): Promise<Answer<object>> => {
    const answer = refusedOrOk(clashes(input));
    if (!answer.ok) return answer;
    setHeld((h) => ({
      ...h,
      added: [
        ...h.added,
        {
          key: `new-${Date.now().toString(36)}-${h.added.length}`,
          code: input.code,
          name: input.name,
          type: input.type,
          on: true,
        },
      ],
    }));
    setAdding(false);
    return answer;
  };
  const editRow = async (it: Item, input: AccountInput): Promise<Answer<object>> => {
    const answer = refusedOrOk(clashes(input, it.key));
    if (!answer.ok) return answer;
    setHeld((h) => {
      if (it.origin === "added")
        return {
          ...h,
          added: h.added.map((n) => (n.key === it.key ? { ...n, ...input, key: n.key } : n)),
        };
      const original = accounts.find((a) => a.id === it.key);
      const edits = { ...h.edits };
      if (
        original &&
        original.code === input.code &&
        original.name === input.name &&
        original.type === input.type
      )
        delete edits[it.key];
      else edits[it.key] = { code: input.code, name: input.name, type: input.type };
      return { ...h, edits };
    });
    setEditing(null);
    return answer;
  };

  // ---- Save & Next: one PUT with the list as it stands ----
  /** Saved: the step as the API now answers it (null when there was nothing to send). */
  const put = async (): Promise<Result<{ saved: Setup | null }>> => {
    if (!changed || !entityId) return { ok: true, saved: null };
    setBusy(true);
    setSaveError("");
    const answer = await accountingApi.saveAccounts(token, entityId, kind, held.ticked, [
      ...accounts
        .filter((a) => !a.from_xero && !held.off.includes(a.id))
        .map((a) => {
          const edit = held.edits[a.id];
          return {
            id: a.id,
            code: edit?.code ?? a.code,
            name: edit?.name ?? a.name,
            type: edit?.type ?? a.type,
            description: a.description,
          };
        }),
      ...held.added
        .filter((n) => n.on)
        .map((n) => ({ code: n.code, name: n.name, type: n.type, description: "" })),
    ]);
    setBusy(false);
    if (!answer.ok) {
      // nothing was written: the list stays as held, with the reason beside Save & Next
      setSaveError(answer.error);
      return { ok: false, error: answer.error };
    }
    return { ok: true, saved: answer };
  };
  // Save & Exit saves the held list first (OnboardingApp `saveAndExit`); a refusal keeps the draft.
  const send: SubmitFn = async () => {
    const result = await put();
    return result.ok ? { ok: true } : result;
  };
  const saveAndNext = async () => {
    const result = await put();
    if (result.ok) onSaved(result.saved);
  };

  const groups: { id: string; title: string | null; items: Item[] }[] =
    kind === "sales"
      ? [{ id: "all", title: null, items }].filter((g) => g.items.length > 0)
      : [
          {
            id: "cost_of_sales",
            title: "Cost of what you sell",
            items: items.filter((i) => i.group === "cost_of_sales"),
          },
          {
            id: "running_costs",
            title: "Running the business",
            items: items.filter((i) => i.group !== "cost_of_sales"),
          },
        ].filter((g) => g.items.length > 0);

  const title = kind === "sales" ? "Your sales categories" : "What do you usually spend money on?";
  // One sentence, and one box for the rest (owner, 2026-11-26).
  const lede =
    kind === "sales"
      ? "Choose the sales categories that apply to your business."
      : "Choose the categories that apply to your business.";
  const boxText =
    kind === "sales"
      ? filled
        ? `Based on ${basedOn}. You can add, remove or rename these later.`
        : null
      : "Staff pick from these when they add an expense.";
  const noun = kind === "sales" ? "sales category" : "category";
  const listNoun = kind === "sales" ? "sales categories" : "expense categories";

  const sales = kind === "sales";
  const editForm = (it: Item) => (
    <AccountForm
      idPrefix={`acs-edit-${it.key}`}
      title="Edit account"
      types={KIND_TYPES[kind]}
      typeLabels={typeLabels}
      nextCode={setup.next_code}
      initial={{ code: it.code, name: it.name, type: it.type }}
      submitLabel="Save"
      onCancel={() => setEditing(null)}
      onSave={(input) => editRow(it, input)}
    />
  );
  const menuFor = (it: Item) =>
    it.origin !== "suggestion" && !it.fromXero ? (
      <RowMenu
        name={it.name}
        disabled={busy}
        onEdit={() => setEditing(it.key)}
        onRemove={() => remove(it)}
      />
    ) : null;
  return (
    <div className={"acs" + (sales ? " acs-sales" : " acs-expense")}>
      <div className="page-head acs-head acs-mode-head">
        <h2>{title}</h2>
        <p>{lede}</p>
      </div>
      {boxText && <InfoBox>{boxText}</InfoBox>}

      {/* the one Auto Fill button, as Petty Cash Settings draws it */}
      <div className="acs-autofill">
        <AutofillButton active={filled} onClick={filled ? revert : autoFill} disabled={busy} />
      </div>

      {items.length === 0 && !adding && (
        <div className="acs-empty">
          <p className="acs-empty-title">No {listNoun} yet</p>
          <p>Auto Fill adds the usual ones. Or add your own, one at a time.</p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.id} className="acs-group" aria-label={g.title || title}>
          {g.title && (
            <h3 className="acs-group-title">
              {g.title} <span>({g.items.length})</span>
            </h3>
          )}
          <ul className={sales ? "acs-coa" : "acs-cards"}>
            {g.items.map((it) =>
              editing === it.key && it.origin !== "suggestion" ? (
                <li key={it.key} className="acs-row is-editing">
                  {editForm(it)}
                </li>
              ) : sales ? (
                <li key={it.key} className={"acs-coa-row" + (it.on ? " is-on" : "")}>
                  <span className={"acs-coa-icon is-" + salesGlyph(it.name, it.type)} aria-hidden>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/accounting/glyph-${salesGlyph(it.name, it.type)}.svg`}
                      width={34}
                      height={34}
                      alt=""
                    />
                  </span>
                  <label className="acs-coa-main">
                    <span className="acs-coa-text">
                      <span className="acs-coa-name">{it.name}</span>
                      <span className="acs-coa-meta">
                        {[it.code, it.description].filter(Boolean).join("  ·  ")}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      className="acs-coa-input"
                      checked={it.on}
                      disabled={busy || it.fromXero}
                      onChange={() => toggle(it)}
                    />
                    <span className="acs-coa-check" aria-hidden>
                      {it.on && <Icon.CheckSm width={16} height={16} />}
                    </span>
                  </label>
                  {menuFor(it) ?? <span className="acs-menu" aria-hidden />}
                </li>
              ) : (
                <li key={it.key} className={"acs-exp" + (it.on ? " is-on" : "")}>
                  <label className="acs-exp-main">
                    <span className="acs-exp-top">
                      {(() => {
                        const icon = expenseIcon(it.code, it.name, it.type, it.fromSheet);
                        return (
                          <span className={"acs-exp-icon " + icon.className} aria-hidden>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={icon.src} width={icon.size} height={icon.size} alt="" />
                          </span>
                        );
                      })()}
                      <input
                        type="checkbox"
                        className="acs-coa-input"
                        checked={it.on}
                        disabled={busy || it.fromXero}
                        onChange={() => toggle(it)}
                      />
                      <span
                        className={"acs-xero-box acs-exp-box" + (it.on ? " is-on" : "")}
                        aria-hidden
                      >
                        {it.on && <Icon.CheckSm width={14} height={14} />}
                      </span>
                    </span>
                    <span className="acs-exp-name">{it.name}</span>
                    {it.description && (
                      <span className="acs-exp-body" title={it.description}>
                        {it.description}
                      </span>
                    )}
                    {it.code && <span className="acs-exp-code">Code {it.code}</span>}
                  </label>
                  {menuFor(it)}
                </li>
              ),
            )}
          </ul>
        </section>
      ))}

      {adding ? (
        <AccountForm
          idPrefix={`acs-add-${kind}`}
          title="Add an account"
          types={KIND_TYPES[kind]}
          typeLabels={typeLabels}
          nextCode={setup.next_code}
          submitLabel="Add"
          onCancel={() => setAdding(false)}
          onSave={addRow}
        />
      ) : (
        <button
          type="button"
          className={"acs-add" + (sales ? " acs-coa-add" : " acs-exp-add")}
          onClick={() => setAdding(true)}
        >
          {sales ? (
            <>
              <span className="acs-coa-plus" aria-hidden>
                +
              </span>
              Add another {noun}
            </>
          ) : (
            <>
              <span className="acs-exp-add-label">+&nbsp;&nbsp;Add another {noun}</span>
              <span className="acs-exp-add-hint">Can&apos;t find what you need? Add it here.</span>
            </>
          )}
        </button>
      )}
      {saveError && (
        <p className="field-required" role="alert">
          {saveError}
        </p>
      )}
      {nav(() => void saveAndNext(), busy, send)}

      {asking && (
        <ConfirmDialog
          title={`Remove ${asking.name}?`}
          confirmLabel="Remove"
          confirmTone="red"
          onConfirm={confirmRemove}
          onBack={() => setAsking(null)}
        >
          <p className="mw-dialog-body">
            {asking.name} comes off your {listNoun} when you press Save &amp; Next.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

// ---- 4.5 -------------------------------------------------------------------------------------------

/** "Refresh from Xero" (X2-X4): accounts-api syncs the chart, then the step reads it again. */
function XeroRefresh({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="acs-xero-refresh">
      <button
        type="button"
        className="btn-link-center"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onRefresh();
          setBusy(false);
        }}
      >
        {busy ? "Refreshing…" : "Refresh from Xero"}
      </button>
    </div>
  );
}

/** Rows shown before "Show more accounts" (X2, X3); a search shows every match. */
const XERO_VISIBLE = 10;

/** X2 / X3 (Figma 348:1874, 348:1949): tick which of the Xero chart's sales or expense accounts
 * Minty uses. Accounts not ticked stay in Xero; they just aren't offered in Minty. */
function XeroAccountsScreen({
  kind,
  setup,
  nav,
  onRefresh,
  onSave,
  onExitSave,
}: {
  kind: AccountKind;
  setup: Setup;
  nav: (onNext: () => void, busy?: boolean, submitFn?: SubmitFn) => React.ReactNode;
  onRefresh: () => Promise<void>;
  /** Saves the ticks; answers the refusal's sentence, or null when saved. */
  onSave: (ids: string[]) => Promise<string | null>;
  /** Save & Exit: the ticks saved first (none ticked is not saved), without moving on. */
  onExitSave: (ids: string[]) => Promise<ExitSaved>;
}) {
  const rows = setup.accounts[kind].filter((a) => a.from_xero);
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(rows.filter((a) => a.used).map((a) => a.id)),
  );
  useStepDraftField(`acs.xero.${kind}`, [...ticked].sort(), (ids) => setTicked(new Set(ids)));
  const [query, setQuery] = useState("");
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const noun = kind === "sales" ? "sales" : "expense";

  const q = query.trim().toLowerCase();
  const matches = q
    ? rows.filter((a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
    : rows;
  const shown = q || more ? matches : matches.slice(0, XERO_VISIBLE);
  const hidden = matches.length - shown.length;

  const toggle = (id: string) => {
    setError("");
    setTicked((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(id)) nextSet.delete(id);
      else nextSet.add(id);
      return nextSet;
    });
  };

  const save = async () => {
    if (rows.length > 0 && ticked.size === 0) {
      setError(`Tick at least one ${noun} account to continue.`);
      document.getElementById("acs-xero-list")?.focus();
      return;
    }
    setSaving(true);
    const refused = await onSave([...ticked]);
    setSaving(false);
    if (refused) setError(refused);
  };

  return (
    <div className="acs acs-sales acs-xero">
      <div className="page-head acs-head acs-mode-head">
        <h2>Which {noun} accounts should Minty use?</h2>
        <p>
          {kind === "sales"
            ? "Tick the accounts your daily sales are recorded to."
            : "Tick the accounts staff can pick from."}
        </p>
      </div>
      <InfoBox>
        These come from your Xero chart of accounts. Missing one? Create it in Xero, then press
        Refresh. Accounts you don&apos;t tick stay in Xero; they just won&apos;t appear in Minty.
      </InfoBox>
      <XeroRefresh onRefresh={onRefresh} />
      <div className="acs-xero-stack">
        <label className="acs-xero-search">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/accounting/search.svg" width={14} height={14} alt="" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search accounts…"
            aria-label="Search accounts"
          />
        </label>
        {rows.length === 0 ? (
          <p className="acs-xero-empty">
            No {noun} accounts came from Xero yet. Create one in Xero, then press Refresh from Xero.
          </p>
        ) : (
          <ul
            id="acs-xero-list"
            tabIndex={-1}
            className={"acs-xero-list" + (error ? " has-error" : "")}
            aria-label={`Xero ${noun} accounts`}
            aria-describedby={error ? "acs-xero-error" : undefined}
          >
            {shown.map((a) => (
              <li key={a.id}>
                <label className="acs-xero-row">
                  <input
                    type="checkbox"
                    className="acs-coa-input"
                    checked={ticked.has(a.id)}
                    onChange={() => toggle(a.id)}
                  />
                  <span className={"acs-xero-box" + (ticked.has(a.id) ? " is-on" : "")} aria-hidden>
                    {ticked.has(a.id) && <Icon.CheckSm width={13} height={13} />}
                  </span>
                  <span className="acs-xero-code">{a.code}</span>
                  <span className="acs-xero-name">{a.name}</span>
                  {a.type_label && <span className="acs-xero-type">{a.type_label}</span>}
                </label>
              </li>
            ))}
            {q && matches.length === 0 && (
              <li className="acs-xero-none">No account matches &ldquo;{query.trim()}&rdquo;.</li>
            )}
          </ul>
        )}
        {error && (
          <p className="field-required" id="acs-xero-error" role="alert">
            {error}
          </p>
        )}
        {rows.length > 0 && (
          <div className="acs-xero-foot">
            <span>{ticked.size} selected</span>
            {hidden > 0 && (
              <button type="button" className="acs-xero-more" onClick={() => setMore(true)}>
                ⌄ Show more accounts ({hidden})
              </button>
            )}
          </div>
        )}
      </div>
      {nav(save, saving, async () =>
        rows.length > 0 && ticked.size === 0 ? null : onExitSave([...ticked]),
      )}
    </div>
  );
}
