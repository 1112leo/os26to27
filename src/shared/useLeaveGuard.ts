import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

export function useLeaveGuard(active: boolean | (() => boolean)) {
  const blocker = useBlocker(() => typeof active === 'function' ? active() : active);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (typeof active === 'function' ? active() : active) event.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);
  return blocker;
}
