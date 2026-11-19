# Features — the onboarding wizard

`minty-onboarding-web` is the Next.js wizard a person walks to create a company in Minty: nine
steps from the company name to a live company, entered with a token Minty minted. It
talks to two backends — `minty-onboarding-api` for `/api/onboarding/*` and Minty for
sign-in, legal text and the Xero connection — and never verifies anything itself.

| Feature                                                                                                                                | Document                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Entering with Minty's token; `/auth*` forwarding to minty-web's sign-in (phase 2); which backend answers what                          | [authentication.md](authentication.md) — the system-wide picture is `minty-accounts-api/docs/features/authentication.md` |
| The nine steps, saving and resuming, All Set finalizing on arrival                                                                     | [wizard.md](wizard.md)                                                                                                   |
| Step 4 — connecting to Xero, the three returns, disconnecting, the network-layer fake in tests                                         | [xero-step.md](xero-step.md)                                                                                             |
| Toasts - `components/Toast.tsx`, minty-web's card, one at a time                                                                       | `Minty/docs/features/toasts.md` - the system-wide rule and the look, value for value                                     |
| User-facing error copy                                                                                                                 | [../ERROR_COPY.md](../ERROR_COPY.md)                                                                                     |
| Manual QA checklist for the wizard, grounded in the docs above and the e2e suite's traps, plus the `pettycashv3` rows each step writes | [qa-checklist.md](qa-checklist.md)                                                                                       |

Link previews (owner, 2026-10-23): a link to any page of this app, pasted into a chat app, previews with one card - the Minty cat mark (`Minty/static/img/new_logo.png`, the flat drawing) centred on a white 1200x630 PNG. It is `app/opengraph-image.png` and `app/twitter-image.png` (alt text "Minty" in the `.alt.txt` beside each), which Next attaches to every route that sets no image of its own, plus `openGraph`/`twitter` in `app/layout.tsx`. The same file sits in minty-web, minty-petty-cash-web, minty-payment-request-web and minty-onboarding-web, and `app/__tests__/linkPreview.test.ts` pins its size and sha256 in each: a new card goes into all four, with the new hash. There is no `metadataBase`; on Vercel Next makes the image URL absolute from the deployment's own address. Previews never name a company or show report data.

Colours: @minty/shared Part 13 roles only (owner 2026-11-18). Every colour in `app/globals.css`
is a `--color-*` role from `@minty/shared/tokens.css` (the local `--ink`, `--line`, `--muted`,
`--danger`, `--accent`... in `:root` are aliases of roles, never a hex): Minty Action `#3CBCC3`
(hover `#35B2B9`, pressed `#2FA4AB`) for buttons and every checked box and radio, white mark;
`--color-border-input` for inputs and unticked boxes, `--color-border-focus` for focus;
`--color-text-link` for teal text; the status pairs for pills, notices and errors
(`--color-status-danger-ink` text, `--color-action-danger` lines); `--color-overlay-scrim` behind
every dialog. Components use the role utilities (`text-text-primary`, `bg-surface-raised`...).
`app/__tests__/noRawColours.test.ts` fails on a hex, `rgb()` or Tailwind palette class in the
TS/TSX source, and on the retired values in `globals.css`. Allowed literals: Stripe's fields
(`STRIPE_ROLE_COLOURS` in `BillingSheet.tsx`, each named by its role - its iframe cannot read CSS
variables), `CardBrand.tsx`'s network colours and the confetti. Kept on purpose in `globals.css`:
the decorative icon tints of Accounting Setup and Step 5 (`.acs-*-icon`, `.acs-sa-badge`,
`.pc-method-badge`, the `--biz-*` business-type tints), and the orange dialog button and saved-card
text (`#EA9713`, the owner picks its replacement).

Email fields take English only (2026-10-01): the sign-in email, the business email (step 1),
the invite (step 8) and the billing email spread `useEmailInput` (`lib/emailInput.ts`; the
rules, `EMAIL_RE`, `sanitizeEmailInput` and `EMAIL_ASCII_HINT`, are in `lib/validation.ts`).
The inputs are `type="text" inputMode="email"`, because the browser's `type="email"` let Hangul
through after the "@". Anything outside printable ASCII is dropped once an IME composition
ends, and the field says why. minty-onboarding-api and Flask refuse it again with a 400.

Fonts (2026-10-12): **Inter** for the body, **Plus Jakarta Sans 700 for the "Minty" wordmark only**
(`.topbar .brand` in `app/globals.css`, drawn by `components/OnboardingApp.tsx`) — the same three
values as minty-web's `components/ui/Wordmark.tsx`, so change the two together. Both faces are
self-hosted through `next/font` in `app/layout.tsx`; this replaced a Google Fonts `<link>`, and the
point of the move is the metric-matched fallback `next/font` generates (`src: local(Arial)` plus
`size-adjust`), which stops text reflowing when the webfont lands. The `@theme` font block in
`app/globals.css` is a **copy of minty-web's, byte for byte** — its
`docs/features/README.md` carries the reasoning — so change them together until `@minty/shared`
takes the tokens at Part 3 step 4. Two tokens only, `--font-sans` and `--font-brand`: no
`--font-mono` (nothing uses the mono utility, and Tailwind's own default keeps it monospace) and no
emoji tail. This app loads **no icon font** (2026-11-03): the `material-symbols` package's one user, the old
side menu, became the shared sidebar, which draws SVGs ([wizard.md](wizard.md)). The one
`fonts.googleapis.com` URL left is Stripe's `cssSrc` in `components/BillingSheet.tsx`, fetched
inside Stripe's cross-origin iframe, which cannot see our `@font-face`. Do not write a bare
Tailwind class name in prose here: v4's source detection scans Markdown and CSS too, so naming a
class is enough to generate it.

Running it and the two variables (`ACCOUNTS_API_URL`, `ONBOARDING_API_URL`): the repo `README.md` (port 3030). Tests:
`npm test` (Vitest) and `npm run test:e2e` (Playwright against a running stack —
`e2e/README.md`; 23 on 2026-09-18 against the deployed hosts, Xero faked at the browser).
The cleanse log is in `../code_cleanse/`.

## Sign-in: 30 minutes, renewed; signed out after 60 idle (owner, 2026-11-19)

Every call to the onboarding API goes through `lib/onboardingFetch.ts`: a 401 on a call that carried the
person's token relaunches the wizard through accounts-api (`signInAgainUrl`), which hands over a fresh
30-minute token while the Minty sign-in lives (the quiet renewal) and asks the person to sign in when it
has ended (60 minutes without activity, or signed out). A token handed over in the last minute that is
still refused comes back as a refusal, so nothing loops. Tests: `lib/__tests__/onboardingFetch.test.ts`.

**"Your session has expired" (owner, 2026-11-19).** A 401 whose body carries `"reason": "session_expired"` - every API adds it when the Minty sign-in behind the token has ENDED (signed out, or 60 minutes without activity; minty-accounts-api `docs/features/authentication.md` 3.3) - is not renewed quietly: `lib/sessionExpired.ts` reads it (`isSessionExpired(body)`) and calls ONE local `showSessionExpired(loginUrl)`, once however many calls fail together, and the quiet hand-off then stays put. Today that call only goes to the sign-in page; the pop-up ("Your session has expired", one OK) is to come from `@minty/shared` as one component for every app and will sit behind the same call. `loginUrl` = accounts-api's front door `/?next=` the wizard's relaunch (`/entity/<id>/modules`;
`onboardingFetch.sessionExpiredLoginUrl`), fresh token or not - the reason is the server's word.
