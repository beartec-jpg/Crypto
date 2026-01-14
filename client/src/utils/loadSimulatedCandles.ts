// client/src/utils/loadSimulatedCandles.ts
// Loader for simulated ABC Elliott wave candles from CSV or JSON files

export interface SimulatedCandle {
  time: number; // milliseconds (epoch timestamp)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  label?: string;
}

/**
 * Load simulated candles from a JSON or CSV file.
 * Prefers JSON for .json extension, otherwise tries JSON then falls back to CSV.
 * 
 * @param filePath - Path or URL to the simulated candles file
 * @returns Promise resolving to array of SimulatedCandle objects
 */
export async function loadSimulatedCandles(filePath: string): Promise<SimulatedCandle[]> {
  const isJsonFile = filePath.endsWith('.json');
  
  try {
    const response = await fetch(filePath);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch ${filePath}: ${response.status} ${response.statusText}`);
    }
    
    const text = await response.text();
    
    // Try JSON first for .json files, or if content looks like JSON
    if (isJsonFile || text.trim().startsWith('[') || text.trim().startsWith('{')) {
      try {
        return parseJSON(text);
      } catch (jsonError) {
        if (isJsonFile) {
          throw jsonError; // If it's a .json file, don't fall back to CSV
        }
        // Otherwise, try CSV as fallback
        console.warn('JSON parse failed, trying CSV format...', jsonError);
      }
    }
    
    // Try CSV format
    return parseCSV(text);
    
  } catch (error) {
    console.error('Failed to load simulated candles:', error);
    throw error;
  }
}

/**
 * Parse JSON format simulated candles.
 * Expected format: array of objects with timestamp_ms, open, high, low, close, label fields.
 */
function parseJSON(text: string): SimulatedCandle[] {
  const data = JSON.parse(text);
  
  if (!Array.isArray(data)) {
    throw new Error('JSON data must be an array');
  }
  
  return data.map((item, index) => {
    // Support both timestamp_ms and time fields
    const time = item.timestamp_ms || item.time;
    
    if (typeof time !== 'number') {
      throw new Error(`Invalid timestamp at index ${index}: ${time}`);
    }
    
    if (typeof item.open !== 'number' || typeof item.high !== 'number' ||
        typeof item.low !== 'number' || typeof item.close !== 'number') {
      throw new Error(`Invalid OHLC data at index ${index}`);
    }
    
    return {
      time,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume,
      label: item.label || undefined,
    };
  });
}

/**
 * Parse CSV format simulated candles.
 * Expected format: timestamp_ms,open,high,low,close,label
 */
function parseCSV(text: string): SimulatedCandle[] {
  const lines = text.trim().split('\n');
  
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header and one data row');
  }
  
  // Parse header
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const timeIdx = header.findIndex(h => h === 'timestamp_ms' || h === 'time');
  const openIdx = header.indexOf('open');
  const highIdx = header.indexOf('high');
  const lowIdx = header.indexOf('low');
  const closeIdx = header.indexOf('close');
  const labelIdx = header.indexOf('label');
  const volumeIdx = header.indexOf('volume');
  
  if (timeIdx === -1 || openIdx === -1 || highIdx === -1 || lowIdx === -1 || closeIdx === -1) {
    throw new Error('CSV must have timestamp_ms (or time), open, high, low, and close columns');
  }
  
  // Parse data rows
  return lines.slice(1).map((line, index) => {
    const fields = line.split(',').map(f => f.trim());
    
    const time = parseFloat(fields[timeIdx]);
    const open = parseFloat(fields[openIdx]);
    const high = parseFloat(fields[highIdx]);
    const low = parseFloat(fields[lowIdx]);
    const close = parseFloat(fields[closeIdx]);
    
    if (isNaN(time) || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
      throw new Error(`Invalid numeric data at row ${index + 2}`);
    }
    
    const candle: SimulatedCandle = {
      time,
      open,
      high,
      low,
      close,
    };
    
    if (labelIdx !== -1 && fields[labelIdx]) {
      candle.label = fields[labelIdx];
    }
    
    if (volumeIdx !== -1 && fields[volumeIdx]) {
      const volume = parseFloat(fields[volumeIdx]);
      if (!isNaN(volume)) {
        candle.volume = volume;
      }
    }
    
    return candle;
  });
}

/**
 * Load simulated candles from inline data (for testing or embedded scenarios).
 */
export function loadSimulatedCandlesFromData(data: any[]): SimulatedCandle[] {
  if (!Array.isArray(data)) {
    throw new Error('Data must be an array');
  }
  
  return data.map((item, index) => {
    // Support both timestamp_ms and time fields
    const time = item.timestamp_ms || item.time;
    
    if (typeof time !== 'number') {
      throw new Error(`Invalid timestamp at index ${index}: ${time}`);
    }
    
    if (typeof item.open !== 'number' || typeof item.high !== 'number' ||
        typeof item.low !== 'number' || typeof item.close !== 'number') {
      throw new Error(`Invalid OHLC data at index ${index}`);
    }
    
    return {
      time,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume,
      label: item.label || undefined,
    };
  });
}
