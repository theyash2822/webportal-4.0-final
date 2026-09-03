import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  formatAmount as _fmtAmount,
  formatAmountCompact as _fmtCompact,
  formatDate as _fmtDate,
  getCurrencySymbol,
  DEFAULT_FORMAT_SETTINGS,
} from '../utils/format';
import { USE_MOCK } from '../services/config';
import i18n, { languageToCode } from '../i18n';

// Same-origin by default: backend is reverse-proxied at /app on the portal host.
const API_BASE = import.meta.env.VITE_API_URL || '/app';

const DEFAULT_SETTINGS = {
  language: 'English',
  currency: 'INR',
  number_format: 'Indian',
  date_format: 'DD/MM/YYYY',
  theme: 'light',
  kpi_autoscroll: true,
  decimal_places: 2,
};

const SettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  updateSettings: async () => {},
  formatAmount: (n) => _fmtAmount(n, DEFAULT_FORMAT_SETTINGS),
  formatAmountCompact: (n) => _fmtCompact(n, DEFAULT_FORMAT_SETTINGS),
  currencySymbol: '₹',
  formatDate: (d) => d,
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    /* initial state below; language applied to i18n in the effect */
    try {
      const stored = localStorage.getItem('userSettings');
      return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Sync from API on mount (skipped in mock mode — local settings are the source)
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token || USE_MOCK) return;
    fetch(`${API_BASE}/user-settings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(res => {
        if (res?.data) {
          const merged = { ...DEFAULT_SETTINGS, ...res.data };
          setSettings(merged);
          localStorage.setItem('userSettings', JSON.stringify(merged));
        }
      })
      .catch(() => {});
  }, []);

  // Keep the UI language in sync with the stored preference (mobile parity).
  useEffect(() => {
    i18n.changeLanguage(languageToCode(settings.language));
  }, [settings.language]);

  const updateSettings = async (partial) => {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    localStorage.setItem('userSettings', JSON.stringify(updated));
    const token = localStorage.getItem('authToken');
    if (!token || USE_MOCK) return;
    try {
      await fetch(`${API_BASE}/user-settings`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(partial),
      });
    } catch {}
  };

  const fmtSettings = {
    currency:       settings.currency,
    number_format:  settings.number_format,
    decimal_places: settings.decimal_places,
    date_format:    settings.date_format,
  };

  return (
    <SettingsContext.Provider value={{
      settings,
      updateSettings,
      formatAmount:        (n) => _fmtAmount(n, fmtSettings),
      formatAmountCompact: (n) => _fmtCompact(n, fmtSettings),
      currencySymbol:      getCurrencySymbol(settings.currency),
      formatDate:          (iso) => _fmtDate(iso, fmtSettings),
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
