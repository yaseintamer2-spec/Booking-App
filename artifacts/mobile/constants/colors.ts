/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    text: '#E8EEE9',
    tint: '#34D399',
    background: '#0A100E',
    foreground: '#E8EEE9',
    card: '#121B17',
    cardForeground: '#E8EEE9',
    primary: '#39D98A',
    primaryForeground: '#07120D',
    secondary: '#1A2821',
    secondaryForeground: '#D3DED6',
    muted: '#17211C',
    mutedForeground: '#91A198',
    accent: '#20352A',
    accentForeground: '#C4F5D8',
    destructive: '#E16C65',
    destructiveForeground: '#FFF5F3',
    googleBlue: '#4285F4',
    border: '#26352D',
    input: '#1B2821',
  },
  dark: {
    text: '#E8EEE9',
    tint: '#34D399',
    background: '#0A100E',
    foreground: '#E8EEE9',
    card: '#121B17',
    cardForeground: '#E8EEE9',
    primary: '#39D98A',
    primaryForeground: '#07120D',
    secondary: '#1A2821',
    secondaryForeground: '#D3DED6',
    muted: '#17211C',
    mutedForeground: '#91A198',
    accent: '#20352A',
    accentForeground: '#C4F5D8',
    destructive: '#E16C65',
    destructiveForeground: '#FFF5F3',
    googleBlue: '#4285F4',
    border: '#26352D',
    input: '#1B2821',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
