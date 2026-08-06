/**
 * The `settings` singleton (Cold Storage / Dispatch / General operational
 * toggles) plus the `corrections` row count for the Settings page's "Intake
 * Learning" card. Writes go straight to Directus on each change (no local
 * draft/save-button state) — these are simple, low-stakes toggles/numbers,
 * matching how the prototype's Settings screen behaved.
 */

import { useEffect, useState } from 'react';
import { readSettings, updateSettings, aggregateCorrections } from '../lib/directus';
import type { SettingsCollection } from '../types/directus';

interface UseSettingsResult {
  settings: SettingsCollection | null;
  learnedMatches: number;
  loading: boolean;
  error: string | null;
  saving: boolean;
  update: (patch: Record<string, unknown>) => Promise<{ error: string | null }>;
}

function extractCount(val: unknown): number {
  if (typeof val === 'number') return Number.isNaN(val) ? 0 : val;
  if (typeof val === 'string') {
    const parsed = parseInt(val, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (val && typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    return extractCount(obj['*'] ?? Object.values(obj)[0]);
  }
  return 0;
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<SettingsCollection | null>(null);
  const [learnedMatches, setLearnedMatches] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const [settingsRes, correctionsRes] = await Promise.all([
        readSettings(),
        aggregateCorrections({ aggregate: { count: ['*'] } }),
      ]);
      if (cancelled) return;

      if (settingsRes.error) {
        setError(`Failed to load settings: ${settingsRes.error}`);
        setLoading(false);
        return;
      }
      setSettings(settingsRes.data);
      setLearnedMatches(correctionsRes.data ? extractCount(correctionsRes.data[0]?.count) : 0);
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
    const res = await updateSettings(settings.id, patch);
    setSaving(false);
    if (res.error) return { error: res.error };
    setSettings(res.data);
    return { error: null };
  }

  return { settings, learnedMatches, loading, error, saving, update };
}
