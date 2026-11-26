"use client";

/**
 * "Watch how (1 min)" in the Opening Balance step's info box (owner, 2026-11-26): opens the
 * how-to video in a pop-up. Drawn only once lib/videos.ts has the video's URL.
 */
import { useId, useState } from "react";
import Icon from "../Icon";
import { ModalFrame } from "../ModalFrame";
import { OPENING_BALANCE_VIDEO } from "../../lib/videos";

export function OpeningVideoLink() {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  if (!OPENING_BALANCE_VIDEO) return null;
  return (
    <>
      {" "}
      <button type="button" className="info-box-link" onClick={() => setOpen(true)}>
        Watch how (1 min)
      </button>
      {open && (
        <ModalFrame
          labelledBy={titleId}
          onDismiss={() => setOpen(false)}
          className="mw-dialog video-dialog"
        >
          <div className="video-dialog-head">
            <h2 id={titleId} className="mw-dialog-title">
              How to count your opening cash
            </h2>
            <button
              type="button"
              className="video-dialog-close"
              aria-label="Close the video"
              onClick={() => setOpen(false)}
            >
              <Icon.Close aria-hidden />
            </button>
          </div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the team's video; captions come with it */}
          <video className="video-dialog-player" src={OPENING_BALANCE_VIDEO} controls autoPlay />
        </ModalFrame>
      )}
    </>
  );
}
