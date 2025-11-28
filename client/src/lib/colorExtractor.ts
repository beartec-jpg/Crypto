// Color extraction utility using Canvas API
export interface ExtractedColor {
  hex: string;
  rgb: { r: number; g: number; b: number };
  count: number;
}

export async function extractColorsFromImage(imageUrl: string): Promise<ExtractedColor[]> {
  return new Promise((resolve, reject) => {
    // Add timeout to prevent hanging
    const timeout = setTimeout(() => {
      reject(new Error('Image load timeout'));
    }, 10000);
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Scale down image for faster processing
        const maxDimension = 150;
        const scale = Math.min(maxDimension / img.width, maxDimension / img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const colors = extractDominantColors(imageData);
        
        resolve(colors);
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = (error) => {
      clearTimeout(timeout);
      console.error('Image load error:', error);
      reject(new Error('Failed to load image - possibly due to CORS restrictions'));
    };
    
    img.src = imageUrl;
  });
}

function extractDominantColors(imageData: ImageData): ExtractedColor[] {
  const data = imageData.data;
  const colorMap = new Map<string, { rgb: { r: number; g: number; b: number }; count: number }>();
  
  // Sample every 4th pixel for performance
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    
    // Skip transparent/very light pixels
    if (a < 128 || (r > 240 && g > 240 && b > 240)) continue;
    
    // Group similar colors (reduce precision)
    const groupedR = Math.floor(r / 20) * 20;
    const groupedG = Math.floor(g / 20) * 20;
    const groupedB = Math.floor(b / 20) * 20;
    
    const key = `${groupedR},${groupedG},${groupedB}`;
    
    if (colorMap.has(key)) {
      colorMap.get(key)!.count++;
    } else {
      colorMap.set(key, {
        rgb: { r: groupedR, g: groupedG, b: groupedB },
        count: 1
      });
    }
  }
  
  // Convert to array and sort by frequency
  const colors = Array.from(colorMap.entries())
    .map(([, value]) => ({
      hex: rgbToHex(value.rgb.r, value.rgb.g, value.rgb.b),
      rgb: value.rgb,
      count: value.count
    }))
    .sort((a, b) => b.count - a.count);
  
  // Filter out very dark and very light colors, keep most prominent
  return colors
    .filter(color => {
      const { r, g, b } = color.rgb;
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      return brightness > 30 && brightness < 220; // Not too dark or light
    })
    .slice(0, 6); // Top 6 colors
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => {
    const hex = Math.max(0, Math.min(255, x)).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("");
}

export function getColorSuggestions(extractedColors: ExtractedColor[]): {
  primary: string;
  secondary: string;
  suggestions: ExtractedColor[];
} {
  if (extractedColors.length === 0) {
    return {
      primary: "#2563eb",
      secondary: "#64748b", 
      suggestions: []
    };
  }

  // Find best primary color (most vibrant/prominent)
  const primary = extractedColors.find(color => {
    const { r, g, b } = color.rgb;
    const saturation = getSaturation(r, g, b);
    return saturation > 0.3; // Reasonably saturated
  }) || extractedColors[0];

  // Find complementary secondary color
  const secondary = extractedColors.find(color => 
    color !== primary && isGoodSecondary(primary.rgb, color.rgb)
  ) || extractedColors[1] || { hex: "#64748b", rgb: { r: 100, g: 116, b: 139 }, count: 0 };

  return {
    primary: primary.hex,
    secondary: secondary.hex,
    suggestions: extractedColors.slice(0, 8)
  };
}

function getSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  return max === 0 ? 0 : (max - min) / max;
}

function isGoodSecondary(primary: { r: number; g: number; b: number }, secondary: { r: number; g: number; b: number }): boolean {
  // Check if colors are sufficiently different
  const distance = Math.sqrt(
    Math.pow(primary.r - secondary.r, 2) +
    Math.pow(primary.g - secondary.g, 2) +
    Math.pow(primary.b - secondary.b, 2)
  );
  
  return distance > 100; // Colors should be visually distinct
}