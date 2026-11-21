import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppTheme = 'dark' | 'light';

type ThemeContextValue = {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
};

const THEME_STORAGE_KEY = 'kickoff:appearance';
const ThemeContext = createContext<ThemeContextValue>({ theme: 'dark', setTheme: () => undefined });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>('dark');

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(THEME_STORAGE_KEY).then((storedTheme) => {
      if (active && (storedTheme === 'dark' || storedTheme === 'light')) {
        setThemeState(storedTheme);
        Appearance.setColorScheme(storedTheme);
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const setTheme = useCallback((nextTheme: AppTheme) => {
    setThemeState(nextTheme);
    Appearance.setColorScheme(nextTheme);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, nextTheme).catch(() => undefined);
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
