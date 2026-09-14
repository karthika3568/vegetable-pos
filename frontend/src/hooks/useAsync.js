import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client.js';

function normalizeError(err) {
  if (err instanceof ApiError) {
    return { message: err.message, status: err.status, details: err.details };
  }
  return { message: err?.message || 'Something went wrong. Please try again.', status: 0, details: null };
}

/**
 * Runs an async function, exposing { data, loading, error, refetch }.
 * Consistent loading / error / empty handling for data-driven pages.
 */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      setState({ data, loading: false, error: null });
      return data;
    } catch (err) {
      setState({ data: null, loading: false, error: normalizeError(err) });
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef
      .current()
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (!active) return;
        setState({ data: null, loading: false, error: normalizeError(err) });
      });
    return () => {
      active = false;
    };
  }, deps);

  return { ...state, refetch: run };
}