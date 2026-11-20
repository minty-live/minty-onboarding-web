# Authentication — the onboarding app's half

The wizard is entered one way: Minty launches it with a Minty-minted JWT in the URL. Nothing
is verified here: every call carries the token to a backend that checks it
(`minty-onboarding-api/docs/features/authentication.md`). Signing in happens before, on
minty-web's `/login` (§2; the system-wide picture is `minty-accounts-api/docs/features/authentication.md`).

## 1. Launched from Minty

Minty's _Create company_ (and _resume_) send the browser to `/?code=<one-time code>
[&entity_id=…][&entity_name=…][&fresh=1]` (gap 4, 2026-11-09: a code, never the token; the
wizard swaps it at accounts-api's `POST /api/handoff/redeem` - once, 2 minutes, from this origin
only - before it starts, and a used or lapsed code says so with a Continue to the company list; a
`?token=` in the address is taken out and never used) for the 60-minute
`scope: "onboarding"` token
(`lib/wizardSession.ts::takeLaunchParams` reads `token`, `entity_id`, `entity_name`, `fresh`
and the Xero-return parameters ONCE and clears them from the address bar before anything else
runs - until 2026-10-05 a fresh launch left `?token=` there for the whole wizard, and Stripe's
`return_url` carried it). The token lives in memory and in this tab's `sessionStorage`
(`minty_onboarding_token`: survives a reload, not a new tab), beside the company it is
onboarding (`minty_onboarding_entity`, since 2026-10-27): a plain reload, whose address bar is
empty, uses the two to ask `GET /state` again (`wizardSession.tabResume`) instead of trusting
the cache, which had landed reloads on a blank step 1 or on another company's blob. A fresh "+"
launch and finishing clear it. The state and the step reached are cached in `localStorage`
WITHOUT the token. The **database is the source of truth** for
resume; the browser copy is a cache (`GET /api/onboarding/state`). `?profile_url=` is no longer
read: Flask never sent it, and the avatar followed it into `location.href`, so a `javascript:`
value ran on click. Stripe.js is imported from `@stripe/stripe-js/pure` and loads when the
billing sheet opens; its `return_url` is the page without a query.

**When the token is refused** (Phase 9, 2026-11-19): a 401 means the token ran out or the
Minty sign-in behind it ended (signed out, or 60 minutes without activity) - never Xero. The
`GET /state` re-check on every step from 4 sends the browser to
`wizardSession.signInAgainUrl` = accounts-api's `/entity/<id>/modules`, which relaunches the
wizard with a fresh token while the sign-in lives and asks the person to sign in first when it
does not. It used to open a "Your session has timed out ... your connection to Xero has
expired - Reconnect to Xero" prompt, which blamed Xero for a Minty sign-in. The other wizard
calls still show their own refusal sentence on a 401 (no automatic hand-off yet). Input on the
open step survives as an auto-saved draft in this browser (2026-11-20, [wizard.md](wizard.md),
"Auto-saved drafts"): the relaunch lands on the step and offers it back. Only an explicit
sign-out (the menu's Logout) removes the person's drafts, before the token is forgotten.

## 2. Sign-in left this app (phase 2, 2026-10-05)

Log in, sign up and invitations were this app's `/auth` and `/auth/confirm` until 2026-10-05.
They are minty-web's `/login` and `/login/confirm` now (`minty-web/features/auth`, its
`docs/features/authentication.md`): sign-in is person-level, and each app holds only its own
app - this one is the wizard. Nothing links to the old addresses any more; `next.config.ts`
`redirects()` sends a bookmark of them through Flask (`ACCOUNTS_API_URL`), which knows where sign-in
lives: `/auth?mode=signup` to Flask's `/register` (sign-up), any other `/auth` or `/auth/confirm` to
Flask's `/` (log in). Deleted with the pages:
`lib/authHandover.ts`, `lib/pendingInvite.ts`, `components/AuthTopbar.tsx`,
`components/TermsModal.tsx`.

## Branch preview sets (2026-10-13)

On `pr-<branch>-onboarding.dailyminty.com` this app has no sign-in page and no token of its own:
sign in on the set's `my` host, and Flask launches the wizard (and returns the Xero step) into the
same set - it remembers the set for 30 minutes from any same-site trip (minty-accounts-api
`docs/features/authentication.md` 6.1). No code here changed for it.

## Where the calls go

`lib/flaskBase.ts`: `ACCOUNTS_API_URL` — Minty; `lib/apiRoutes.ts`:
`ONBOARDING_API_URL` — minty-onboarding-api, for the paths listed in
`DJANGO_PATHS`; everything else (`/xero_connect`, `/logout`, `/entity`, and the old `/auth*`
forwards) is Minty. Both are inlined at build time (`next.config.ts` `env`) — an unset
value silently means `localhost` and breaks the OTP and Xero calls in a deployment.
`ACCOUNTS_API_URL` was named `PETTY_CASH_URL` until 2026-11-06.

## Tests

`e2e/resume.spec.ts` (a valid launch token opens the wizard, the token is stripped from
the address bar, a forged / expired / wrong-scope token is refused), `e2e/stack.spec.ts`;
the suite mints its own tokens with the shared `SECRET_KEY` (`e2e/README.md`).
Unit tests (`npm test`, Vitest): `lib/__tests__/apiRoutes.test.ts` (which service answers
each path), `invites.test.ts`, `validation.test.ts`, `wizardSteps.test.ts`, `date.test.ts`.
