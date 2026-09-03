import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext';

const SalesContext = createContext(null);

export function SalesProvider({ children }) {
  const { selectedFY } = useAuth();

  const [dateRange, setDateRange] = useState({
    from: selectedFY?.startDate,
    to: selectedFY?.endDate,
    preset: 'This FY'
  });
  const [irnGenerateOpen, setIrnGenerateOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    if (!selectedFY?.startDate || !selectedFY?.endDate) return;
    if (dateRange.preset !== 'This FY') return;
    if (dateRange.from === selectedFY.startDate && dateRange.to === selectedFY.endDate) return;
    setDateRange({
      from: selectedFY.startDate,
      to: selectedFY.endDate,
      preset: 'This FY',
    });
  }, [selectedFY?.uniqueId, selectedFY?.startDate, selectedFY?.endDate, dateRange.preset]);

  const setRange = (from, to, preset) => {
    setDateRange({ from, to, preset });
  };

  const value = useMemo(() => ({
    dateRange,
    setRange,
    irnGenerateOpen,
    openIrnGenerator: () => setIrnGenerateOpen(true),
    closeIrnGenerator: () => setIrnGenerateOpen(false),
    alerts,
    setAlerts,
  }), [dateRange, irnGenerateOpen, alerts]);

  return (
    <SalesContext.Provider value={value}>
      {children}
    </SalesContext.Provider>
  );
}

export const useSalesContext = () => useContext(SalesContext);
