import { MD3LightTheme } from 'react-native-paper';

export const moon = {
  fonts: {
    body: 'PlusJakartaSans_400Regular',
    bodySemiBold: 'PlusJakartaSans_600SemiBold',
    bodyBold: 'PlusJakartaSans_700Bold',
    displaySemiBold: 'Outfit_600SemiBold',
    displayBold: 'Outfit_700Bold',
    displayExtraBold: 'Outfit_800ExtraBold',
  },
  colors: {
    ink: '#302A3D',
    muted: '#8B8290',
    canvas: '#FFF9EA',
    surface: '#FFFEF8',
    primary: '#FF7D3D',
    primaryText: '#FFFFFF',
    border: '#E7DFD2',
    sky: '#E9E5FF',
    night: '#332579',
    lavender: '#D9D0FF',
    mint: '#CBEBDD',
    peach: '#FFD9C2',
    danger: '#B42318',
  },
  radius: 24,
};

export const moonPaperTheme = {
  ...MD3LightTheme,
  roundness: 3,
  colors: {
    ...MD3LightTheme.colors,
    primary: moon.colors.primary,
    onPrimary: moon.colors.primaryText,
    secondary: moon.colors.lavender,
    surface: moon.colors.surface,
    surfaceVariant: '#F6EFE4',
    onSurface: moon.colors.ink,
    outline: moon.colors.border,
    error: moon.colors.danger,
  },
};
