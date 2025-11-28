// Standard steel pipe sizes with regulation volume values per 1m (from Table 3)
export const STEEL_PIPE_SIZES = [
  {
    nominalSize: "20mm", 
    display: "20mm (3/4\")",
    volumePer1m: 0.00046, // Regulation table value
    internalDiameter: 17.9,
    fittingEquivalentLength: 0.4,
  },
  {
    nominalSize: "25mm",
    display: "25mm (1\")", 
    volumePer1m: 0.00064, // Regulation table value
    internalDiameter: 21.7,
    fittingEquivalentLength: 0.5,
  },
  {
    nominalSize: "32mm",
    display: "32mm (1 1/4\")",
    volumePer1m: 0.0011, // Regulation table value
    internalDiameter: 27.8,
    fittingEquivalentLength: 0.6,
  },
  {
    nominalSize: "40mm",
    display: "40mm (1 1/2\")",
    volumePer1m: 0.0015, // Regulation table value
    internalDiameter: 35.1,
    fittingEquivalentLength: 0.7,
  },
  {
    nominalSize: "50mm",
    display: "50mm (2\")",
    volumePer1m: 0.0024, // Regulation table value
    internalDiameter: 44.2,
    fittingEquivalentLength: 0.9,
  },
  {
    nominalSize: "65mm",
    display: "65mm (2 1/2\")",
    volumePer1m: 0.0038, // Regulation table value
    internalDiameter: 57.0,
    fittingEquivalentLength: 1.1,
  },
  {
    nominalSize: "80mm",
    display: "80mm (3\")",
    volumePer1m: 0.0054, // Regulation table value
    internalDiameter: 69.9,
    fittingEquivalentLength: 1.3,
  },
  {
    nominalSize: "100mm",
    display: "100mm (4\")",
    volumePer1m: 0.009, // Regulation table value
    internalDiameter: 94.1,
    fittingEquivalentLength: 1.7,
  },
  {
    nominalSize: "125mm",
    display: "125mm (5\")",
    volumePer1m: 0.014, // Regulation table value
    internalDiameter: 119.3,
    fittingEquivalentLength: 2.1,
  },
  {
    nominalSize: "150mm",
    display: "150mm (6\")",
    volumePer1m: 0.02, // Regulation table value
    internalDiameter: 144.7,
    fittingEquivalentLength: 2.5,
  },
  {
    nominalSize: "200mm",
    display: "200mm (8\")",
    volumePer1m: 0.035, // Regulation table value
    internalDiameter: 194.7,
    fittingEquivalentLength: 3.3,
  },
  {
    nominalSize: "250mm",
    display: "250mm (10\")",
    volumePer1m: 0.053, // Regulation table value
    internalDiameter: 244.5,
    fittingEquivalentLength: 4.2,
  },
  {
    nominalSize: "300mm",
    display: "300mm (12\")",
    volumePer1m: 0.074, // Regulation table value
    internalDiameter: 294.1,
    fittingEquivalentLength: 5.0,
  },
];

// Copper pipe sizes with regulation volume values per 1m (from Table 3)
export const COPPER_PIPE_SIZES = [
  {
    nominalSize: "15mm",
    display: "15mm (1/2\") Copper",
    volumePer1m: 0.00014, // Regulation table value
    internalDiameter: 13.4,
    fittingEquivalentLength: 0.3,
  },
  {
    nominalSize: "22mm",
    display: "22mm (3/4\") Copper",
    volumePer1m: 0.00032, // Regulation table value
    internalDiameter: 20.2,
    fittingEquivalentLength: 0.4,
  },
  {
    nominalSize: "28mm",
    display: "28mm (1\") Copper",
    volumePer1m: 0.00054, // Regulation table value
    internalDiameter: 26.2,
    fittingEquivalentLength: 0.5,
  },
  {
    nominalSize: "35mm",
    display: "35mm (1 1/4\") Copper",
    volumePer1m: 0.00084, // Regulation table value
    internalDiameter: 32.6,
    fittingEquivalentLength: 0.6,
  },
  {
    nominalSize: "42mm",
    display: "42mm (1 1/2\") Copper",
    volumePer1m: 0.0012, // Regulation table value
    internalDiameter: 39.0,
    fittingEquivalentLength: 0.7,
  },
  {
    nominalSize: "54mm",
    display: "54mm (2\") Copper",
    volumePer1m: 0.0021, // Regulation table value
    internalDiameter: 51.6,
    fittingEquivalentLength: 0.9,
  },
  {
    nominalSize: "67mm",
    display: "67mm (2 1/2\") Copper",
    volumePer1m: 0.0033, // Regulation table value
    internalDiameter: 64.6,
    fittingEquivalentLength: 1.1,
  },
];

// Default export for backward compatibility
export const PIPE_SIZES = STEEL_PIPE_SIZES;
