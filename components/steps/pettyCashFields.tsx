// Presentational pieces shared by the petty-cash steps: the method list, the tick, the
// account-code card and the titled field section. Extracted verbatim from OnboardingSteps.
//
// AccountCodesCard is rendered by BOTH StepAccountCode and StepBills -- the two are close
// siblings differing mainly in which account set they pass in.

// --- Step 4: Petty Cash Settings ---

import { useState, useId, type DragEvent, type ReactNode, type Ref } from "react";
import Icon from "../Icon";
import MintySelect, { type SelectOption } from "../MintySelect";
import { UUID_RE } from "../../lib/validation";
import type { CurrencyRow } from "../../lib/refData";
import type { ContactResult } from "../../lib/api";
import type { CodeSelection } from "../../lib/types";

export const CURRENCY_CODES: Record<string, string> = {
  "Hong Kong Dollar": "HKD",
  "Singapore Dollar": "SGD",
  "Australian Dollar": "AUD",
  "New Zealand Dollar": "NZD",
  "Pound Sterling": "GBP",
  "US Dollar": "USD",
  "Indian Rupee": "INR",
};
// state.entity.currency holds a currency_info uuid (Step 1 dropdowns submit
// uuids); resolve it to the ISO code via the fetched registry. The name-based
// map remains as a fallback for sessions saved before the uuid switch. Never
// render a bare uuid — while the registry is still loading, show nothing.
export const currencyCode = (
  c: string | null | undefined,
  registry: readonly Pick<CurrencyRow, "currency_id" | "iso_code" | "currency_name">[] = [],
): string => {
  const row = registry.find((r) => r.currency_id === c);
  if (row) return row.iso_code || row.currency_name;
  if (UUID_RE.test(c || "")) return "";
  return CURRENCY_CODES[c || ""] || (c || "").split(" ")[0];
};

/** The company currency's decimal places for amounts (JPY is 0); 2 until the registry is in. */
export const currencyDecimals = (
  c: string | null | undefined,
  registry: readonly Pick<CurrencyRow, "currency_id" | "decimal_places">[] = [],
): number => {
  const places = registry.find((r) => r.currency_id === c)?.decimal_places;
  return typeof places === "number" && places >= 0 ? places : 2;
};

type MethodListProps = {
  title: string;
  methods: string[];
  placeholder?: string;
  onAdd: (name: string) => void;
  /** Receives a fresh array; the list never mutates the one it was given. */
  onChange: (methods: string[]) => void;
  autoFilled?: boolean;
  /** The card's badge: a card for payments, the van for delivery. */
  glyph?: "sales" | "delivery";
  /** The sales account the list belongs to ("Sales - Electronic Payment"), said under the title. */
  account?: string;
};

/** Step 5's method list (Figma 464:73 row 2, owner 2026-11-17): a card per sales account, the
 * methods as chips (x removes one; drag a chip, or press the arrow keys on it, to reorder), and an
 * always-there add field with "+ Add" beside it. */
