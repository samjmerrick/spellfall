import { useEffect } from 'react';
import { prepareCloud, signIn, signOut, syncNow, useCloud } from '../cloud';

/** Optional Google sign-in for cloud saves. Not rendered in the artifact build or when the server is unreachable. */
export function CloudSection() {
  const { available, user, status, message } = useCloud();
  useEffect(() => {
    if (__CLOUD_SYNC__) void prepareCloud();
  }, []);
  if (!__CLOUD_SYNC__ || !available) return null;
  const busy = status === 'syncing';
  return (
    <>
      <h2 className="label">Cloud save</h2>
      <p className="hint" data-testid="cloud-hint">
        {user
          ? `Signed in as ${user}. Your save is copied to the cloud and shared between your devices; the newest one wins.`
          : 'Optional. Sign in to keep a copy of your save in the cloud and share it between devices. The game works the same without it.'}
      </p>
      {user ? (
        <>
          <button type="button" className="secondary wide" disabled={busy} onClick={() => void syncNow(true)}>
            {busy ? 'Syncing…' : 'Sync now'}
          </button>
          <button type="button" className="secondary wide" onClick={() => void signOut()}>
            Sign out
          </button>
        </>
      ) : (
        <button
          type="button"
          className="secondary wide"
          data-testid="cloud-sign-in"
          onClick={() => void signIn()}
        >
          Sign in with Google
        </button>
      )}
      {message && (
        <p className={status === 'error' ? 'error' : 'hint'} role="status" data-testid="cloud-status">
          {message}
        </p>
      )}
    </>
  );
}
