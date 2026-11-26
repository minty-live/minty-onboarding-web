// Inline icon set — stroke icons, 1.6 weight
// Converted from window-global to ES module export.
import type { SVGProps } from "react";

/** Anything the caller wants on the <svg>: className, aria-*, a size override. */
type SvgProps = SVGProps<SVGSVGElement>;

const Icon = {
  Arrow: (p: SvgProps) => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  ),
  ArrowLeft: (p: SvgProps) => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M19 12H5M11 19l-7-7 7-7" />
    </svg>
  ),
  Check: (p: SvgProps) => (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  ),
  CheckSm: (p: SvgProps) => (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  ),
  CheckBig: (p: SvgProps) => (
    <svg
      width="44"
      height="44"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  ),
  Close: (p: SvgProps) => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      {...p}
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  Plus: (p: SvgProps) => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      {...p}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  // Material Symbols Rounded 400 "payments" (the sales accounts screen, Figma 464:73)
  Payments: (p: SvgProps) => (
    <svg width="22" height="22" viewBox="0 -960 960 960" fill="currentColor" aria-hidden {...p}>
      <path d="M540-420q-50 0-85-35t-35-85q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35ZM220-280q-24.75 0-42.37-17.63Q160-315.25 160-340v-400q0-24.75 17.63-42.38Q195.25-800 220-800h640q24.75 0 42.38 17.62Q920-764.75 920-740v400q0 24.75-17.62 42.37Q884.75-280 860-280H220Zm100-60h440q0-42 29-71t71-29v-200q-42 0-71-29t-29-71H320q0 42-29 71t-71 29v200q42 0 71 29t29 71Zm450 180H100q-24.75 0-42.37-17.63Q40-195.25 40-220v-430q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v430h670q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5ZM220-340v-400 400Z" />
    </svg>
  ),
  // Material Symbols Rounded 400 "credit_card" (the sales accounts screen, Figma 464:73)
  CreditCard: (p: SvgProps) => (
    <svg width="22" height="22" viewBox="0 -960 960 960" fill="currentColor" aria-hidden {...p}>
      <path d="M880-740v520q0 24-18 42t-42 18H140q-24 0-42-18t-18-42v-520q0-24 18-42t42-18h680q24 0 42 18t18 42ZM140-631h680v-109H140v109Zm0 129v282h680v-282H140Zm0 282v-520 520Z" />
    </svg>
  ),
  // Material Symbols Rounded 400 "local_shipping" (the sales accounts screen, Figma 464:73)
  Delivery: (p: SvgProps) => (
    <svg width="22" height="22" viewBox="0 -960 960 960" fill="currentColor" aria-hidden {...p}>
      <path d="M140.5-195.42Q106-229.83 106-279H70q-12.75 0-21.37-8.63Q40-296.25 40-309v-431q0-24 18-42t42-18h519q24.75 0 42.38 17.62Q679-764.75 679-740v107h75q14.25 0 27 6.37 12.75 6.38 21 17.63l112 149q3 3.75 4.5 8.25T920-442v133q0 12.75-8.62 21.37Q902.75-279 890-279h-41q0 49-34.38 83.5t-83.5 34.5q-49.12 0-83.62-34.42Q613-229.83 613-279H342q0 49-34.38 83.5t-83.5 34.5q-49.12 0-83.62-34.42ZM265-238q17-17 17-41t-17-41q-17-17-41-17t-41 17q-17 17-17 41t17 41q17 17 41 17t41-17ZM100-339h22q17-27 43.04-43t58-16q31.96 0 58.46 16.5T325-339h294v-401H100v401Zm672 101q17-17 17-41t-17-41q-17-17-41-17t-41 17q-17 17-17 41t17 41q17 17 41 17t41-17Zm-93-187h186L754-573h-75v148ZM360-540Z" />
    </svg>
  ),
  Info: (p: SvgProps) => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5v.01" />
    </svg>
  ),
  Sparkle: (p: SvgProps) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" {...p}>
      <path d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2zM19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z" />
    </svg>
  ),
  Link: (p: SvgProps) => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M10 14a5 5 0 007 0l3-3a5 5 0 10-7-7l-1 1" />
      <path d="M14 10a5 5 0 00-7 0l-3 3a5 5 0 107 7l1-1" />
    </svg>
  ),
  Lock: (p: SvgProps) => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  ),
  Trash: (p: SvgProps) => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  ),
  /** The drag handle: two columns of three dots. */
  Grip: (p: SvgProps) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" {...p}>
      <circle cx="9" cy="6" r="1.75" />
      <circle cx="15" cy="6" r="1.75" />
      <circle cx="9" cy="12" r="1.75" />
      <circle cx="15" cy="12" r="1.75" />
      <circle cx="9" cy="18" r="1.75" />
      <circle cx="15" cy="18" r="1.75" />
    </svg>
  ),
};

export default Icon;