export function MethodList({
  title,
  methods,
  placeholder = "Enter method name",
  onAdd,
  onChange,
  autoFilled = false,
  glyph = "sales",
  account,
}: MethodListProps) {
  const [name, setName] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const inputId = useId();

  const remove = (i: number) => {
    const copy = methods.slice();
    copy.splice(i, 1);
    onChange(copy);
  };
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= methods.length) return;
    const copy = methods.slice();
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved);
    onChange(copy);
  };

  const onDragStart = (i: number) => (e: DragEvent) => {
    setDragIdx(i);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", String(i));
      } catch {}
    }
  };
  const onDragOver = (i: number) => (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (overIdx !== i) setOverIdx(i);
  };
  const onDrop = (i: number) => (e: DragEvent) => {
    e.preventDefault();
    if (dragIdx !== null) move(dragIdx, i);
    setDragIdx(null);
    setOverIdx(null);
  };
  const onDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  const typed = name.trim();
  const already = typed ? methods.find((m) => m.toLowerCase() === typed.toLowerCase()) : undefined;
  const submit = () => {
    if (!typed || already) return;
    onAdd(typed);
    setName("");
  };

  return (
    <div className={"method-card pc-method-card is-" + glyph}>
      <div className="pc-method-head">
        <span className="pc-method-badge" aria-hidden>
          {glyph === "delivery" ? <Icon.Delivery /> : <Icon.CreditCard />}
        </span>
        <span className="pc-method-heading">
          <span className="method-title">
            {title}
            {autoFilled && (
              <span className="method-sparkle" aria-hidden>
                <Icon.Sparkle />
              </span>
            )}
          </span>
          {account && <span className="pc-method-sub">For your {account} account</span>}
        </span>
      </div>
      <ul className="pc-chips method-list" aria-label={`${title} methods`}>
        {methods.map((m, i) => (
          <li
            className={
              "pc-chip method-row" +
              (dragIdx === i ? " is-dragging" : "") +
              (overIdx === i && dragIdx !== i ? " is-drag-over" : "")
            }
            key={m + i}
            onDragOver={onDragOver(i)}
            onDrop={onDrop(i)}
            onDragLeave={() => {
              if (overIdx === i) setOverIdx(null);
            }}
          >
            <span
              className="pc-chip-grab"
              role="button"
              tabIndex={0}
              aria-label={"Drag to reorder " + m}
              aria-roledescription="Movable chip. Arrow keys move it."
              draggable
              onDragStart={onDragStart(i)}
              onDragEnd={onDragEnd}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                  e.preventDefault();
                  move(i, i - 1);
                } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                  e.preventDefault();
                  move(i, i + 1);
                }
              }}
              title="Drag to reorder"
            >
              <span className="method-name">{m}</span>
            </span>
            <button
              type="button"
              className="pc-chip-x"
              aria-label={"Delete " + m}
              onClick={() => remove(i)}
            >
              <Icon.Close width={14} height={14} />
            </button>
          </li>
        ))}
      </ul>
      <div className="pc-add-row">
        <label className="sr-only" htmlFor={inputId}>
          New {title} method
        </label>
        <div className={"field pc-add-field" + (already ? " field-error" : "")}>
          <input
            id={inputId}
            type="text"
            placeholder={placeholder}
            value={name}
            aria-invalid={!!already}
            aria-describedby={already ? inputId + "-msg" : undefined}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
              if (e.key === "Escape") setName("");
            }}
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost pc-add-btn"
          disabled={!typed || !!already}
          onClick={submit}
        >
          <Icon.Plus width={16} height={16} /> Add
        </button>
      </div>
      {already && (
        <div className="field-required" id={inputId + "-msg"}>
          {already} is already in this list.
        </div>
      )}
    </div>
  );
}

export function MintCheck({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={"mint-check" + (checked ? " on" : "")}
      onClick={() => onChange(!checked)}
    >
      {checked && <Icon.CheckSm />}
    </button>
  );
}

// Shared account-code picker for the Account Code and Bill steps.
//
// The two steps differ in three ways, each kept as a prop rather than
// normalized away, because each is observable behavior:
//   - `header`      Bill renders a title/subtitle block above the list.
//   - `searchLabels` Account matches the typed query against the full
//                    "CODE · Name" label; Bill matches the raw code only.
//   - `labelAria`   Account's checkbox aria-label is the full label; Bill's
//                    is the bare code.
// `bodyStyle` carries the two steps' differing padding/display.
type AccountCodesCardProps = {
  /** The codes, in display order. Labels come from `labels`. */
  codes: string[];
  /** May arrive with `all` or `selected` missing -- both are tolerated, see lib/types. */
  value: Partial<CodeSelection>;
  onChange: (next: CodeSelection) => void;
  labels?: Record<string, string>;
  header?: ReactNode;
  /** Account step searches the full label; Bill step searches the raw code only. */
  searchLabels?: boolean;
  /** Account step labels the checkbox with the full label; Bill step with the bare code. */
  labelAria?: boolean;
  bodyStyle?: React.CSSProperties;
  /** What an empty list says (Payment Settings: "Add an expense account in Accounting Setup first."). */
  empty?: ReactNode;
};

