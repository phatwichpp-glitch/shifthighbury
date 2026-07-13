// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from 'react';

export function useSheetData({ accessToken, dbId, fetchers, deps = [] }) {
  const [data, setData] = useState(() => Object.fromEntries(Object.keys(fetchers).map(k => [k, []])));
  const [loading, setLoading] = useState(true); // start true — avoids empty-state flash on mount
  const [error, setError] = useState(null);
  const isFetching = useRef(false);
  const lastFetchAt = useRef(0);

  const refresh = useCallback((opts = {}) => {
    if (!dbId || !accessToken) {
      setLoading(false); // no credentials — stop loading
      return;
    }
    if (isFetching.current) return;
    // Safety net: auto-triggered fetches are throttled to once per 30s.
    // Explicit user-action calls pass { force: true } to bypass this.
    const now = Date.now();
    if (!opts.force && now - lastFetchAt.current < 30000) return;
    lastFetchAt.current = now;
    isFetching.current = true;
    setLoading(true);
    setError(null);
    const entries = Object.entries(fetchers);
    Promise.all(entries.map(([, fn]) => fn(accessToken, dbId).catch(() => [])))
      .then(results => {
        const next = {};
        entries.forEach(([key], i) => { next[key] = results[i] || []; });
        setData(next);
      })
      .catch(err => {
        setError(err);
        console.error('[useSheetData]', err);
      })
      .finally(() => {
        setLoading(false);
        setTimeout(() => { isFetching.current = false; }, 1000);
      });
  }, [accessToken, dbId, ...deps]); // eslint-disable-line

  useEffect(() => { refresh(); }, [refresh]);

  // ฟัง global refresh event — always force (user-triggered)
  useEffect(() => {
    const handler = () => refresh({ force: true });
    window.addEventListener('zw-refresh', handler);
    return () => window.removeEventListener('zw-refresh', handler);
  }, [refresh]);

  return { data, loading, error, refresh };
}
