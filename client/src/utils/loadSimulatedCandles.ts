/**
 * Utility for loading simulated ABC Elliott Wave candle data
 * 
 * Reads CSV or JSON files produced by scripts/simulate_abc_elliott.py
 * and returns data in the frontend SimulatedCandle format.
 */

import { readFile } from 'fs/promises';
import { parse } from 'path';

/**
 * SimulatedCandle interface matching frontend shape
 * Note: label is required (empty string for non-labeled candles)
 */
export interface SimulatedCandle {
  time: number;        // epoch milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  label: string;       // Empty string if no label
}

/**
 * JSON format from simulator
 */
interface SimulatorJsonCandle {
  timestamp_ms: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  label: string;
}

/**
 * Parse CSV line into SimulatedCandle
 */
function parseCsvLine(line: string, headers: string[]): SimulatedCandle | null {
  const values = line.split(',');
  if (values.length < headers.length) {
    return null;
  }
  
  const candle: SimulatedCandle = {
    time: parseInt(values[0], 10),
    open: parseFloat(values[1]),
    high: parseFloat(values[2]),
    low: parseFloat(values[3]),
    close: parseFloat(values[4]),
    label: '',  // Default empty label
  };
  
  // Optional volume
  if (values.length > 5 && values[5]) {
    candle.volume = parseInt(values[5], 10);
  }
  
  // Optional label (overwrite default if present)
  if (values.length > 6 && values[6]) {
    candle.label = values[6];
  }
  
  return candle;
}

/**
 * Parse CSV content into SimulatedCandle array
 */
function parseCsv(content: string): SimulatedCandle[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) {
    return [];
  }
  
  // First line is header
  const headers = lines[0].split(',');
  const candles: SimulatedCandle[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const candle = parseCsvLine(lines[i], headers);
    if (candle) {
      candles.push(candle);
    }
  }
  
  return candles;
}

/**
 * Parse JSON content into SimulatedCandle array
 */
function parseJson(content: string): SimulatedCandle[] {
  const jsonData: SimulatorJsonCandle[] = JSON.parse(content);
  
  return jsonData.map(candle => ({
    time: candle.timestamp_ms,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    label: candle.label || ''  // Convert undefined/empty to empty string
  }));
}

/**
 * Load simulated candles from a file
 * 
 * @param filePath - Path to CSV or JSON file
 * @returns Promise resolving to array of SimulatedCandle
 * 
 * @example
 * ```typescript
 * const candles = await loadSimulatedCandles('./data/abc_zigzag.json');
 * console.log(`Loaded ${candles.length} candles`);
 * ```
 */
export async function loadSimulatedCandles(filePath: string): Promise<SimulatedCandle[]> {
  try {
    const content = await readFile(filePath, 'utf-8');
    
    // Check file extension
    const { ext } = parse(filePath);
    
    // Prefer JSON parsing if extension is .json
    if (ext.toLowerCase() === '.json') {
      try {
        return parseJson(content);
      } catch (jsonError) {
        // If JSON parsing fails, try CSV as fallback
        console.warn('JSON parsing failed, attempting CSV fallback');
        return parseCsv(content);
      }
    }
    
    // Try JSON parse first (more structured), then CSV fallback
    try {
      return parseJson(content);
    } catch (jsonError) {
      // Not JSON, try CSV
      return parseCsv(content);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to load simulated candles: ${errorMessage}`);
  }
}

/**
 * Load simulated candles synchronously (for Node.js environments)
 * 
 * @param content - File content as string
 * @param format - Explicit format: 'json' | 'csv' | 'auto' (default: 'auto')
 * @returns Array of SimulatedCandle
 */
export function loadSimulatedCandlesSync(
  content: string,
  format: 'json' | 'csv' | 'auto' = 'auto'
): SimulatedCandle[] {
  if (format === 'json') {
    return parseJson(content);
  }
  
  if (format === 'csv') {
    return parseCsv(content);
  }
  
  // Auto-detect: try JSON first, then CSV
  try {
    return parseJson(content);
  } catch {
    return parseCsv(content);
  }
}

/**
 * Validate that candles have proper OHLC relationships
 */
export function validateCandles(candles: SimulatedCandle[]): boolean {
  for (const candle of candles) {
    if (candle.high < Math.max(candle.open, candle.close)) {
      return false;
    }
    if (candle.low > Math.min(candle.open, candle.close)) {
      return false;
    }
  }
  return true;
}
