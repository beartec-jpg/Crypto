import type { CalculationRequest } from "@shared/schema";

// Standard pipe internal diameters (BS EN 10255 medium series) in mm
const PIPE_INTERNAL_DIAMETERS: Record<string, number> = {
  '15mm': 13.2,
  '20mm': 17.9,
  '25mm': 21.7,
  '32mm': 27.8,
  '40mm': 35.1,
  '50mm': 44.2,
  '65mm': 57.0,
  '80mm': 69.9,
  '100mm': 94.1,
  '125mm': 119.3,
  '150mm': 144.7,
  '200mm': 194.7,
  '250mm': 244.5,
  '300mm': 294.1,
};

// Equivalent lengths for fittings (meters per fitting)
const FITTING_EQUIVALENT_LENGTHS: Record<string, number> = {
  '15mm': 0.3, '20mm': 0.4, '25mm': 0.5, '32mm': 0.6,
  '40mm': 0.7, '50mm': 0.9, '65mm': 1.1, '80mm': 1.3,
  '100mm': 1.7, '125mm': 2.1, '150mm': 2.5, '200mm': 3.3,
  '250mm': 4.2, '300mm': 5.0,
};

// Industrial Purge Table - Based on largest pipe diameter
const INDUSTRIAL_PURGE_TABLE: Record<number, { flowRate: number, purgePointBore: number }> = {
  20: { flowRate: 0.7, purgePointBore: 20 },
  25: { flowRate: 1.0, purgePointBore: 20 },
  32: { flowRate: 1.7, purgePointBore: 20 },
  40: { flowRate: 2.5, purgePointBore: 20 },
  50: { flowRate: 4.5, purgePointBore: 25 },
  80: { flowRate: 11, purgePointBore: 25 },
  100: { flowRate: 20, purgePointBore: 40 },
  125: { flowRate: 30, purgePointBore: 40 },
  150: { flowRate: 38, purgePointBore: 40 },
  200: { flowRate: 141, purgePointBore: 80 },
  250: { flowRate: 216, purgePointBore: 80 },
  300: { flowRate: 473, purgePointBore: 150 },
  400: { flowRate: 575, purgePointBore: 150 },
  450: { flowRate: 1230, purgePointBore: 150 },
  600: { flowRate: 2390, purgePointBore: 200 },
  750: { flowRate: 3440, purgePointBore: 200 },
  900: { flowRate: 6960, purgePointBore: 300 },
  1200: { flowRate: 6960, purgePointBore: 300 },
};

// Commercial Purge Table B13 - Based on largest pipe diameter  
const COMMERCIAL_PURGE_TABLE: Record<number, { flowRate: number, purgePointBore: number, purgeHoseBore: number }> = {
  20: { flowRate: 0.7, purgePointBore: 20, purgeHoseBore: 20 },
  25: { flowRate: 1.0, purgePointBore: 20, purgeHoseBore: 20 },
  32: { flowRate: 1.7, purgePointBore: 20, purgeHoseBore: 20 },
  40: { flowRate: 2.5, purgePointBore: 20, purgeHoseBore: 20 },
  50: { flowRate: 4.5, purgePointBore: 25, purgeHoseBore: 40 },
  80: { flowRate: 11, purgePointBore: 25, purgeHoseBore: 40 },
  100: { flowRate: 20, purgePointBore: 25, purgeHoseBore: 40 },
  125: { flowRate: 30, purgePointBore: 40, purgeHoseBore: 50 },
  150: { flowRate: 38, purgePointBore: 40, purgeHoseBore: 50 },
};

export class CalculationService {
  /**
   * Calculate test pressure based on operation type and MOP
   */
  static calculateTestPressure(operationType: string, mop: number, mip?: number, installationType?: string, calculatorType?: string): number {
    switch (operationType) {
      case "Strength Test":
        // Different formulas for Industrial vs Commercial calculators
        if (calculatorType === "industrial") {
          // Industrial (User's Original): STP = MAX(1.5 × MOP, 1.1 × MIP)
          // No minimum values, no complex ranges - user's exact specification
          if (mip) {
            return Math.max(mop * 1.5, mip * 1.1);
          } else {
            return mop * 1.5; // Simple 1.5x MOP if no MIP
          }
        } else {
          // Commercial: Different calculation with minimum values
          if (mip) {
            return Math.max(mip * 1.1, mop * 2.5, 82.5);
          } else {
            return Math.max(mop * 2.5, 82.5);
          }
        }
      case "Tightness Test":
        // For existing equipment, test pressure equals operating pressure
        // For new installations, test pressure = OP (Operating Pressure - minimum 20 mbar)
        if (installationType === "existing" || installationType === "Existing") {
          return Math.max(mop, 20); // Test pressure = MOP for existing equipment
        } else {
          return Math.max(mop, 20); // Test pressure = OP for new installations (same calculation per IGE/UP/1)
        }
      default:
        return 0;
    }
  }
  
