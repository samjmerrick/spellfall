import { useState } from 'react';
import { exportSaveCode } from '../../save';
import { useApp } from '../app';
import { CloudSection } from './CloudSection';
import { ScreenFrame } from './common';

const PERSIST_TEXT = {
  granted: 'Protected: the browser will not clear your save to free up space.',
  denied: 'Not protected: the browser may clear your save if space runs low. Keep a save code as a backup.',
  unsupported: 'This browser cannot protect saves from clearing. Keep a save code as a backup.',
} as const;

function Toggle({
  label,
  hint,
  checked,
  onChange,
  testId,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="toggle"
      data-testid={testId}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__text">
        <span className="toggle__label">{label}</span>
        {hint && <span className="toggle__hint">{hint}</span>}
      </span>
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__thumb" />
      </span>
    </button>
  );
}

export function SettingsScreen() {
  const profile = useApp((s) => s.profile);
  const persist = useApp((s) => s.persist);
  const storageWorks = useApp((s) => s.storageWorks);
  const importSave = useApp((s) => s.importSave);
  const setSettings = useApp((s) => s.setSettings);
  const [exported, setExported] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = async () => {
    const code = await exportSaveCode(profile);
    setExported(code);
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Shown in the text box for manual copying.
    }
  };
  const load = async () => {
    try {
      await importSave(paste);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setConfirm(false);
    }
  };

  return (
    <ScreenFrame title="Settings">
      <h2 className="label">Play</h2>
      <div className="toggles">
        <Toggle
          label="Fast animations"
          checked={profile.settings.fastAnimations}
          onChange={(v) => setSettings({ fastAnimations: v })}
          testId="setting-fast"
        />
        <Toggle
          label="Reduce motion"
          hint="Fades instead of moving. Also follows your device setting."
          checked={profile.settings.reduceMotion}
          onChange={(v) => setSettings({ reduceMotion: v })}
          testId="setting-reduce-motion"
        />
        <Toggle
          label="Sound"
          checked={profile.settings.sound}
          onChange={(v) => setSettings({ sound: v })}
          testId="setting-sound"
        />
        <Toggle
          label="Haptics"
          hint="Vibration on supported phones. Not available on iPhone."
          checked={profile.settings.haptics}
          onChange={(v) => setSettings({ haptics: v })}
          testId="setting-haptics"
        />
        <Toggle
          label="Auto-pass"
          hint="Pass for you when you have nothing to respond with."
          checked={profile.settings.autoPass}
          onChange={(v) => setSettings({ autoPass: v })}
          testId="setting-auto-pass"
        />
      </div>

      <h2 className="label">Save storage</h2>
      <p className="hint" data-testid="persist-status">
        {!storageWorks
          ? 'Saving is unavailable in this browser mode; progress lasts until you close the page.'
          : persist
            ? PERSIST_TEXT[persist]
            : 'Checking…'}
      </p>

      <CloudSection />

      <h2 className="label">Backup</h2>
      <button type="button" className="secondary wide" onClick={() => void copy()}>
        Copy save code
      </button>
      {exported && (
        <textarea
          className="code code--area"
          readOnly
          aria-label="Your save code"
          value={exported}
          onFocus={(e) => e.target.select()}
        />
      )}

      <h2 className="label">Restore</h2>
      <textarea
        className="code code--area"
        aria-label="Paste save code"
        placeholder="SS1.…"
        value={paste}
        onChange={(e) => {
          setPaste(e.target.value);
          setConfirm(false);
        }}
      />
      {!confirm ? (
        <button
          type="button"
          className="secondary wide"
          disabled={!paste.trim()}
          onClick={() => setConfirm(true)}
        >
          Paste save code
        </button>
      ) : (
        <button type="button" className="danger wide" onClick={() => void load()}>
          Replace my save with this code
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </ScreenFrame>
  );
}
