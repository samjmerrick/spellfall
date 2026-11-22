export function RotateNotice() {
  return (
    <div className="rotate-notice" role="alert" aria-live="polite">
      <div className="rotate-notice__icon" aria-hidden="true" />
      <p>Rotate your phone</p>
      <p className="rotate-notice__hint">Spellfall plays in portrait.</p>
    </div>
  );
}
