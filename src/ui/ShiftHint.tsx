import { useEffect, useState } from 'react';
import { useDrag } from './drag';
import { useShiftTargets } from './shift';

const SEEN_KEY = 'spellfall.shiftHintSeen';

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Private window or blocked storage: the hint may show again; nothing else depends on it.
  }
}

/** A short hint the first time one of your units can Shift. Fades on its own, or once you drag. */
export function ShiftHint() {
  const targets = useShiftTargets();
  const dragging = useDrag((s) => s.drag?.shift === true);
  const available = targets.size > 0;
  // Pending until the hint has been shown once (on any device visit); then it times out.
  const [pending, setPending] = useState(() => !seen());
  useEffect(() => {
    if (!pending || !available) return;
    markSeen();
    const t = setTimeout(() => setPending(false), 7000);
    return () => clearTimeout(t);
  }, [pending, available]);
  if (!pending || dragging || !available) return null;
  return (
    <p className="shift-hint" role="status">
      Drag a Shift unit to another lane. Once per match.
    </p>
  );
}
