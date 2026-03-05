/**
 * Trading Systems - Preset configurations that activate groups of indicators
 * with optimized settings for specific trading strategies
 */

export type TradingSystemId =
  | 'trend-following'
  | 'mean-reversion'
  | 'breakout-momentum'
  | 'smart-money'
  | 'momentum-scalper'
  | 'divergence-master'
  | 'mtf-confluence'
  | 'volume-profile';

export interface TradingSystem {
  id: TradingSystemId;
  name: string;
  description: string;
  icon: string;
  category: 'trend' | 'reversal' | 'breakout' | 'smc';
  
  // Indicator/Tool configuration
  preset: {
    // Oscillators
    oscillators?: {
      rsi?: { enabled: boolean; period?: number };
      macd?: { enabled: boolean; fast?: number; slow?: number; signal?: number };
      stochRSI?: { enabled: boolean; period?: number };
      obv?: { enabled: boolean };
      mfi?: { enabled: boolean; period?: number };
      williamsR?: { enabled: boolean; period?: number };
      cci?: { enabled: boolean; period?: number };
      adx?: { enabled: boolean; period?: number };
    };
    
    // Chart Indicators
    indicators?: {
      ema?: { enabled: boolean; periods?: number[] };
      bollingerBands?: { enabled: boolean; period?: number; stdDev?: number };
      elderImpulse?: { enabled: boolean };
    };
    
    // SMC Tools
    smc?: {
      fvg?: { enabled: boolean };
      orderBlocks?: { enabled: boolean };
      breakerBlocks?: { enabled: boolean };
      bos?: { enabled: boolean };
      liquidity?: { enabled: boolean };
      pdZones?: { enabled: boolean };
      autoFib?: { enabled: boolean };
    };
    
    // Advanced Tools
    tools?: {
      superTrend?: { enabled: boolean; type?: 'basic' | 'adx' | 'ema' };
      volumeProfile?: { enabled: boolean };
      squeezeMomentum?: { enabled: boolean };
      divergenceScanner?: { enabled: boolean };
      htfBias?: { enabled: boolean };
      sessionSeparators?: { enabled: boolean };
    };
  };
  
  // Alert conditions (for future implementation)
  alerts?: {
    entry?: string[];
    exit?: string[];
  };
}

