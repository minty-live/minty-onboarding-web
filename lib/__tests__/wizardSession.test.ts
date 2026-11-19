import { afterEach, describe, expect, it } from "vitest";

import {
  TAB_ENTITY_KEY,
  TAB_TOKEN_KEY,
  clearTabEntity,
  signInAgainUrl,
  tabResume,
  writeTabEntity,
  writeTabToken,
} from "../wizardSession";

// A JWT whose payload is all that's read here (no signature check client-side).
const jwt = (exp: number) => `h.${btoa(JSON.stringify({ user_id: "u1", exp }))}.s`;
const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;

afterEach(() => window.sessionStorage.clear());

describe("tabResume - what a plain reload resumes from (2026-10-27)", () => {
  it("resumes the company this tab was onboarding, with its token", () => {
    const token = jwt(inAnHour());
    writeTabToken(token);
    writeTabEntity("entity-1");
    expect(tabResume()).toEqual({ entityId: "entity-1", token });
  });

  it("has nothing to resume before a company exists", () => {
    writeTabToken(jwt(inAnHour()));
    expect(tabResume()).toBeNull();
  });

  it("has nothing to resume without a token", () => {
    writeTabEntity("entity-1");
    expect(tabResume()).toBeNull();
  });

  it("does not resume on an expired token", () => {
    writeTabToken(jwt(Math.floor(Date.now() / 1000) - 10));
    writeTabEntity("entity-1");
    expect(tabResume()).toBeNull();
  });

  it("forgets the company when told to (a fresh '+' launch)", () => {
    writeTabToken(jwt(inAnHour()));
    writeTabEntity("entity-1");
    clearTabEntity();
    expect(window.sessionStorage.getItem(TAB_ENTITY_KEY)).toBeNull();
    expect(tabResume()).toBeNull();
    expect(window.sessionStorage.getItem(TAB_TOKEN_KEY)).not.toBeNull();
  });

  it("ignores an empty id rather than clearing the stored one", () => {
    writeTabEntity("entity-1");
    writeTabEntity("");
    expect(window.sessionStorage.getItem(TAB_ENTITY_KEY)).toBe("entity-1");
  });
});

describe("signInAgainUrl - where a refused token sends the person (Phase 9, 2026-11-19)", () => {
  it("is accounts-api's address for the company, which relaunches the wizard or asks to sign in", () => {
    expect(signInAgainUrl("https://accounts.test", "8f5c6d43-a250-5a1a-910f-957e32b44e27")).toBe(
      "https://accounts.test/entity/8f5c6d43-a250-5a1a-910f-957e32b44e27/modules",
    );
  });

  it("is Minty's front door before there is a company", () => {
    expect(signInAgainUrl("https://accounts.test", "")).toBe("https://accounts.test/");
    expect(signInAgainUrl("https://accounts.test", null)).toBe("https://accounts.test/");
  });

  it("never lets an id leave its path segment", () => {
    expect(signInAgainUrl("https://accounts.test", "../x?y")).toBe(
      "https://accounts.test/entity/..%2Fx%3Fy/modules",
    );
  });
});
