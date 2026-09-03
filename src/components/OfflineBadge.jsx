import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import wsService from '../services/websocket';
import { useLabelT } from './kit';

export default function OfflineBadge() {
  const lt = useLabelT();
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const unWs = wsService.on('disconnect', () => setOffline(prev => prev || !navigator.onLine));
    const tick = setInterval(() => {
      if (!navigator.onLine) setOffline(true);
      else if (wsService.isConnected) setOffline(false);
    }, 5000);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      unWs();
      clearInterval(tick);
    };
  }, []);

  if (!offline) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-neg-bg px-2.5 py-1 text-[11px] font-semibold text-neg"
      data-testid="offline-badge"
      title={lt('Connection or Tally sync may be unavailable')}
    >
      <WifiOff size={12} />
      {lt('Offline')}
    </span>
  );
}