  /**
   * Calculate stabilization time and max pressure drop for strength testing
   */
  static calculateStrengthTestParams(mop: number): { stabilizationTime: number, maxDropPercent: number } {
    // Stabilization time based on MOP (max operating pressure)
    const stabilizationTime = mop < 100 ? 5 : 10;
    return { 
      stabilizationTime, 
      maxDropPercent: 20 // Fixed 20% failure threshold for strength tests
    };
  }

  /**
   * Get Maximum Permissible Leakage Rate (MPLR) for zone type
   */
  static getMPLR(zoneType: string, installationType?: string): number {
    // New installation or extension regardless of location is always 0.0014
    if (installationType === "new" || installationType === "New Installation" || installationType === "New") {
      return 0.0014;
    }
    
    // For existing installations, use zone-specific values
    switch (zoneType) {
      case "Type A":
        return 0.0014; // m³/hr (inadequately ventilated)
      case "Type B":
        return 0.0005; // m³/hr (ventilated internal <60 m³)
      case "Type C":
        return 0.03;   // m³/hr (ventilated >60 m³ or external/underground)
      default:
        return 0.0014; // Default to most restrictive
    }
  }

  /**
   * Calculate original TTD value for leak rate calculations (without ×60 and without 2-minute minimum)
   */
  static calculateOriginalTTD(zoneType: string, installationVolume: number, gaugeType: string = "", testMedium: string = "", roomVolume?: number): number {
    const grm = this.calculateGRM(gaugeType); // Gauge Readable Movement (mbar)
    const f1 = testMedium === "Air" ? 67 : 42; // Factor from tables 6/9
    
    switch (zoneType) {
      case "Type A":
        // TTD = GRM × IV × F1 (original formula without ×60)
        return grm * installationVolume * f1;
      case "Type B":
        // TTD = 2.8 × GRM × IV × (1/RV) × F1 (original formula without ×60)
        const rv = roomVolume || 30; // Default room volume if not provided
        return 2.8 * grm * installationVolume * (1/rv) * f1;
      case "Type C":
        // TTD = 0.047 × GRM × IV × F1 (original formula without ×60)
        return 0.047 * grm * installationVolume * f1;
      default:
        return grm * installationVolume * f1;
    }
  }

  /**
   * Calculate Test Time Duration (TTD) using proper formulas for each zone type
   * Returns exact time in seconds for accuracy
   */
  static calculateTestDuration(zoneType: string, installationVolume: number, gaugeType: string = "", testMedium: string = "", roomVolume?: number): number {
    const grm = this.calculateGRM(gaugeType); // Gauge Readable Movement (mbar)
    const f1 = testMedium === "Air" ? 67 : 42; // Factor from tables 6/9
    
    let ttdSeconds: number;
    
    switch (zoneType) {
      case "Type A":
        // TTD = GRM × IV × F1 × 60 (result in seconds)
        ttdSeconds = grm * installationVolume * f1 * 60;
        break;
      case "Type B":
        // TTD = 2.8 × GRM × IV × (1/RV) × F1 × 60 (result in seconds)
        const rv = roomVolume || 30; // Default room volume if not provided
        ttdSeconds = 2.8 * grm * installationVolume * (1/rv) * f1 * 60;
        break;
      case "Type C":
        // TTD = 0.047 × GRM × IV × F1 × 60 (result in seconds)
        ttdSeconds = 0.047 * grm * installationVolume * f1 * 60;
        break;
      default:
        ttdSeconds = grm * installationVolume * f1 * 60;
    }

    // Apply minimum 2-minute test time (120 seconds)
    return Math.max(ttdSeconds, 120); // Keep full precision until final display
  }

