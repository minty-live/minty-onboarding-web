/**
 * The screen's one ⓘ box (owner, 2026-11-26): grey subtitles went unread, so every wizard screen has a
 * one-sentence subtitle and puts anything the person must know here, next to its list or fields.
 * One per screen - e2e/copy-rule.spec.ts holds it.
 */
import type { ReactNode } from "react";
import Icon from "../Icon";

export default function InfoBox({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p className="acs-sa-note info-box" role="note" id={id}>
      <Icon.Info width={18} height={18} aria-hidden />
      <span>{children}</span>
    </p>
  );
}
