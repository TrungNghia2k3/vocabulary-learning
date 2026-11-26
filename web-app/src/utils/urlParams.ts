/**
 * Lightweight URL query-parameter deep-linking helper.
 * Lets every view reflect its active filters, sub-tabs, and open item
 * directly in the browser URL so F5 / bookmarking / sharing / Back-Forward
 * always restore the exact screen state.
 */

export function getUrlParam(key: string): string | null {
  if (typeof window === 'undefined') return null;
  const val = new URLSearchParams(window.location.search).get(key);
  return val !== null && val !== '' ? val : null;
}

export function getUrlIntParam(key: string): number | null {
  const raw = getUrlParam(key);
  if (raw === null) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Merge partial query parameter updates into the current URL.
 * Passing null / undefined / '' deletes that parameter.
 */
export function setUrlParams(
  updates: Record<string, string | number | null | undefined>,
  options?: { push?: boolean }
): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(updates)) {
    if (v === null || v === undefined || v === '') {
      params.delete(k);
    } else {
      params.set(k, String(v));
    }
  }
  const qs = params.toString();
  const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
  const curUrl = `${window.location.pathname}${window.location.search}`;
  if (nextUrl === curUrl) return;
  if (options?.push) {
    window.history.pushState(window.history.state, '', nextUrl);
  } else {
    window.history.replaceState(window.history.state, '', nextUrl);
  }
}

/**
 * Replace query parameters on the current route cleanly (dropping stale keys from
 * other sub-modes, while optionally preserving specified keys like `deck`/`topic`).
 */
export function syncUrlParams(
  paramsObj: Record<string, string | number | null | undefined>,
  options?: { push?: boolean; preserveKeys?: string[] }
): void {
  if (typeof window === 'undefined') return;
  const current = new URLSearchParams(window.location.search);
  const next = new URLSearchParams();

  if (options?.preserveKeys) {
    for (const k of options.preserveKeys) {
      const existing = current.get(k);
      if (existing !== null && existing !== '') {
        next.set(k, existing);
      }
    }
  }

  for (const [k, v] of Object.entries(paramsObj)) {
    if (v === null || v === undefined || v === '') {
      next.delete(k);
    } else {
      next.set(k, String(v));
    }
  }

  const qs = next.toString();
  const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
  const curUrl = `${window.location.pathname}${window.location.search}`;
  if (nextUrl === curUrl) return;
  if (options?.push) {
    window.history.pushState(window.history.state, '', nextUrl);
  } else {
    window.history.replaceState(window.history.state, '', nextUrl);
  }
}
