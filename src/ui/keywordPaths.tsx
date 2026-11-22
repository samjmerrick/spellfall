import type { ReactNode } from 'react';

/** 24 x 24 line-art paths: 2 px stroke with round caps and joins, same style as the card art. */
export const PATHS: Record<string, ReactNode> = {
  guard: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />,
  barrier: <circle cx="12" cy="12" r="8" strokeDasharray="3.2 2.6" />,
  pierce: <path d="M12 21V4M6 10l6-6 6 6M7 17h10" />,
  rally: <path d="M6 21V4M6 5h12l-3.5 4L18 13H6" />,
  growth: <path d="M12 21V11M12 11c0-4 3-6 7-6 0 4-3 6-7 6zM12 16c0-3-2-5-6-5 0 3 2 5 6 5z" />,
  regenerate: <path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v4.5h-4.5" />,
  lifesteal: <path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" />,
  shift: <path d="M4 8h16M16 4l4 4-4 4M20 16H4M8 12l-4 4 4 4" />,
  ephemeral: <path d="M7 3h10M7 21h10M8 3v3l4 6-4 6v3M16 3v3l-4 6 4 6v3" />,
  // Spellfall keywords and triggers.
  overwhelm: <path d="M4 18l6-6-6-6M12 18l6-6-6-6" />,
  quick: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  elusive: (
    <>
      <path d="M3 12s3.5-6 9-6c1.6 0 3 .5 4.2 1.2M21 12s-3.5 6-9 6c-1.6 0-3-.5-4.2-1.2" />
      <path d="M4 20L20 4" />
    </>
  ),
  onPlay: <path d="M7 4l12 8-12 8z" />,
  startOfTurn: (
    <>
      <path d="M4 18h16M7 14a5 5 0 0 1 10 0" />
      <path d="M12 3v3M5 7l2 2M19 7l-2 2" />
    </>
  ),
  endOfTurn: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  onReveal: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  ongoing: (
    <path d="M12 12c-2-3-3-4-5-4a4 4 0 0 0 0 8c2 0 3-1 5-4zm0 0c2 3 3 4 5 4a4 4 0 0 0 0-8c-2 0-3 1-5 4z" />
  ),
  endOfRound: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  lastBreath: <path d="M6 12a6 6 0 0 1 12 0v3h-2.5v4h-7v-4H6zM9.5 12h.01M14.5 12h.01" />,
};