export function AccountCodesCard({
  codes,
  value,
  onChange,
  labels,
  header = null,
  searchLabels = true,
  labelAria = true,
  bodyStyle = { padding: 20 },
  empty,
}: AccountCodesCardProps) {
  const [q, setQ] = useState("");
  const sel: Record<string, boolean> = value.selected || {};
  const isAll = value.all !== false;
  const isOn = (code: string) => (isAll ? sel[code] !== false : sel[code] === true);
  const allOn = codes.length > 0 && codes.every((c) => isOn(c));
  const labelOf = (code: string) => (labels && labels[code]) || code;
  const toggle = (code: string) => {
    if (isAll) {
      const next: Record<string, boolean> = {};
      codes.forEach((c) => {
        next[c] = true;
      });
      next[code] = false;
      onChange({ all: false, selected: next });
      return;
    }
    const cur = isOn(code);
    onChange({ all: false, selected: { ...sel, [code]: !cur } });
  };
  const toggleAll = () => {
    if (allOn) {
      const off: Record<string, boolean> = {};
      codes.forEach((c) => {
        off[c] = false;
      });
      onChange({ all: false, selected: off });
    } else {
      onChange({ all: true, selected: {} });
    }
  };
  const searchTextOf = (code: string) => (searchLabels ? labelOf(code) : code);
  const filtered = codes.filter((c) =>
    searchTextOf(c).toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <div className="method-card acc-card open">
      {header}
      <div className="method-body" style={bodyStyle}>
        <div className="acc-search">
          <input
            type="text"
            placeholder="Search account code"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="acc-search-icon">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </span>
        </div>
        <div className="acc-allrow">
          <span className="acc-all-label">{allOn ? "Deselect all" : "Select all"}</span>
          <MintCheck checked={allOn} onChange={toggleAll} ariaLabel="Select all" />
        </div>
        <ul className="acc-list">
          {filtered.map((code) => (
            <li className="acc-row" key={code}>
              <span className="acc-name">{labelOf(code)}</span>
              <MintCheck
                checked={isOn(code)}
                onChange={() => toggle(code)}
                ariaLabel={labelAria ? labelOf(code) : code}
              />
            </li>
          ))}
          {codes.length === 0 && (
            <li className="acc-empty">{empty ?? "Connect to Xero to load account codes"}</li>
          )}
          {codes.length > 0 && filtered.length === 0 && (
            <li className="acc-empty">No matching account code</li>
          )}
        </ul>
      </div>
    </div>
  );
}

/** One dropdown row in a PCSection. */
export type PCField = {
  label: ReactNode;
  /**
   * Mandatory, and marked with a red asterisk. Every field PCSection draws today is a hard
   * gate - steps 6 and 7 refuse Next without it - so this defaults ON and an optional field
   * is the one that has to say so.
   */
  required?: boolean;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  onAddNew?: ((name: string) => Promise<ContactResult>) | null;
  error?: boolean;
};

type PCSectionProps = {
  title: string;
  fields: PCField[];
  /** The step scrolls the card into view when validation fails. */
  cardRef?: Ref<HTMLDivElement>;
};

export function PCSection({ title, fields, cardRef }: PCSectionProps) {
  const cardHasError = fields.some((f) => f.error);
  return (
    <div className={"pc-card" + (cardHasError ? " is-error" : "")} ref={cardRef}>
      <div className="pc-title">{title}</div>
      {fields.map((f, i) => (
        <div className={"pc-field" + (f.error ? " field-error" : "")} key={i}>
          <div className="pc-sub">
            {f.label}
            {f.required === false ? null : (
              <span className="req" aria-hidden>
                *
              </span>
            )}
          </div>
          <MintySelect
            value={f.value}
            onChange={f.onChange}
            options={f.options}
            placeholder="Select an option"
            required={f.required !== false}
            invalid={Boolean(f.error)}
            searchable
            clearable
            onCreate={f.onAddNew}
            createNoun="contact"
          />
          {f.error && <div className="field-required">I&apos;ll need this one to keep going.</div>}
        </div>
      ))}
    </div>
  );
}
