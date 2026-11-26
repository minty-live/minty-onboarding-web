# The wizard — nine steps from a company name to a live company

`components/OnboardingApp.tsx` is the state machine (one `WizardState`, `lib/types.ts`;
`initialState()` and the step rules in `lib/wizardSteps.ts`), `components/OnboardingSteps.tsx`
the nine screens, `components/Stepper.tsx` the rail. Every write goes to
`/api/onboarding/*` through `lib/api.ts` with the launch token
(`minty-onboarding-api/docs/features/wizard-api.md` is the contract).

## The steps (`lib/wizardSteps.STEPS`)

| #   | Screen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Component                                                                         | Writes                                                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Basic Information — name, country, currency (all three required), phone, email (optional). A new company starts **empty**, Country and Currency included, like the phone's code (owner, 2026-10-19; _Select a country_ / _Select a currency_); picking a country fills an empty currency with its own (`lib/countryCurrency.ts`) and moves the phone's code, and the company's timezone is the country's, set by the API with nothing on screen (owner, 2026-11-04; the browser's zone is no longer sent)                                                                                                                                                                                                                                                                                                                                                                                                                                    | `StepCreateEntity`                                                                | `POST /create` on the first advance, `PUT /entity/{id}` after                                                                                                                                                                                                                                                                                   |
| 2   | Select Module — Petty Cash, Payment Request (cards in the old live app's design: accent gradient, large illustration, the description over the card on hover/focus, a teal gradient frame when picked); the price summary (01-A/B/C: the plan, the card under its network's mark, the after-trial price) and the billing sheet (`BillingSheet.tsx`: card capture through Stripe, consent); the click that picks the second module bursts confetti out from behind the cards' two top corners, gone within two seconds                                                                                                                                                                                                                                                                                                                                                                                                                        | `StepSelectModule`                                                                | `POST /modules`, the `billing/*` routes                                                                                                                                                                                                                                                                                                         |
| 3   | User Invite — invite colleagues with a role; on arrival a prompt in minty-web's modal design (`components/ModalFrame.tsx`) recommends inviting the accountant or bookkeeper (no "Xero" in it, 2026-11-26), with Minty and Ollie under the title; _Go to invite_ closes it and stays (as Escape and the backdrop do), _Skip for now_ goes straight to step 4 (2026-11-26); the email field refuses the signed-in person's own address as it is typed ("That's you — you're already in this entity. No need to invite yourself.", Send disabled; the email from `lib/profileApi.ts`'s `loadMyEmail`, and the API's 409 still stands behind it); each pending row says when it expires (`inviteExpiryLabel`) and offers _Resend_; its X asks first (2026-11-20: ConfirmDialog "Cancel the invitation to <email>?" - _Cancel invitation_ / _Go back_; `components/ConfirmDialog.tsx`, minty-web's ConfirmDialog ported) and only then cancels it | `StepInvite`                                                                      | `POST /invite`, `/invite/cancel`, `/invite/resend`                                                                                                                                                                                                                                                                                              |
| 4   | Accounting Setup (Xero optional, 2026-11-10; [below](#accounting-setup--step-4-xero-optional)) — 4.1 how Minty keeps the books; with Xero, Connect to Xero ([xero-step.md](xero-step.md)); on its own, 4.2 business type and cash question (it brings the sales accounts and daily closing's accounts), the sales accounts screen (2026-11-17: which of Cash, Electronic Payment and Delivery), 4.4 expense accounts; with Xero, X3 expense accounts (owner, 2026-11-11: 4.3, 4.5, X2 and X4 removed)                                                                                                                                                                                                                                                                                                                                                                                                                                        | `StepAccountingSetup` (`components/steps/AccountingSetup.tsx`), `StepConnectXero` | `POST /accounting/*` ([the API](../../../minty-onboarding-api/docs/features/wizard-api.md)); Minty's `/xero_connect`                                                                                                                                                                                                                            |
| 5   | Sales Setting — electronic and delivery methods (both start empty; _Auto Fill_ fills Flask's default set, _Revert_ empties them again — a new company is seeded with Cash only), and the opening balance (the cash in the drawer on day one) and its date - defaulting to the server's Hong Kong "today" (`/server-time`, the same day that caps it; Hong Kong's date from the browser if that call fails), never the browser's clock, and only when no date is there yet (2026-10-26) - typed in the currency's decimal places (`currencyDecimals`; JPY is whole amounts), with commas as it is typed and the places padded on blur (`@minty/shared/amountInput`, owner 2026-10-26)                                                                                                                                                                                                                                                         | `StepSalesSetting`                                                                | `POST /sales-methods`, `POST /opening-balance`                                                                                                                                                                                                                                                                                                  |
| 6   | Account Code Setting — the expense accounts and the petty-cash account mapping                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `StepAccountCode`                                                                 | `POST /account-codes`                                                                                                                                                                                                                                                                                                                           |
| 7   | Contact Setup — the petty-cash contacts (director, discrepancy, and cash sale only for a company with cash sales; a new one can be created in Xero; the open list says to type a name to add one)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `StepOthers`                                                                      | `POST /contacts`, `/contacts/create`                                                                                                                                                                                                                                                                                                            |
| 8   | Payment Request Settings — step 4's expense accounts to tick (no default code since 2026-11-18, owner)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `StepBills`                                                                       | `POST /bill-codes`                                                                                                                                                                                                                                                                                                                              |
| 9   | All Set                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `StepAllSet`                                                                      | **`POST /finalize` on arrival**; _Try again_ re-posts it after a failure; a 409 for unfinished setup lists each gap with _Go to <step>_ (`returnToStep`, the one way out of the locked stepper), titles the screen _Almost there_ and holds the confetti (it flies only once finalize succeeds); the needs-Xero dialog never opens over All Set |

The rail groups 5–7 as _Petty Cash Settings_ (5 alone for a company keeping its books in Minty
on its own, which chose its accounts in step 4 and has no Xero contacts) and shows 8 only when
that module was chosen (`getDisplaySteps`); `isStepComplete` decides the ticks. Each screen's chrome (the
Save & Next / Save & Exit buttons, the errors) is `components/steps/StepChrome.tsx`;
shared fields in `components/steps/pettyCashFields.tsx`, the pricing in
`components/steps/modulePricing.tsx`; selects and the date picker are the app's own
(`MintySelect`, `MintyDatePicker`).

### Phone Number (Step 1, `components/PhoneField.tsx`, since 2026-10-12)

A dial-code picker beside the number, labelled _Phone Number (optional)_ (it was _Contact
Phone_, an 8–11-digit box with no country code). No hint line under it (the user's call).

- **The picker** is a searchable `MintySelect`: the menu rows read `Hong Kong +852`, the closed
  field `HK +852` (`valueLabel`). No flag emoji: Windows draws them as letters. Its list is
  `GET /countries`' `phone_code`, so a country without one is not offered. Those codes live in
  `country_info.phone_code`, filled by step 4 of
  `Minty/scripts/schema_migration/pettycashv3_data_post_build.sql` (their only copy since
  2026-11-04; `load_catalogue.py` points there when they are missing). A database without them
  offers no codes, and the API refuses every number.
- **It follows the Country** until the user picks a code; picking the Country's own code
  makes it follow again. Pasting `+65 6123 4567` into the number moves it to +65. On a shared
  code (+1, +44, +7…) the company's Country wins when it is one of them, else the code's main
  country (`MAIN_COUNTRY`: +44 is the UK, not Guernsey, which sorts first). A pasted number's
  national part is kept as digits only.
- **State** (`EntityForm.phone`) is `+<code> <national as typed>` ("+852 9123 4567"), and
  `phoneCountry` is the user's own pick ("" = follows). The API is sent compact E.164
  (`phoneForApi`: "+85291234567", the domestic trunk 0 dropped except for +39/+378). A stored
  number, or a digits-only one from before the picker, is split back into the field's form once
  the list is in (`splitStoredPhone`, under the Country's code, minus that code if it was typed
  in front).
- **The rule** (`lib/validation.ts` `phoneError`, mirrored in the API's `resolve.PHONE_LENGTHS`,
  change both together): exactly 8 digits for +852, the one market Minty sells in (the user,
  2026-10-12: strict on Hong Kong only for now - add a code when its market opens); otherwise
  E.164's bounds (4+ national digits, 15 in all). The message (_A +852 number has 8 digits._,
  worded by code because the registry's names are the official ones, "Hong Kong SAR China")
  waits for the first blur; Save & Next stays off while it stands. A number with no code to
  judge it by is blocked the same way (_Please choose a country code._), so a bare number can
  never reach the API, which refuses it.
- **No digit past the maximum** (`maxNationalDigits`: 8 for +852, else what 15 leaves after the
  code). A keystroke on a full number is refused outright (so a digit typed mid-number cannot
  push the last one out), a paste is cut at the limit (`capNational`, punctuation kept, a
  dropped trunk 0 not counted), and deleting always works, even on a number a code change
  left too long.
- **There is no default Country** since 2026-10-19 (owner): a new company starts with Country,
  Currency and the phone's code all empty. Before that the default was the label
  `'Hong Kong'` / `'Hong Kong Dollar'`; a session saved then may still carry them, so Step 1
  still matches a label to its registry row - exactly or by a UNIQUE prefix (the API's own
  fallback), since the registry holds the official name ("Hong Kong SAR China").

The billing sheet's address (Stripe's AddressElement) starts on the company's Step 1 Country
(`BillingSheet`'s `country` → `defaultValues`, since 2026-10-12). Left to itself Stripe guesses
from the browser's location, so a Hong Kong payer on a US-set browser met "United States".

A card's network mark is `components/CardBrand.tsx`: our own wordmark (Mastercard's circles
drawn as circles), never the issuers' licensed artwork. Every saved card wears it in the
same white chip (`pm-brand`, 56 x 36), the Payment Methods sheet and the module step's
summary alike (the user, 2026-11-25: no bare marks), and "ending in NNNN" never splits
(`.card-last4`), so a phone breaks after the brand name. The component still has a cropped
`fit="mark"` that nothing draws now. minty-web's copy (`CardBrandChip`) draws the same chip
in every place; change the two together.

## Accounting Setup — step 4, Xero optional

Figma `LGkVZqcyxSIh6pp5ihDjXw` node 348:1007 (the redesign), drawn here in the classic look
(owner, 2026-11-10: this branch). `StepAccountingSetup` holds the step's own screens and saves
every change as it is made through minty-onboarding-api's `/accounting` routes (`lib/accountingApi.ts`),
so Save & Next only moves on. The side menu shows where the screen is (no "Accounting setup · N of M"
line since 2026-11-18, owner).

- **4.1** _Use Minty independently_ or _Connect with Xero_ (`POST /accounting/mode`). Xero opens
  today's Connect to Xero screen (its Back returns to 4.1), and the wizard goes on as before. A
  return from Xero (`?xero=…`) opens step 4 on Connect to Xero. Drawn as Figma 348:1018: two
  picture cards (`.acs-mode-*`), each its own crop of `public/accounting/mode-art.jpg` (the
  design's sheet, placed as the design places it), the design's radios (`radio-on/off.svg`) at the
  foot; one column on phones, two from 768px; the footnote at 12px (the design's 11.5px is under
  the floor) and the body in Inter (the design's Plus Jakarta Sans is the wordmark's only). Like
  the Modules step it steps out of the page's 664px column, centred: 720px from an 840px window.
- **4.2** is drawn as Figma 348:1135: a tinted picture card per business type (`.acs-biz.is-<type>`;
  `public/accounting/business-<type>.png` and `glyph-<type>.svg` from the design, the project's
  `Icon.Arrow` / `Icon.CheckSm` in each card's colour), "None of these" as the dashed full-width
  card; one column up to 1024px (the picture narrows on phones), two 440px columns in a 904px
  column from there. It asks the business type (Restaurant & Food, Retail, Service, General, or
  _None of these_), required. Until 2026-11-18 it also asked the cash question (_We pay expenses
  from sales cash_, _We bank all sales_, _Not sure_); that is now the sales accounts screen's Sales -
  Cash tick (below), with the same effects: unticked, the company's Cash method is off
  (onboarding-api), daily closing needs four accounts (step 6 hides the Cash Sales field) and step 7
  (Contact Setup) asks for no Cash Sales contact. On the Minty path the answer also adds that
  business type's sales accounts (the accounting team's set; changing the answer swaps them).
- **The sales accounts screen (owner, 2026-11-17; Figma 464:73 row 1).** After 4.2 on the Minty path:
  _Your sales accounts_, three tick cards - Sales - Cash, Sales - Electronic Payment, Sales - Delivery
  (`SalesAccountsScreen`), under "How do your customers pay you? ..." - each with a plain line, no brand
  names (2026-11-26: "Cash received at the counter.", "Card, e-wallet and bank transfer payments.",
  "Orders from delivery apps.") and saying which part of the daily report it brings ("Shows on your
  daily report: Cash Sales" / "Not on your daily report"). Screen only: no account is made or
  removed (the business type's set still brings the sales accounts). Cash is 4.2's cash answer
  (unticking it is "We bank all sales"); Electronic Payment and Delivery are
  `entities.sells_electronic` / `sells_delivery` (minty-db v0.11), NULL until chosen, when the
  business type picks (`salesTicksOf` in `lib/wizardSteps.ts`): Restaurant & Food takes both, a
  retail shop, a service or a general business Electronic only, "None of these" neither - Sales -
  Cash alone (owner, 2026-11-18); a company from before the questions keeps both.
- **4.2 asks only the business type (owner, 2026-11-18).** The cash question ("How do you handle
  cash from sales?") is gone: the sales accounts screen's Sales - Cash tick is it. 4.2's save sends
  the company's cash answer as it stands (ticked for a new company), so the API picks the sheet's set
  as before; unticking Sales - Cash on the next screen is "We bank all sales". None ticked is refused
  ("No sales account is ticked yet. Tick at least one to continue.", focus to the list).
  `POST /accounting/sales-accounts`; an unticked list's methods go. A company that has answered
  4.2 but not this screen resumes on it.
- **No 4.3 or 4.5 (owner, 2026-11-11).** The Minty path is four screens since 2026-11-17 - 4.1,
  4.2, the sales accounts, 4.4; the Xero path 4.1, X1, X3. 4.3's row design (Figma 348:1209: `.acs-coa-row`, the bag or
  scooter glyph, the dashed add row) moved to step 5's sales-method lists. 4.4 uses Petty Cash
  Settings' `.autofill-btn` with the design's logo (`public/accounting/autofill-logo.png`).
- **4.4** the expense accounts. **Every change waits for Save & Next (2026-11-20, plan item 4),**
  as X3's ticks do: ticks, unticks, _Edit_, _Add another_, _Remove_, _Auto Fill_ and _Revert_ all
  change only the screen's held list (`Held` in `AccountsScreen`), and Save & Next sends it in ONE
  `PUT /accounting/accounts` (`accountingApi.saveAccounts`: the ticked suggestions' template ids
  and the company's own accounts to keep, with their id, or add, without). Nothing changed: Save &
  Next moves on with no call. Save & Exit saves the held list first - and on every other step-4
  screen too (2026-11-20): 4.1's way of working, 4.2's business type, the sales accounts' ticks and
  the Xero expense accounts' ticks are saved before leaving (nothing is sent while the screen has no
  valid answer, as Save & Next refuses it); it used to save only the place to come back to. A refusal (a used account left
  out - "… is already used in your records or Petty Cash Settings, so it can't be deleted." - or a
  code or name taken) writes nothing; the sentence shows above Save & Next and the list stays as
  held. The held list is a step-local input of the open-step draft (`acs.held.<kind>`), so a
  reload offers it back. _Auto Fill_ only reads the template's suggestions (`GET
/accounting/autofill`, which writes nothing) and ticks the usual ones (the General set for
  _None of these_), the rest unticked beside them; _Revert_ takes the list's Auto Fill rows off (the
  ones nothing uses yet, `auto_filled`) and the ticked suggestions. The list counts as filled only
  while it has a row Revert would take out, ticked suggestions or shown suggestions, so a kept row
  such as Cash Over / Short (daily closing uses it) leaves the button on _Auto Fill_. Unticking a
  company account leaves it on screen, unticked; _Remove_ on one asks first (ConfirmDialog
  "Remove <name>?" - "<name> comes off your expense categories when you press Save & Next.",
  _Remove_ / _Go back_) and takes it off the screen; a row added on this screen goes without
  asking. _Edit_ and _Add another_ open the account form (code pre-filled with the next free code
  for the type, type, name; checked as you type, the empty ones on a refused save, and a code or
  name another row on the list has is refused on the form with the API's sentence; the API checks
  again on save). An edit keeps the account's description. Expense accounts sit under _Cost of what
  you sell_ (Direct costs) and _Running the business_, from their type.
- A company keeping its books in Minty passes step 4 once it has answered 4.2
  (`isStepComplete`, `mintyOnItsOwn`), skips steps 6 and 7, and is never sent back to Xero by
  the needs-Xero prompt. The answers come back with `/state` (`accounting`).
- **Not yet:** the template rows (the accounting team's 8 sheets), so Auto Fill says there are
  no suggestions.
- **4.4** is drawn as Figma 348:1267: a card per expense account in its group (`.acs-exp`; ticked =
  teal edge and filled box, a suggestion grey), the sheet's 18 expense accounts (5000-6018) each with its own icon from the design by code (`SHEET_ICONS`, `public/accounting/expense/*.png`, owner 2026-11-18), any other account's icon chosen by name from the design's ten
  (`public/accounting/exp-*.svg`; no match: cost of sales "products", else "other"), the menu
  (Edit, Remove) in the card's corner - the frame draws none, but accounts must stay editable -
  and the dashed "Add another category" card; two cards a row on phones, 214px cards from 768px.
- **Changing 4.1's answer is free during onboarding (owner, 2026-11-11):** choosing _Connect with Xero_
  after the Minty path takes away the accounts Minty set up (the API does it, no confirmation) and
  goes on to X1; only a company whose reports or bills already use them is refused, with the API's
  sentence.
- **The Xero path (2026-11-10, Figma 348:1874 / 1949; X2 and X4 removed 2026-11-11):** 4.1
  _Connect with Xero_ -> X1 (Connect to Xero) -> X3 the Xero expense accounts Minty uses
  (`XeroAccountsScreen`: a searchable tick list of the synced chart, `from_xero` rows, ticked =
  `used`, 10 rows then "Show more accounts", the "Missing an account?" notice, Refresh from Xero
  `POST /accounting/xero-refresh`); Save & Next posts `/accounting/xero-accounts` (none ticked is
  refused with its sentence). X1's Save & Next goes on to X3 once connected. Petty Cash Settings
  then mirrors the Minty path: 5 Sales, 6 Account Code (the five daily-closing accounts from
  Xero only - X3 chose the expense accounts, so the codes list is hidden and the save posts the
  mapping alone; Cash Sales only with cash sales), 7 Contact Setup.

**The steps after step 4 follow it (owner, 2026-11-11).** Petty Cash Settings' side menu lists
`pettyIds(mode)`: step 5 alone for Minty on its own, "1 Sales, 2 Account Code, 3 Contact Setup"
on Xero and for a company with no mode (2026-11-11); step 7 is "Contact Setup". The account-codes read
(steps 5-7) never runs for Minty on its own (it is Xero's, and answered 409 with an error toast).
Step 5's Auto Fill no longer touches the old expense ticks; step 7 sends no cash-sale contact for
a company banking all its sales (the API clears it anyway). Step 8 lists step 4's expense
accounts (minty-onboarding-api's `/bill-codes`: 4.4's for Minty on its own, pre-ticked from the
Payment Request flags; X3's ticks on Xero) and takes the answer whether or not Xero is connected;
an empty list says "Add an expense account in Accounting Setup first." with a Go to Accounting
Setup link (`AccountCodesCard`'s `empty`), never "Connect to Xero". Finalize's gaps for a Xero
company's daily-closing accounts point to step 6 (2026-11-11). Tests: `components/__tests__/StepBillsFromAccounting.test.tsx`,
`lib/__tests__/wizardSteps.test.ts`.

**Accounting Setup's side menu (owner, 2026-11-18).** Step 4 lists its screens in the same side
menu as Petty Cash Settings (`.pc-side-menu.is-wide`): Minty - How Minty works, Business type, Sales
accounts, Expense accounts; Xero - How Minty works, Connect to Xero, Expense accounts. The screen shown
is marked, and any screen already reached is a click away, forward too after going back (those
between ticked, the furthest one with its number); those never reached are disabled. Petty Cash
Settings' menu goes forward the same way, up to `maxReached`. Both are drawn as Figma 348:1006
section C has them: a plain numbered list, no card - finished = a teal circle with a check, current =
a teal circle with its number and a bold label, ahead = an outlined circle. Its column is
904px, so the menu sits further out and hides below 1400px (Petty Cash's below 1180px). Tests:
`components/__tests__/AccountingSetup.test.tsx` (Accounting Setup's side menu).

**Page titles (owner, 2026-11-18).** Every step's title is the one `.page-head`: centred, 30px, its
line under it 16px - no inline sizes or left-aligned settings pages, and no small "Petty Cash
Settings · Sales methods" line. Petty Cash's and Payment Request's account-code pages have no page
title, only their card's ("Petty Cash Account Code", "Payment Account Code"). Above each card an
info box (2026-11-26, `CodesNote`) says the list comes from Accounting Setup and is what staff can
choose when they add a petty cash expense / a payment request; with both modules chosen it adds that
the other module keeps its own list (dropped when only one is chosen). The free-trial
page (`.module-head`, 25px) is the one exception, sized to its frame.

**Petty Cash Settings' pages (owner, 2026-11-18).** Step 5 is two pages, each its own sub-step in
the side menu: **Sales** (the sales methods below; its Save & Next saves them and opens the next page)
and **Opening Balance** (the start date and the balance; Back returns to Sales, Save & Next saves both
and moves on). The wizard holds which page shows (`pettySub`), landing on Opening Balance when coming
back from a later step; a refused jump past step 5 for a missing balance opens it. A company keeping
its books in Minty then has **Account Code** (step 6, `StepPettyCodes`): "Petty Cash Settings" -
"Choose which of your expense accounts appear in Petty Cash." - one **Petty Cash Account Code** card
(the same search / Select all / ticks as Payment Request Settings) over step 4's expense accounts,
ticked as the sheet set them (onboarding-api's `GET`/`POST /petty-cash-codes`), at least one ticked.
Its side menu reads Sales · Opening Balance · Account Code (`pettyIds("minty")` = 5, 6). A Xero
company chose its Petty Cash codes in X3, so its step 6 stays the daily-closing mapping. Tests:
`components/__tests__/StepSalesSetting.test.tsx` (Sales, then Opening Balance),
`components/__tests__/StepPettyCodes.test.tsx`, `lib/__tests__/wizardSteps.test.ts`.

**Step 5's sales methods follow the business type (owner, 2026-11-11) and the sales accounts
(owner, 2026-11-17; Figma 464:73 row 2).** "Type of sales method of your company", with Auto Fill
(and its hint: "Filled for <business>. Revert empties the list(s) again."): free lists (no
account link), one card per ticked sales account (`MethodList` in
`components/steps/pettyCashFields.tsx`: the card's badge, "For your Sales - … account", the methods
as chips in a list labelled "<title> methods" - x removes one, drag a chip or press the arrow keys
on it to reorder - and an always-there add field with "+ Add"; a name already in the list is
refused as you type). An unticked account's list is hidden and posted empty; Cash is a card with
nothing to add (hidden when Cash is unticked); a plain info note ends the lists. With only Cash
ticked there is no list and no Auto Fill. Restaurant & Food and a company with no business type:
**Electronic** and **Delivery** (Auto Fill: the old defaults). A retail shop, a service or a general business
(`isNonCash` in `lib/wizardSteps.ts`; the API's `groups` says the same): one **Non-cash** list (titled **Electronic**, after its sales account, since 2026-11-17 - owner: Cash, Electronic and Delivery)
(Auto Fill: Bank Transfer first - owner, 2026-11-17 - then Visa, Mastercard, UnionPay, Amex,
Alipay, WeChat Pay, Octopus, FPS), posted as
`electronic` with `delivery: []`. Petty Cash's daily closing, reports and Settings group them the
same way. Tests: `components/__tests__/AccountingSetup.test.tsx`, `lib/__tests__/wizardSteps.test.ts`,
`components/__tests__/StepSalesSetting.test.tsx` (Auto Fill's lists per business type; the lists per
tick), `components/__tests__/MethodList.test.tsx`. A retail shop that ticks Delivery gets the
Delivery list beside its Non-cash list.

## Saving and resuming

- Every advance and _Save & Exit_ post `saved_step` (`POST /saved-step`), so a resume
  lands where the person left off; the app also mirrors state and the furthest step
  reached into `sessionStorage`.
- On launch with an `entity_id` (or after a reload - the tab keeps its company in
  `sessionStorage`, `e2e/resume.spec.ts` "a plain reload…") the app reads `GET /state` and
  **trusts the database**: the saved step is where it lands; the backend's
  `current_step` / `max_reached` only raise the ceiling of unlocked steps — the backend
  derives its number from a different ordering (modules → Xero → petty cash → bills)
  and using it as the landing step once jumped people straight to _Connect to
  Accounting_. Never make the two orderings one.
- `fresh=1` starts a brand-new company even when an unfinished one exists.
- **What is typed on the open step is an auto-saved draft (2026-11-20)** - see below. The
  `minty_onboarding_session` blob is unchanged: it stays the `/state`-failure fallback and the
  Xero round-trip's stash, and a plain reload still ignores it when `/state` answers.

### Auto-saved drafts (`@minty/shared/drafts`, the owner's decisions doc L1)

Owner's choices: kept **in this browser only**, **2 seconds** after the last change, and **asked
first**. The draft never writes the company - only the step's own Save & Next (or its own save
buttons) do.

- **One draft per step:** form `onb.step`, record = the open step (1-8; All Set has none),
  shape 1, keyed by the person and the company (`draftScopeFromToken(token)`; before step 1 is
  saved there is no company, and the key says `-`). Value `{ state, locals }`
  (`lib/stepDraft.ts`): `state` is the part of the wizard state the step edits (`draftSlice`:
  step 1's fields, step 2's modules, step 5's methods and opening balance, step 6's mapping and
  ticks, step 7's contacts, step 8's ticks); steps 3 and 4 save each change as it is made, so
  they keep only their step-local inputs. `locals` are inputs a step holds in its own React
  state until its save, registered with `useStepDraftField(name, value, set)` - the invite form,
  step 4's picks (4.1's mode, 4.2's business type, the sales-account ticks, X3's ticks), its
  account form and which form is open, and a sales method typed but not added - kept only while
  they differ from what they opened with.
- **`basedOn`** is `fingerprint` of the step's values as the server last gave or took them
  (`serverSlices` in `OnboardingApp`): from `GET /state` on resume (nothing saved before a
  company exists), from steps 6-8's own reads, and from every successful save. Values are
  compared as the server holds them (`normalizeSlice`: the phone compact, names and emails
  trimmed, modules in one order, the balance as a number, step 5's date only beside a balance -
  it is filled for you and saved only with one). A draft taken against other values is
  **stale**: dropped silently, never put back.
- **Ready** once the resume has settled (or the no-company local restore has run) and, on steps
  6-8, once the step's own read is in.
- **Put back at once, no notice** (the user, 2026-11-24; `DraftRestore` in
  `components/StepDraft.tsx`): when the step opens, its values and its step-local inputs are
  restored (an input not on screen yet, such as step 4's account form, gets its value when it
  opens); a stale draft is removed silently. Nothing about a draft is drawn.
- **Leaving a step** (Back, the stepper) unmounts its binding, which writes what was typed in the
  last 2 seconds under that step's key; a hidden page (`pagehide`) does the same.
- **Removed** when the step completes (Save & Next calls `next`, which clears it; Save & Exit
  clears it when its save succeeded), on step 1's **Cancel without saving** (it drops step 1's
  draft, then leaves for the company list; the footer's third action, "Back to Entity List"
  until 2026-11-26), at finish (every step's, on a successful finalize), when
  stale, after 7 days, and on an explicit sign-out (`sidebarHost.logOut` awaits
  `clearDraftsForUser`, settled within 500 ms, before it forgets the token). The 60-minute
  expiry and the 401 relaunch (`lib/onboardingFetch.ts`) keep them - surviving those is what
  they are for.
- Card details (Stripe's fields) are never kept.
- **Left unfinished, it is mailed about (2026-10-01).** minty-subscription-api's daily pass sends
  whoever started a company still in setup a "Finish setting up {Company} on Minty" email 1, 3
  and 7 days after its last save, listing the steps from `saved_step` on; its button opens
  Flask's `/entity/{id}`, which brings them back here at that step (minty-subscription-api
  `docs/features/subscriptions-api.md`, "The setup reminder"). Renumbering the steps means
  updating `notify.ONBOARDING_STEPS` there too.

## All Set finalizes on arrival

Reaching step 9 runs `completeOnboarding()`: it submits the opening balance and posts
`/finalize`, which flips the company from `onboarding` to `connected`/`disconnected` and
starts the trials (minty-onboarding-api → minty-subscription-api `trials/start`, 2026-10-06);
the screen itself commits nothing, and _Go to entity list_ leaves.

**The trials have no subscriber** (the user, 2026-10-08). Starting a trial is free and
commits nobody, so finalize establishes no payer for the company. The wizard's one door onto
the billing relationship is **step 2's billing sheet** (`authorizeBilling`, `lib/billing.ts`
-> `POST /billing/authorize`), and it is skippable: a person who skips it finishes with
card-free trials nobody is liable for. Those trials expire at term end rather than
converting, every admin of the company may act on its subscription, and any of them can
confirm billing later with _Activate Subscription_ on minty-web's module settings page.
Nothing in the wizard changes - this is what _Add Payment Now_ on All Set is for.

Complete the sheet and the company DOES get its subscriber: the confirm is made on step 2,
before the module rows exist, so the engine lands the stamp at finalize
(`store.confirmed_payer_for_entity`, asked by company rather than by whoever finished - so
a wizard completed by a different member still credits the person who agreed to pay).

**A failed finalize is shown, not hidden (2026-10-06).** `completeOnboarding` checks
`res.ok`; a failed finalize (or a network error) resolves `{ok: false, error}`, and the
saved session (`localStorage`/`sessionStorage`) is cleared only after a successful one, so a
reload after a failure lands back on All Set and finishes. On failure `StepAllSet` says
"Your N-day <module> trial hasn't started yet.", shows the server's sentence inline
(`role="alert"`, `.billing-error`; no toast), and its primary button is _Try again_ (it
re-runs the commit and replaces `commit.current`, so the billing sheet's `onDone` still
awaits it). _Add Payment Now_ and the payment nudge stay hidden until the trial exists;
_Go to entity list_ stays available (disabled while a retry is in flight).

**Never navigate a test straight to step 9**
(`e2e/README.md`, `land()` in `e2e/onboardingApi.ts` refuses it); `walk.spec.ts` reaches it
by clicking _Complete_ on step 8 against the disposable entity.

## The side menu (the header's ≡, 2026-11-03)

The packaged sidebar, `@minty/shared/sidebar`, in the classic look every `development` branch
draws: the same menu as minty-web, minty-payment-request-web and minty-petty-cash-web. It replaced
this app's own drawer (`components/NavMenu.tsx`, a copy of the payments app's old one).
`components/ui/` holds this app's part:

- `sidebarHost.ts` is the host the package reads;
- `NavMenu.tsx` and `Sidebar.tsx` are shims that register the host first;
- `SidebarShell.tsx` is the provider, mounted in `app/layout.tsx`.

The menu's files are copied into `public/menu/`; `app/__tests__/packagedAssets.test.ts` holds
that contract.

- **Where it gets its answers.** The token, the company and the person are React state in
  `OnboardingApp`, not a cookie, so the wizard hands them to the host (`setSidebarSession`)
  whenever they change. The person is the signed-in user, never the company.
- **Modules and Settings wait for All Set.** The host reports no company until step 9. The
  package draws the module sections and Settings only inside a company, so through onboarding the
  menu shows only:
  - the person, Select Entity and Manage subscriptions;
  - Logout.
    On All Set the chosen modules appear (the wizard's `modules`, not the token's claims). The
    module links enter through Flask's `/entity/<id>/enter` with the wizard's token. Settings goes
    to minty-web's module settings for the new company.
- **My Profile opens in the sidebar only** (owner, 2026-11-03): the header's initials (the
  shared `ViewerBadge`) and the menu's name both switch the sidebar to My Profile, the shared panel
  (`components/ui/SidebarShell.tsx`). There is no profile page here or in minty-web. Its reads go
  through minty-onboarding-api's proxies, `/api/onboarding/me/profile` (GET and PATCH, to
  Flask's `/api/me/profile`) and `/api/onboarding/me/subscriptions` (to subscription-api's
  `/api/me/subscriptions`), in `lib/profileApi.ts`, because neither backend's CORS admits this
  origin. The panel's files are copied into `public/profile/`.
- **Logout** goes to Flask's `/logout`, as the old drawer's did, which ends the session
  everywhere - by a top-level form POST (`postNavigate` in `components/ui/sidebarHost.ts`):
  `/logout` answers a GET with 405 and checks the POST's `Origin`, which a `strict-origin`
  referrer meta keeps (this app's `Referrer-Policy: same-origin` would send `null`).

## Copy and errors

`lib/errorCopy.ts` and `docs/ERROR_COPY.md`: the backends answer `{"error": "…"}` in the
words the wizard shows; the app never invents a message for a status it does not know.

## Tests

Unit (`npm test`): `lib/__tests__/wizardSteps.test.ts` (with the Minty-on-its-own rules), `components/__tests__/AccountingSetup.test.tsx` (step 4's screens, fetch mocked; 4.4's held list: no write until Save & Next, one PUT, a refusal keeps it, Save & Exit, the draft restores it), `validation.test.ts`, `invites.test.ts`,
`components/__tests__/Stepper.test.tsx`, `HeaderMenu.test.tsx`, `components/ui/__tests__/sidebarHost.test.ts` and `lib/__tests__/profileApi.test.ts` (the side menu and My Profile), `StepChrome.test.tsx`, `StepInvite.test.tsx` (the arrival prompt's Ok / Skip; the cancel question), `MintySelect.test.tsx` (the type-to-add hint), `pettyCashFields.test.tsx`,
`MethodList.test.tsx`, `CardBrand.test.tsx` (the two fits and their crops), `components/__tests__/StepDraft.test.tsx` and
`lib/__tests__/stepDraft.test.ts` (the auto-saved drafts: kept after 2 s, a reload puts them back
at once with the invite form, a stale one dropped, Save & Next clears), the sign-out and 401 cases in
`sidebarHost.test.ts` and `onboardingFetch.test.ts`. Browser (`npm run test:e2e`): `e2e/drafts.spec.ts` (the draft put
back with no notice at 360 and 1440px - no credentials and no backend: the API is answered by
`page.route`), `e2e/held-changes.spec.ts` (4.4's held list and its one PUT, and step 3's cancel
question, at 360 and 1440px, stubbed the same way), `e2e/stack.spec.ts` (the two backends
answer), `resume.spec.ts` (the database decides the landing step; `saved_step` and
`current_step` may disagree; an out-of-range step is refused), `xero.spec.ts`,
`accounting.spec.ts` (step 4's Minty path at 360px against the real service; it puts the entity back on Xero, which `land()` chooses for any step from 4 on), `walk.spec.ts` (the whole wizard to All Set, Xero faked; the first finalize is forced to a
502, the failure UI asserted, then _Try again_ runs the real one) — 23 on 2026-09-18 against the
deployed hosts; 23 passed on 2026-10-06.

## Required fields

**A mandatory field shows a red `*` from the moment its step opens**, and its control turns red
only once Next has actually been refused (every gated step already keeps a `showErrors` flag
for that, so no new state was needed).

- The mark is `.req` in `app/globals.css`, commented _"shared by every form"_ since it was
  added. As of 2026-10-09 it finally is: it had been applied to 5 fields out of ~19.
- It is **`aria-hidden`**, because an asterisk read aloud is "star". Requiredness is announced
  on the CONTROL instead - `aria-required` on the inputs, and `MintySelect` takes `required`
  and `invalid` props for the same reason. Both halves are needed.
- Steps 6 and 7 draw their fields through `PCSection` (`components/steps/pettyCashFields.tsx`),
  so the mark is rendered **once** there rather than nine times at the call sites. `PCField`'s
  `required` defaults ON, because everything PCSection draws today is a hard gate - an optional
  field is the one that has to say so.
- Marked: Entity Name, Country and Currency (step 1), the "Add New Method" name (step 5), the six account-code fields
  (step 6), the three contacts (step 7), Payment Account Code (step 8), and the billing sheet's
  Email and Billing company. Phone Number and Business Email stay unmarked - they are genuinely
  optional, and already labelled so. (Country and Currency were unmarked while they came
  pre-filled; they start empty and are required since 2026-10-19.)

### Step 1's required fields (2026-10-19)

Entity Name, Country and Currency are required (`isStepComplete(1)` needs all three, so a resume
never counts a company without a country or currency as past step 1; the onboarding API refuses
one too). Save & Next is **not** disabled for them - only while saving, while a typed phone or
email is malformed, or while the name is over 100 characters. Pressing it with one empty is a
refused submit (`showErrors`):

- each empty field turns red and says so, in Part 11 wording - _The company name is still empty.
  Add the company name to continue._, _The country is still empty. Choose the company's country
  to continue._, _The currency is still empty. Choose the company's currency to continue._ -
  and its message clears the moment the field has a value;
- one problem moves focus to that field; two or more show `components/steps/ErrorSummary.tsx`
  (`.error-summary`, a copy of minty-payment-request-web's Part 15.3 summary in this app's
  tokens) at the top of the form, which takes focus and links to each field;
- each label carries the red `*` and a screen-reader-only _(required)_ (`.sr-only`), the control
  `aria-required` (`MintySelect` now takes `id` and `ariaDescribedBy` for the label and message);
- Save & Exit is never blocked by them (its save is best-effort; an entity the API refuses is
  simply not saved).

Two live checks hold Save & Next, each with its reason beside the button (`.step-reminder`,
`role="note"`), as a gated button must (2026-10-26):

- **Name over 100 characters** (`NAME_MAX`, the API's limit on create and rename): _Keep the
  company name to 100 characters or fewer._ shows under the field as it is typed and clears at
  100; the reason reads _Shorten the company name to continue._ There is no `maxLength`, so a
  paste is not silently cut.
- **A badly shaped business email** never disables Save & Next (owner, 2026-10-26): a
  half-typed address only means "not finished yet", so _That email address doesn't look
  right._ waits until the field is left (blur, like the phone's message) or Save & Next is
  pressed. Pressing it then is a refused submit: the field turns red (`aria-invalid`) and
  takes focus, nothing is saved, and with other problems the email joins the error summary.
  From then on the message follows the typing and clears once the address is valid; the
  reason beside the button reads _Check the business email to continue._ An empty email is
  optional and never warns.

Tests: `components/__tests__/StepCreateEntity.test.tsx`, `lib/__tests__/wizardSteps.test.ts`,
and `e2e/phone.spec.ts`'s new-company case.

### The dropdowns could not turn red at all

`MintySelect` is a `<div>`, so `.pc-field.field-error` - which only targets
`input/select/textarea` - never reached it. **Nine** mandatory fields in steps 6 and 7 printed
their message while the dropdown stayed neutral. `app/globals.css` now has a rule for
`.mselect.is-invalid .mselect-trigger` (and the `.field-error` descendant forms), so they
redden like everything else.

Still open: `.pc-card.is-error` glows `var(--accent)` - **mint**, not `var(--danger)` - so an
errored card looks highlighted rather than wrong. Changing it is a visual decision, not part of
the marker work.

`.billing-label .req` mirrors minty-web's `SHEET_REQUIRED`; the note at the top of
`minty-web/components/ui/sheetClasses.ts` applies - the same dialog in two apps must be the
same dialog, so change both or neither.

## The Minty cat (`@minty/shared/contact`, v0.14)

The cat at the bottom right of the wizard (owner, 2026-11-05), mounted in
`components/ui/SidebarShell.tsx`. Its "Talk to Minty" chat posts through minty-onboarding-api's
`POST /api/onboarding/me/contact` proxy (`lib/profileApi.ts` `sendContact`; Flask's CORS does not
admit this origin) to Flask's `/api/me/contact`, which mails `CONTACT_EMAIL` with the person as
Reply-To. Before "All Set" no company is sent (the host names none). Tested in
`components/ui/__tests__/ContactLauncher.test.tsx`; `/contact/minty-cat.webp` is in `public/`.
