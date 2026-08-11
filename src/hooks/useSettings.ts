/**
 * The `settings` singleton (Cold Storage / Dispatch / General operational
 * toggles). Writes go straight to Directus on each change (no local
 * draft/save-button state) — these are simple, low-stakes toggles/numbers,
 * matching how the prototype's Settings screen behaved.
 */

import { useEffect, useState } from 'react';
import { readSettings, updateSettings } from '../lib/directus';
import type { SettingsCollection } from '../types/directus';

interface UseSettingsResult {
  settings: SettingsCollection | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  update: (patch: Record<string, unknown>) => Promise<{ error: string | null }>;
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<SettingsCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const settingsRes = await readSettings();
      if (cancelled) return;

      if (settingsRes.error) {
        setError(`Failed to load settings: ${settingsRes.error}`);
        setLoading(false);
        return;
      }
      setSettings(settingsRes.data);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function update(patch: Record<string, unknown>) {
    if (!settings) return { error: 'Settings not loaded yet' };
    setSaving(true);
    const res = await updateSettings(patch);
    setSaving(false);
    if (res.error) return { error: res.error };
    setSettings(res.data);
    return { error: null };
  }

  return { settings, loading, error, saving, update };
}
