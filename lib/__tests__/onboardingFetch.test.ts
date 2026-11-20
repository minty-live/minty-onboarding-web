import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FLASK_BASE } from "@/lib/flaskBase";
import { freshToken, onboardingFetch, TOKEN_MINUTES } from "@/lib/onboardingFetch";
import { _resetSessionExpiredForTests, isSessionExpired } from "@/lib/sessionExpired";
import { TAB_ENTITY_KEY, TAB_TOKEN_KEY } from "@/lib/wizardSession";

function tokenWith(exp: number): string {
  const body = btoa(JSON.stringify({ user_id: "u1", exp })).replace(/=+$/, "");
  return `h.${body}.s`;
}

const now = () => Math.floor(Date.now() / 1000);

describe("onboardingFetch (owner's decisions doc S1, 2026-11-19)", () => {
  const assign = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("location", {
      ...window.location,
      set href(v: string) {
        assign(v);
      },
    });
    window.sessionStorage.setItem(TAB_ENTITY_KEY, "e-1");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
    assign.mockReset();
  });

  it("a 401 on a call with the person's token relaunches the wizard through accounts-api", async () => {
    window.sessionStorage.setItem(TAB_TOKEN_KEY, tokenWith(now() - 10));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 })),
    );
    const res = await onboardingFetch("http://api/x", { headers: { Authorization: "Bearer t" } });
    expect(res.status).toBe(401);
    expect(assign).toHaveBeenCalledWith(expect.stringMatching(/\/entity\/e-1\/modules$/));
  });

  // The auto-saved drafts outlive an expiry - that is one of the things they exist for: only an
  // explicit sign-out removes them (components/ui/sidebarHost.ts).
  it("a 401 relaunch keeps the person's auto-saved drafts", async () => {
    window.sessionStorage.setItem(TAB_TOKEN_KEY, tokenWith(now() - 10));
    const draft = "minty:draft:1:u1:e-1:onb.step:3";
    window.localStorage.setItem(draft, "{}");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 })),
    );
    await onboardingFetch("http://api/x", { headers: { Authorization: "Bearer t" } });
    expect(assign).toHaveBeenCalled();
    expect(window.localStorage.getItem(draft)).toBe("{}");
    window.localStorage.removeItem(draft);
  });

  it("a token handed over in the last minute is a refusal, never a loop", async () => {
    window.sessionStorage.setItem(TAB_TOKEN_KEY, tokenWith(now() + TOKEN_MINUTES * 60 - 5));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 })),
    );
    await onboardingFetch("http://api/x", { headers: { Authorization: "Bearer t" } });
    expect(assign).not.toHaveBeenCalled();
  });

  it("a call with no token, or any other answer, is left alone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 })),
    );
    await onboardingFetch("http://api/x");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 403 })),
    );
    await onboardingFetch("http://api/x", { headers: { Authorization: "Bearer t" } });
    expect(assign).not.toHaveBeenCalled();
  });

  it("freshToken reads the token's expiry", () => {
    const t = now();
    expect(freshToken(tokenWith(t + TOKEN_MINUTES * 60), t)).toBe(true);
    expect(freshToken(tokenWith(t + 60), t)).toBe(false);
    expect(freshToken("not-a-token", t)).toBe(false);
  });
});

// "Your session has expired" (owner, 2026-11-19): a 401 saying `reason: session_expired` (the hub
// sign-in behind the token has ended) goes through ONE call, `showSessionExpired(loginUrl)`, once:
// accounts-api's front door, which sends the person to the hub's sign-in page with `next` = the
// wizard's relaunch for this company. Any other 401 still relaunches quietly (above).
describe("a 401 whose sign-in has ended", () => {
  const shown = vi.fn<(url: string) => void>();
  const assign = vi.fn();
  const ended = () =>
    new Response(JSON.stringify({ error: "Unauthorized", reason: "session_expired" }), {
      status: 401,
    });
  beforeEach(() => {
    _resetSessionExpiredForTests(shown);
    vi.stubGlobal("location", {
      ...window.location,
      set href(v: string) {
        assign(v);
      },
    });
    window.sessionStorage.setItem(TAB_ENTITY_KEY, "e-1");
    window.sessionStorage.setItem(TAB_TOKEN_KEY, tokenWith(now() - 10));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
    shown.mockReset();
    assign.mockReset();
    _resetSessionExpiredForTests();
  });

  it("reads the reason off a 401's body", () => {
    expect(isSessionExpired({ error: "Unauthorized", reason: "session_expired" })).toBe(true);
    expect(isSessionExpired({ error: "Unauthorized" })).toBe(false);
    expect(isSessionExpired(null)).toBe(false);
  });

  it("says so once for calls failing together, with the way back into the wizard", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ended()),
    );
    const auth = { headers: { Authorization: "Bearer t" } };

    const answers = await Promise.all([
      onboardingFetch("http://api/x", auth),
      onboardingFetch("http://api/y", auth),
    ]);

    expect(answers.map((r) => r.status)).toEqual([401, 401]);
    expect(await answers[0].json()).toEqual({ error: "Unauthorized", reason: "session_expired" });
    expect(assign).not.toHaveBeenCalled(); // no quiet relaunch
    expect(shown).toHaveBeenCalledTimes(1);
    const target = new URL(shown.mock.calls[0][0]);
    expect(target.origin + target.pathname).toBe(FLASK_BASE + "/");
    expect(target.searchParams.get("next")).toBe("/entity/e-1/modules");
  });

  it("keeps the person's auto-saved drafts (only an explicit sign-out removes them)", async () => {
    const draft = "minty:draft:1:u1:e-1:onb.step:5";
    window.localStorage.setItem(draft, "{}");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ended()),
    );
    await onboardingFetch("http://api/x", { headers: { Authorization: "Bearer t" } });
    expect(shown).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(draft)).toBe("{}");
    window.localStorage.removeItem(draft);
  });

  it("a token handed over in the last minute still says so - the reason is the server's word", async () => {
    window.sessionStorage.setItem(TAB_TOKEN_KEY, tokenWith(now() + TOKEN_MINUTES * 60 - 5));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ended()),
    );
    await onboardingFetch("http://api/x", { headers: { Authorization: "Bearer t" } });
    expect(shown).toHaveBeenCalledTimes(1);
  });
});