  /**
   * Format seconds as mm:ss
   */
  static formatTimeAsMinutesSeconds(seconds: number): string {
    const roundedSeconds = Math.round(seconds); // Only round at the final display step
    const minutes = Math.floor(roundedSeconds / 60);
    const remainingSeconds = roundedSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /**
   * Calculate Gauge Readable Movement (GRM) based on gauge type
   */
  static calculateGRM(gaugeType: string): number {
    return (gaugeType === "Water Gauge" || gaugeType === "water" || gaugeType === "electronic05") ? 0.5 : 0.1; // mbar
  }
  
  /**
   * Format GRM with correct decimal places
   */
  static formatGRM(gaugeType: string): string {
    return (gaugeType === "Water Gauge" || gaugeType === "water" || gaugeType === "electronic05") ? "0.5" : "0.10"; // 0.5 GRM: 1 decimal, 0.1 GRM: 2 decimals
  }

  /**
   * Calculate actual leakage rate when drop > GRM
   * Uses original TTD formula: F3 × gm × IV / ttd (where ttd is original calculation without ×60)
   */
  static calculateActualLeakageRate(measuredDrop: number, installationVolume: number, zoneType: string, gaugeType: string, testMedium: string, roomVolume?: number): number {
    const f3 = testMedium === "Air" ? 0.094 : 0.059; // Leakage factor from tables
    const originalTTD = this.calculateOriginalTTD(zoneType, installationVolume, gaugeType, testMedium, roomVolume);
    return (f3 * measuredDrop * installationVolume) / originalTTD; // m³/hr
  }

  /**
   * Calculate maximum permitted pressure drop based on MPLR and leak rate formula
   */
  static calculateMaxPressureDrop(operationType: string, testPressure: number, zoneType: string, gaugeType: string, installationType?: string, installationVolume?: number, testMedium?: string, roomVolume?: number): number {
    console.log('🔧 calculateMaxPressureDrop inputs:', { operationType, testPressure, zoneType, gaugeType, installationType, installationVolume, testMedium, roomVolume });
    
    if (operationType === "Strength Test") {
      return 0; // No pressure drop permitted for strength tests
    }
    
    // For tightness tests, max pressure drop equals the GRM value
    const grm = this.calculateGRM(gaugeType);
    console.log('🔧 Using GRM as max pressure drop:', grm);
    return grm;
  }
  /**
   * Calculate pipe volume in cubic meters
   */
  static calculatePipeVolume(internalDiameterMm: number, lengthM: number): number {
    const radiusM = (internalDiameterMm / 2) / 1000; // Convert mm to meters
    const volumeM3 = Math.PI * Math.pow(radiusM, 2) * lengthM;
    return volumeM3; // Return in m³
  }

  /**
   * Calculate fitting equivalent volume
   */
  static calculateFittingVolume(nominalSize: string, quantity: number): number {
    const internalDiameter = PIPE_INTERNAL_DIAMETERS[nominalSize];
    const equivalentLength = (FITTING_EQUIVALENT_LENGTHS[nominalSize] || 0) * quantity;
    
    if (!internalDiameter) return 0;
    
    return this.calculatePipeVolume(internalDiameter, equivalentLength);
  }

  /**
   * Calculate purge data based on largest pipe size in the system
   * Returns flow rate and purge point bore requirements per IGE/UP/1 tables
   */
  static calculatePurgeData(pipeConfigurations: any[], calculatorType: string = "commercial"): {
    flowRate: number;
    purgePointBore: number;
    purgeHoseBore?: number;
    largestPipeDiameter: number;
  } {
    // Find largest pipe diameter in mm
    let maxDiameter = 0;
    
    console.log('🔧 CALCULATING LARGEST PIPE - Input:', pipeConfigurations);
    
    for (const pipe of pipeConfigurations) {
      if (pipe.nominalSize) {
        const diameter = parseInt(pipe.nominalSize.replace('mm', ''));
        console.log(`🔧 Pipe: ${pipe.nominalSize} -> ${diameter}mm`);
        if (diameter > maxDiameter) {
          maxDiameter = diameter;
        }
      }
    }
    
    console.log('🔧 LARGEST DIAMETER FOUND:', maxDiameter);
    
    // Use appropriate table based on calculator type
    const purgeTable = calculatorType === "industrial" ? INDUSTRIAL_PURGE_TABLE : COMMERCIAL_PURGE_TABLE;
    
    // Find the correct entry for the largest diameter
    let purgeData = purgeTable[maxDiameter];
    
    // If exact match not found, find the nearest larger size
    if (!purgeData) {
      const availableSizes = Object.keys(purgeTable).map(Number).sort((a, b) => a - b);
      const nextLargerSize = availableSizes.find(size => size >= maxDiameter);
      if (nextLargerSize) {
        purgeData = purgeTable[nextLargerSize];
      } else {
        // Default to largest available size
        const largestSize = availableSizes[availableSizes.length - 1];
        purgeData = purgeTable[largestSize];
      }
    }
    
    return {
      flowRate: purgeData?.flowRate || 0.7, // Default minimum
      purgePointBore: purgeData?.purgePointBore || 20,
      purgeHoseBore: calculatorType === "commercial" ? (purgeData as any)?.purgeHoseBore : undefined,
      largestPipeDiameter: maxDiameter
    };
  }

  /**
   * Legacy function for backward compatibility
   */
  static calculateFlowRate(pipeConfigurations: any[]): number {
    return this.calculatePurgeData(pipeConfigurations, "commercial").flowRate;
  }

  /**
   * Calculate maximum purge time using IGE/UP/1 formula: Max PT (sec) = PV(m³) × 3600 / Qp (m³ h⁻¹)
   * Returns time in seconds for accuracy
   */
  static calculateMaximumPurgeTime(purgeVolumeM3: number, flowRateM3h: number): number {
    // Formula: Max PT (sec) = PV(m³) × 3600 / Qp (m³ h⁻¹)
    const timeSeconds = (purgeVolumeM3 * 3600) / flowRateM3h;
    return timeSeconds;
  }

  /**
   * Check compliance with IGE/UP/1 standards
   */
  static checkCompliance(request: CalculationRequest, calculation: any): {
    isCompliant: boolean;
    standard: string;
    notes: string[];
    nextSteps: string[];
  } {
    const notes: string[] = [];
    const nextSteps: string[] = [];
    let isCompliant = true;

    // Check MOP compliance (now in mbar)
    const mop = parseFloat(String(request.project.maxOperatingPressure || "0"));
    if (mop > 16000) {
      isCompliant = false;
      notes.push("Maximum Operating Pressure exceeds 16000 mbar (16 bar) limit for IGE/UP/1 Edition 2");
    } else if (mop <= 16000) {
      notes.push("MOP complies with IGE/UP/1 Edition 2 (≤ 16000 mbar)");
    }

    // Check total volume for standard selection
    const totalVolume = parseFloat(calculation.totalSystemVolume);
    if (totalVolume <= 1.0 && mop <= 40) { // ≤ 1m³ and ≤ 40 mbar
      notes.push("Installation qualifies for IGE/UP/1A (small installations) - MOP ≤ 40 mbar and volume ≤ 1m³");
    } else if (totalVolume <= 1.0) {
      notes.push("Installation may qualify for IGE/UP/1A if MOP reduced to ≤ 40 mbar");
    }

    // Standard compliance checks
    notes.push("IGE/UP/1 Edition 2 +A: 2005 applicable");
    notes.push("Commercial installation requirements apply");

    // Required next steps
    nextSteps.push("Complete DSEAR risk assessment under Dangerous Substances and Explosive Atmospheres Regulations");
    nextSteps.push("Verify purge point locations per IGEM/UP/2 requirements");
    nextSteps.push("Prepare emergency procedures for purging operations");
    nextSteps.push("Document competency records for Gas Safe registered personnel");
    nextSteps.push("Ensure purge connections minimum 12mm bore, at least 25% of main pipe size");

    return {
      isCompliant,
      standard: "IGE/UP/1 Edition 2 +A: 2005",
      notes,
      nextSteps,
    };
  }

  /**
   * Perform full calculation
   */
  static performCalculation(request: CalculationRequest, calculatorType?: string) {
    let totalPipeVolume = 0;
    let totalFittingsVolume = 0;
    let totalMeterVolume = 0;
    let totalMeterCyclicVolume = 0;
    let largestDiameter = 0;

    // Legacy gas meter volume field is no longer used - meters are now configured separately

    const processedPipes = request.pipeConfigurations.map(pipe => {
      const internalDiameter = PIPE_INTERNAL_DIAMETERS[pipe.nominalSize];
      if (!internalDiameter) {
        throw new Error(`Unknown pipe size: ${pipe.nominalSize}`);
      }

      // Use regulation table volume per 1m
      const pipeVolumeTableValues = {
        "20mm": 0.00046,  // 3/4"
        "25mm": 0.00064,  // 1"
        "32mm": 0.0011,   // 1 1/4"
        "40mm": 0.0015,   // 1 1/2"
        "50mm": 0.0024,   // 2"
        "65mm": 0.0038,   // 2 1/2"
        "80mm": 0.0054,   // 3"
        "100mm": 0.009,   // 4"
        "125mm": 0.014,   // 5"
        "150mm": 0.02,    // 6"
        "200mm": 0.035,   // 8"
        "250mm": 0.053,   // 10"
        "300mm": 0.074,   // 12"
      };

      const volumePer1m = pipeVolumeTableValues[pipe.nominalSize as keyof typeof pipeVolumeTableValues];
      if (!volumePer1m) {
        throw new Error(`No regulation volume data for pipe size: ${pipe.nominalSize}`);
      }

      const pipeVolume = volumePer1m * pipe.length;
      // New regulation: Add 10% to pipework for fittings
      const totalVolume = pipeVolume * 1.1;

      totalPipeVolume += pipeVolume;
      totalFittingsVolume += pipeVolume * 0.1; // 10% of pipe volume for fittings
      largestDiameter = Math.max(largestDiameter, internalDiameter);

      return {
        nominalSize: pipe.nominalSize,
        length: pipe.length,
        fittingsQuantity: 0, // No longer used
        internalDiameter,
        volume: totalVolume,
      };
    });

    // Process meter configurations if provided
    const processedMeters = request.meterConfigurations?.map((meter: any) => {
      // Meter specifications
      const meterSpecs: Record<string, { internalVolume: number; cyclicVolume: number }> = {
        "G4/U6": { internalVolume: 0.008, cyclicVolume: 0.002 },
        "U16": { internalVolume: 0.025, cyclicVolume: 0.006 },
        "U25": { internalVolume: 0.037, cyclicVolume: 0.01 },
        "U40": { internalVolume: 0.067, cyclicVolume: 0.02 },
        "U65": { internalVolume: 0.1, cyclicVolume: 0.25 },
        "U100": { internalVolume: 0.182, cyclicVolume: 0.57 },
        "U160": { internalVolume: 0.304, cyclicVolume: 0.71 },
      };

      const spec = meterSpecs[meter.meterType];
      if (!spec) {
        throw new Error(`Unknown meter type: ${meter.meterType}`);
      }

      const totalInternal = spec.internalVolume * meter.quantity;
      const totalCyclic = spec.cyclicVolume * meter.quantity;

      totalMeterVolume += totalInternal;
      totalMeterCyclicVolume += totalCyclic;

      return {
        meterType: meter.meterType,
        quantity: meter.quantity,
        internalVolume: spec.internalVolume,
        cyclicVolume: spec.cyclicVolume,
        totalInternalVolume: totalInternal,
        totalCyclicVolume: totalCyclic,
      };
    }) || [];

    const totalSystemVolume = totalPipeVolume + totalFittingsVolume + totalMeterVolume;
    const operationType = request.project.operationType || "Purge";
    const mop = parseFloat(String(request.project.maxOperatingPressure || "0"));
    
    let calculation: any = {
      totalPipeVolume: totalPipeVolume.toFixed(4),
      totalFittingsVolume: totalFittingsVolume.toFixed(4),
      totalMeterVolume: totalMeterVolume > 0 ? totalMeterVolume.toFixed(4) : null,
      totalMeterCyclicVolume: totalMeterCyclicVolume > 0 ? totalMeterCyclicVolume.toFixed(4) : null,
      totalSystemVolume: totalSystemVolume.toFixed(4),
    };

    if (operationType === "Purge") {
      // Calculate purge hose/stack volume
      let totalPurgeVolume = 0;
      if ((request as any).purgeConfigurations) {
        for (const purgeConfig of (request as any).purgeConfigurations) {
          const pipeVolumeTableValues = {
            "20mm": 0.00046,  // 3/4"
            "25mm": 0.00064,  // 1"
            "40mm": 0.0015,   // 1.5"
            "50mm": 0.0024,   // 2"
            "100mm": 0.009,   // 4"
          };
          
          const volumePer1m = pipeVolumeTableValues[purgeConfig.nominalSize as keyof typeof pipeVolumeTableValues];
          if (volumePer1m) {
            totalPurgeVolume += volumePer1m * purgeConfig.length;
          }
        }
      }
      
      // Calculate purge data based on largest pipe size and calculator type
      const purgeData = this.calculatePurgeData(request.pipeConfigurations, calculatorType);
      console.log('🔧 PURGE DATA DEBUG:', purgeData);
      
      // NEW FORMULA: PV = (IV pipe + fitting(10%) + IV meter + IV purge) × 1.5
      const safetyFactor = 1.5;
      const pipeAndFittingsVolume = totalPipeVolume + totalFittingsVolume; // Pipe + 10% fittings
      const meterVolume = totalMeterVolume; // Internal meter volume
      const requiredPurgeVolume = (pipeAndFittingsVolume + meterVolume + totalPurgeVolume) * safetyFactor;
      
      // Use correct flow rate from purge table and IGE/UP/1 formula
      const maximumPurgeTimeSeconds = this.calculateMaximumPurgeTime(requiredPurgeVolume, purgeData.flowRate);
      const maximumPurgeTimeFormatted = this.formatTimeAsMinutesSeconds(maximumPurgeTimeSeconds);
      
      calculation = {
        ...calculation,
        totalPurgeVolume: totalPurgeVolume.toFixed(4),
        requiredPurgeVolume: requiredPurgeVolume.toFixed(4),
        minimumFlowRate: purgeData.flowRate.toFixed(2),
        maximumPurgeTime: maximumPurgeTimeFormatted,
        maximumPurgeTimeSeconds: Math.round(maximumPurgeTimeSeconds),
        purgePointBore: purgeData.purgePointBore,
        purgeHoseBore: purgeData.purgeHoseBore,
        largestPipeDiameter: purgeData.largestPipeDiameter,
      };
    } else {
      // Test calculations  
      // Also calculate purge data for test operations to get largest pipe diameter
      const purgeData = this.calculatePurgeData(request.pipeConfigurations, calculatorType);
      
      const mip = request.project.maxIncidentalPressure ? parseFloat(String(request.project.maxIncidentalPressure)) : undefined;
      const testPressure = this.calculateTestPressure(operationType, mop, mip, request.project.installationType, calculatorType);
      
      let testDuration: number;
      let testDurationFormatted: string;
      let maxPressureDrop: string | null;
      let mplr: string | null;
      
      if (operationType === "Strength Test") {
        // Strength test: fixed 5-minute test duration
        testDuration = 300; // 5 minutes = 300 seconds
        testDurationFormatted = "05:00";
        maxPressureDrop = null; // No GRM for strength tests
        mplr = null; // No MPLR for strength tests
      } else {
        // Tightness test: calculated duration based on zone type and volume
        const roomVolume = request.project.roomVolume ? parseFloat(String(request.project.roomVolume)) : undefined;
        // Use rounded volume for consistent calculations (4 decimal places to match display)
        const roundedSystemVolume = Math.round(totalSystemVolume * 10000) / 10000;
        testDuration = this.calculateTestDuration(request.project.zoneType || "Type A", roundedSystemVolume, request.project.gaugeType || "Electronic Gauge", request.project.testMedium || "Gas", roomVolume);
        testDurationFormatted = this.formatTimeAsMinutesSeconds(testDuration);
        
        // Calculate proper max pressure drop based on MPLR and leak rate formula
        const mplrValue = this.getMPLR(request.project.zoneType || "Type A", request.project.installationType);
        const maxPressureDropValue = this.calculateMaxPressureDrop(
          operationType, 
          testPressure, 
          request.project.zoneType || "Type A", 
          request.project.gaugeType || "Electronic Gauge",
          request.project.installationType,
          roundedSystemVolume,
          request.project.testMedium || "Gas",
          roomVolume
        );
        
        maxPressureDrop = maxPressureDropValue ? maxPressureDropValue.toFixed(2) : "0.00";
        mplr = mplrValue ? mplrValue.toFixed(4) : "0.0000";
      }
      
      calculation = {
        ...calculation,
        testPressure: testPressure.toFixed(1),
        testDuration: testDurationFormatted,
        testDurationSeconds: Math.round(testDuration), // Round to integer for database
        maxPressureDrop,
        mplr,
        testResult: "PENDING", // Will be updated when actual pressure drop is entered
        actualPressureDrop: null,
        actualLeakageRate: null,
        largestPipeDiameter: purgeData.largestPipeDiameter, // Include largest pipe diameter for all calculations
        ...(operationType === "Strength Test" && {
          stabilizationTime: this.calculateStrengthTestParams(mop).stabilizationTime,
          maxPressureDropPercent: this.calculateStrengthTestParams(mop).maxDropPercent.toFixed(1),
        }),
      };
    }

    const compliance = this.checkCompliance(request, calculation);

    return {
      calculation: {
        ...calculation,
        isCompliant: compliance.isCompliant,
        complianceNotes: {
          standard: compliance.standard,
          notes: compliance.notes,
          nextSteps: compliance.nextSteps,
        },
      },
      processedPipes,
      processedMeters: processedMeters.length > 0 ? processedMeters : undefined,
      compliance,
    };
  }
}
