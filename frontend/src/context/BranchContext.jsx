import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { branchService } from '../services/branch.service.js';
import { setActiveBranchId as setClientActiveBranchId } from '../api/client.js';

const BranchContext = createContext(null);
const STORAGE_KEY = 'pos.selectedBranchId';

function readStoredBranchId() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredBranchId(id) {
  try {
    if (id !== null && id !== undefined) localStorage.setItem(STORAGE_KEY, String(id));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures; the in-memory selection still works for the tab.
  }
}

export function BranchProvider({ children }) {
  const { isAuthenticated } = useAuth();

  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchIdState] = useState(() => readStoredBranchId());
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error

  // The API client keeps its own module-level copy of the active branch id
  // (the same pattern auth.service.js uses for the token) because the fetch
  // interceptor in api/client.js runs outside React and can't call hooks.
  const setSelectedBranchId = useCallback((id) => {
    setSelectedBranchIdState(id ?? null);
    writeStoredBranchId(id ?? null);
    setClientActiveBranchId(id ?? null);
  }, []);

  // Keep the API client in sync on mount / whenever the selection changes
  // through any path (including the initial value read from storage).
  useEffect(() => {
    setClientActiveBranchId(selectedBranchId);
  }, [selectedBranchId]);

  // Fetch the branch list once the user is authenticated. Logging out
  // clears it so a stale list never leaks into the next session.
  useEffect(() => {
    if (!isAuthenticated) {
      setBranches([]);
      setStatus('idle');
      return undefined;
    }

    let active = true;
    setStatus('loading');
    branchService
      .list()
      .then((items) => {
        if (!active) return;
        setBranches(items);
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  // Once the branch list resolves, make sure the selection is valid: keep
  // it if it still exists, otherwise fall back to the stored id, otherwise
  // the first branch returned.
  useEffect(() => {
    if (status !== 'ready' || branches.length === 0) return;
    const validIds = branches.map((b) => String(b.id));
    if (selectedBranchId && validIds.includes(String(selectedBranchId))) return;

    const stored = readStoredBranchId();
    const fallback = stored && validIds.includes(String(stored)) ? stored : branches[0].id;
    setSelectedBranchId(fallback);
  }, [status, branches, selectedBranchId, setSelectedBranchId]);

  const selectedBranch = useMemo(
    () => branches.find((b) => String(b.id) === String(selectedBranchId)) || null,
    [branches, selectedBranchId]
  );

  const refetch = useCallback(() => {
    if (!isAuthenticated) return Promise.resolve([]);
    setStatus('loading');
    return branchService
      .list()
      .then((items) => {
        setBranches(items);
        setStatus('ready');
        return items;
      })
      .catch(() => {
        setStatus('error');
        return [];
      });
  }, [isAuthenticated]);

  const value = useMemo(
    () => ({
      branches,
      selectedBranchId,
      selectedBranch,
      setSelectedBranchId,
      loading: status === 'loading',
      error: status === 'error',
      refetch,
    }),
    [branches, selectedBranchId, selectedBranch, setSelectedBranchId, status, refetch]
  );

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error('useBranch must be used inside <BranchProvider>.');
  return ctx;
}
