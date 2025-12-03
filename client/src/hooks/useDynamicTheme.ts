import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

interface CompanyBranding {
  companyName?: string;
  companyEmail?: string;
  companyWebsite?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

// Convert hex to HSL for CSS variables
function hexToHsl(hex: string): string {
  if (!hex || !hex.startsWith('#')) return '210 83% 53%'; // Default blue
  
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
      default: h = 0;
    }
    h /= 6;
  }

  h = Math.round(h * 360);
  s = Math.round(s * 100);
  l = Math.round(l * 100);

  return `${h} ${s}% ${l}%`;
}

// Generate complementary colors for better theming
function generateThemeColors(primaryHex: string, secondaryHex?: string) {
  const primaryHsl = hexToHsl(primaryHex);
  const secondaryHsl = secondaryHex ? hexToHsl(secondaryHex) : '210 40% 98%'; // Default light gray

  // Extract HSL values for calculations
  const [primaryH, primaryS, primaryL] = primaryHsl.split(' ').map(v => parseInt(v));
  const [_secondaryH, _secondaryS, secondaryL] = secondaryHsl.split(' ').map(v => parseInt(v));

  return {
    primary: primaryHsl,
    primaryForeground: primaryL > 50 ? '222.2 84% 4.9%' : '0 0% 100%',
    secondary: secondaryHsl,
    secondaryForeground: secondaryL > 50 ? '222.2 84% 4.9%' : '210 40% 98%',
    accent: `${primaryH} ${Math.max(primaryS - 20, 10)}% ${Math.min(primaryL + 30, 98)}%`,
    accentForeground: '222.2 84% 4.9%',
    ring: primaryHsl,
    sidebarPrimary: primaryHsl,
    sidebarPrimaryForeground: primaryL > 50 ? '222.2 84% 4.9%' : '0 0% 100%',
    sidebarAccent: `${primaryH} ${Math.max(primaryS - 30, 10)}% ${Math.min(primaryL + 40, 98)}%`,
    sidebarAccentForeground: '222.2 84% 4.9%',
    sidebarRing: primaryHsl,
  };
}

export function useDynamicTheme(options?: { enabled?: boolean }) {
  const { data: branding } = useQuery<CompanyBranding>({
    queryKey: ['/api/company-branding'],
    retry: false,
    enabled: options?.enabled ?? true,
  });

  useEffect(() => {
    if (!branding?.primaryColor) return;

    const themeColors = generateThemeColors(branding.primaryColor, branding.secondaryColor);
    const root = document.documentElement;

    // Update CSS custom properties
    root.style.setProperty('--primary', themeColors.primary);
    root.style.setProperty('--primary-foreground', themeColors.primaryForeground);
    root.style.setProperty('--secondary', themeColors.secondary);
    root.style.setProperty('--secondary-foreground', themeColors.secondaryForeground);
    root.style.setProperty('--accent', themeColors.accent);
    root.style.setProperty('--accent-foreground', themeColors.accentForeground);
    root.style.setProperty('--ring', themeColors.ring);
    
    // Sidebar colors
    root.style.setProperty('--sidebar-primary', themeColors.sidebarPrimary);
    root.style.setProperty('--sidebar-primary-foreground', themeColors.sidebarPrimaryForeground);
    root.style.setProperty('--sidebar-accent', themeColors.sidebarAccent);
    root.style.setProperty('--sidebar-accent-foreground', themeColors.sidebarAccentForeground);
    root.style.setProperty('--sidebar-ring', themeColors.sidebarRing);

    // Chart colors using primary as base
    root.style.setProperty('--chart-1', themeColors.primary);
    
  }, [branding?.primaryColor, branding?.secondaryColor]);

  return branding;
}