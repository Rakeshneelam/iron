import { useEffect, useState } from 'react';

import { fmtClock } from '@/lib/date';

/** A ticking "12:34" since an ISO instant. Re-renders only itself, once a second. */
export function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{fmtClock(Math.round((now - Date.parse(since)) / 1000))}</>;
}