export const TRADING_SYSTEMS: Record<TradingSystemId, TradingSystem> = {
  'trend-following': {
    id: 'trend-following',
    name: 'Trend Following Pro',
    description: 'Catch strong directional moves with EMA + SuperTrend + ADX confirmation',
    icon: '📈',
    category: 'trend',
    preset: {
      indicators: {
        ema: { enabled: true, periods: [9, 21, 50] },
      },
      oscillators: {
        adx: { enabled: true, period: 14 },
      },
      tools: {
        superTrend: { enabled: true, type: 'adx' },
        htfBias: { enabled: true },
        sessionSeparators: { enabled: true },
      },
    },
    alerts: {
      entry: [
        'SuperTrend flip + ADX > 25',
        'EMA crossover with HTF alignment',
        'Session open with trend intact',
      ],
    },
  },
  
  'mean-reversion': {
    id: 'mean-reversion',
    name: 'Mean Reversion Hunter',
    description: 'Buy oversold, sell overbought with RSI + Bollinger Bands + Volume Profile',
    icon: '🎯',
    category: 'reversal',
    preset: {
      oscillators: {
        rsi: { enabled: true, period: 14 },
        mfi: { enabled: true, period: 14 },
      },
      indicators: {
        bollingerBands: { enabled: true, period: 20, stdDev: 2 },
      },
      smc: {
        pdZones: { enabled: true },
      },
      tools: {
        volumeProfile: { enabled: true },
      },
    },
    alerts: {
      entry: [
        'RSI < 30 at BB lower band',
        'RSI > 70 at BB upper band',
        'Price at VP POC + RSI extreme',
      ],
    },
  },
  
  'breakout-momentum': {
    id: 'breakout-momentum',
    name: 'Breakout Momentum',
    description: 'Enter explosive moves with Squeeze + Volume Profile + BOS confirmation',
    icon: '🚀',
    category: 'breakout',
    preset: {
      indicators: {
        bollingerBands: { enabled: true, period: 20, stdDev: 2 },
      },
      smc: {
        bos: { enabled: true },
      },
      tools: {
        squeezeMomentum: { enabled: true },
        volumeProfile: { enabled: true },
      },
    },
    alerts: {
      entry: [
        'Squeeze release (momentum shift)',
        'Price breaks VAH/VAL with volume',
        'BOS confirmation above/below POC',
      ],
    },
  },
  
  'smart-money': {
    id: 'smart-money',
    name: 'Smart Money Tracker',
    description: 'Trade institutional footprints using full SMC package',
    icon: '💎',
    category: 'smc',
    preset: {
      smc: {
        fvg: { enabled: true },
        orderBlocks: { enabled: true },
        breakerBlocks: { enabled: true },
        bos: { enabled: true },
        liquidity: { enabled: true },
        pdZones: { enabled: true },
        autoFib: { enabled: true },
      },
    },
    alerts: {
      entry: [
        'Liquidity sweep + reversal',
        'Price enters fresh Order Block',
        'FVG fill rejection',
        'MSS confirmation (structure shift)',
      ],
    },
  },
  
  'momentum-scalper': {
    id: 'momentum-scalper',
    name: 'Momentum Scalper',
    description: 'Quick entries on momentum shifts with MACD + Stoch RSI + Elder Impulse',
    icon: '⚡',
    category: 'trend',
    preset: {
      oscillators: {
        macd: { enabled: true, fast: 12, slow: 26, signal: 9 },
        stochRSI: { enabled: true, period: 14 },
        obv: { enabled: true },
      },
      indicators: {
        elderImpulse: { enabled: true },
      },
    },
    alerts: {
      entry: [
        'MACD zero-line cross',
        'Stoch RSI oversold/overbought bounce',
        'Elder Impulse color change',
        'Volume spike (2x average)',
      ],
    },
  },
  
  'divergence-master': {
    id: 'divergence-master',
    name: 'Divergence Master',
    description: 'Catch reversals using auto-detected divergences across RSI/MACD/OBV',
    icon: '🔄',
    category: 'reversal',
    preset: {
      oscillators: {
        rsi: { enabled: true, period: 14 },
        macd: { enabled: true, fast: 12, slow: 26, signal: 9 },
        obv: { enabled: true },
      },
      tools: {
        divergenceScanner: { enabled: true },
      },
    },
    alerts: {
      entry: [
        'Regular divergence (reversal signal)',
        'Hidden divergence (continuation)',
        'Multi-oscillator confluence',
      ],
    },
  },
  
  'mtf-confluence': {
    id: 'mtf-confluence',
    name: 'Multi-Timeframe Confluence',
    description: 'Only trade when HTF + current TF + structure all align',
    icon: '🎚️',
    category: 'trend',
    preset: {
      indicators: {
        ema: { enabled: true, periods: [9, 21, 50] },
      },
      smc: {
        bos: { enabled: true },
      },
      tools: {
        superTrend: { enabled: true, type: 'basic' },
        htfBias: { enabled: true },
        sessionSeparators: { enabled: true },
      },
    },
    alerts: {
      entry: [
        'All timeframes aligned',
        'Session open with confluence',
        'BOS confirming HTF bias',
      ],
    },
  },
  
  'volume-profile': {
    id: 'volume-profile',
    name: 'Volume Profile Master',
    description: 'Trade key volume levels with POC/VAH/VAL + Order Blocks',
    icon: '📊',
    category: 'smc',
    preset: {
      oscillators: {
        obv: { enabled: true },
        mfi: { enabled: true, period: 14 },
      },
      smc: {
        orderBlocks: { enabled: true },
        pdZones: { enabled: true },
      },
      tools: {
        volumeProfile: { enabled: true },
      },
    },
    alerts: {
      entry: [
        'Price at VAL/VAH rejection',
        'POC magnetic pull',
        'OB + VP level confluence',
        'Volume spike at key level',
      ],
    },
  },
};

export interface TradingSystemState {
  activeSystem: TradingSystemId | null;
  customSystems?: Record<string, TradingSystem>;
}
