/**
 * Every call to the onboarding API goes through here (the owner's decisions doc S1, 2026-11-19: in
 * every app, a 30-minute sign-in renewed quietly, and signed out after 60 minutes without activity).
 *
 * A 401 on a call that carried the person's token means the token ran out (30 minutes) or the Minty
 * sign-in behind it ended (60 minutes idle, or signed out): the wizard is relaunched through
 * accounts-api (`signInAgainUrl`), which hands over a fresh token while the sign-in lives - the
 * quiet renewal - and asks the person to sign in first when it has ended. A token handed over in
 * the last minute that is still refused is a refusal, not an expiry: the answer comes back as it
 * is, so a bad token can never loop.
 *
 * A 401 carrying `reason: "session_expired"` (the sign-in behind the token has ENDED, 2026-11-19)
 * is the server's word, fresh token or not: "Your session has expired" (lib/sessionExpired.ts),
 * then the hub's sign-in page through accounts-api's front door, with the wizard's relaunch as
 * `next` - instead of the quiet relaunch.
 */

import { FLASK_BASE } from "@/lib/flaskBase";
import { isSessionExpired, sessionExpiredShown, showSessionExpired } from "@/lib/sessionExpired";
import { readJwtClaims, readTabToken, signInAgainUrl, TAB_ENTITY_KEY } from "@/lib/wizardSession";

/** accounts-api's onboarding token life (hub/handoffs.py ONBOARDING_TOKEN_MINUTES). */
export const TOKEN_MINUTES = 30;

function carriesToken(init?: RequestInit): boolean {
  const headers = new Headers(init?.headers);
  return (headers.get("Authorization") || "").startsWith("Bearer ");
}

/** Handed over under a minute ago: a refusal of it is not an expiry. */
export function freshToken(token: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const claims = readJwtClaims(token);
  if (!claims || !claims.exp) return false;
  return claims.exp - nowSeconds > TOKEN_MINUTES * 60 - 60;
}

function tabEntityId(): string | null {
  try {
    return window.sessionStorage.getItem(TAB_ENTITY_KEY);
  } catch {
    return null;
  }
}

/** accounts-api's front door, which sends the person to the hub's sign-in page with `next` = the
 * wizard's relaunch for this tab's company (someone signed in again meanwhile goes straight on). */
export function sessionExpiredLoginUrl(): string {
  const back = new URL(signInAgainUrl(FLASK_BASE, tabEntityId()));
  return `${FLASK_BASE}/?${new URLSearchParams({ next: back.pathname + back.search }).toString()}`;
}

export async function onboardingFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status !== 401 || !carriesToken(init) || sessionExpiredShown()) return res;
  const body: unknown = await res
    .clone()
    .json()
    .catch(() => null);
  if (isSessionExpired(body)) showSessionExpired(sessionExpiredLoginUrl());
  else if (!freshToken(readTabToken()))
    window.location.href = signInAgainUrl(FLASK_BASE, tabEntityId());
  return res;
}
