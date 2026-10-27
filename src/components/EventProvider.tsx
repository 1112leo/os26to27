import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { EventConfig } from '../lib/types';
import { getClients, errorMessage } from '../lib/firebase';
import { readEvent } from '../lib/database';

const Context = createContext<{
  config: EventConfig | null;
  error: string;
  refresh: () => Promise<EventConfig | null>;
} | null>(null);
export function EventProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<EventConfig | null>(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const next = await readEvent((await getClients()).deviceDb);
      setConfig(next);
      setError('');
      return next;
    } catch (err) {
      setConfig(null);
      setError(errorMessage(err));
      return null;
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return <Context.Provider value={{ config, error, refresh }}>{children}</Context.Provider>;
}
export function useEvent() {
  const value = useContext(Context);
  if (!value) throw new Error('EventProvider is missing');
  return value;
}
export function EventNotice() {
  const { config, error, refresh } = useEvent();
  if (error)
    return (
      <div className="notice" role="alert">
        {error} <button onClick={() => void refresh()}>연결 재시도</button>
      </div>
    );
  if (!config) return <p role="status">운영 상태를 확인하고 있습니다.</p>;
  if (config.phase !== 'A')
    return (
      <p className="notice">
        행사가 종료되어 대회 참가와 새 글 제출을 마감했습니다. 저장된 기록과 신입생 이야기는 계속
        확인할 수 있습니다.
      </p>
    );
  return null;
}
