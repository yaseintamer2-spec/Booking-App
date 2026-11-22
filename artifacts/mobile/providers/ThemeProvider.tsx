import React, { createContext, useContext } from 'react';

export type AppTheme = 'dark';

const ThemeContext = createContext<AppTheme>('dark');

/** KICKOFF uses one fixed indigo appearance across every device. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <ThemeContext.Provider value="dark">{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  return { theme: useContext(ThemeContext) };
}
