import colors from '@/constants/colors';
import { useAppTheme } from '@/providers/ThemeProvider';

/**
 * Returns the design tokens for the appearance selected in Settings.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 *
 */
export function useColors() {
  const { theme } = useAppTheme();
  const palette = colors[theme];
  return { ...palette, radius: colors.radius };
}
