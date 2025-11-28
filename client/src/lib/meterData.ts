// Gas meter specifications with internal volume and cyclic volume
export const METER_TYPES = [
  {
    type: "G4/U6",
    display: "G4/U6",
    internalVolume: 0.008, // m³
    cyclicVolume: 0.002, // m³
  },
  {
    type: "U16",
    display: "U16",
    internalVolume: 0.025, // m³
    cyclicVolume: 0.006, // m³
  },
  {
    type: "U25",
    display: "U25",
    internalVolume: 0.037, // m³
    cyclicVolume: 0.01, // m³
  },
  {
    type: "U40",
    display: "U40",
    internalVolume: 0.067, // m³
    cyclicVolume: 0.02, // m³
  },
  {
    type: "U65",
    display: "U65",
    internalVolume: 0.1, // m³
    cyclicVolume: 0.25, // m³
  },
  {
    type: "U100",
    display: "U100",
    internalVolume: 0.182, // m³
    cyclicVolume: 0.57, // m³
  },
  {
    type: "U160",
    display: "U160",
    internalVolume: 0.304, // m³
    cyclicVolume: 0.71, // m³
  },
];