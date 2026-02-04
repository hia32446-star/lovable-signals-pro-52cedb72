// Candlestick Pattern Recognition
// Ported from Python bot's CandlestickPatternRecognizer

import { SignalDirection } from '@/types/trading';

export interface CandleData {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface PreparedCandle extends CandleData {
  body: number;
  upperWick: number;
  lowerWick: number;
  range: number;
  bodyHigh: number;
  bodyLow: number;
  direction: 1 | -1;
  avgRange: number | null;
}

export interface PatternResult {
  pattern: string;
  direction: SignalDirection;
  confidence: number;
  timestamp: Date;
}

// Prepare candle data with calculated properties
const prepareCandles = (candles: CandleData[]): PreparedCandle[] => {
  return candles.map((candle, i, arr) => {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    
    // Calculate 10-period average range
    let avgRange: number | null = null;
    if (i >= 9) {
      let totalRange = 0;
      for (let j = i - 9; j <= i; j++) {
        totalRange += arr[j].high - arr[j].low;
      }
      avgRange = totalRange / 10;
    }
    
    return {
      ...candle,
      body,
      upperWick: candle.high - Math.max(candle.open, candle.close),
      lowerWick: Math.min(candle.open, candle.close) - candle.low,
      range,
      bodyHigh: Math.max(candle.open, candle.close),
      bodyLow: Math.min(candle.open, candle.close),
      direction: (candle.close > candle.open ? 1 : -1) as 1 | -1,
      avgRange,
    };
  });
};

// ==================== PATTERN DETECTION ====================

/**
 * Shooting Star Pattern (Bearish Reversal)
 * - Long upper wick
 * - Small body at the bottom
 * - At/near high of recent period
 */
const isShootingStar = (
  candles: PreparedCandle[],
  idx: number,
  lookback: number = 3,
  wickBodyRatio: number = 2,
  candleLengthMultiplier: number = 1
): boolean => {
  if (idx < lookback || !candles[idx].avgRange) return false;
  
  const candle = candles[idx];
  
  // Current candle must be at/near high of lookback period
  const prevHighs = candles.slice(idx - lookback, idx).map(c => c.high);
  if (candle.high < Math.max(...prevHighs)) return false;
  
  const { body, upperWick, lowerWick, range, avgRange } = candle;
  if (!avgRange) return false;
  
  // Variation 2: Standard shooting star
  const variation2 = (
    upperWick > 2 * wickBodyRatio * body &&
    upperWick > 2 * body &&
    range >= candleLengthMultiplier * avgRange &&
    candle.open !== candle.close &&
    upperWick / 3 <= lowerWick &&
    upperWick / 4 <= lowerWick
  );
  
  // Variation 3: Stronger shooting star
  const variation3 = (
    upperWick > 3 * wickBodyRatio * body &&
    upperWick > 2 * body &&
    range >= candleLengthMultiplier * avgRange &&
    candle.open !== candle.close &&
    upperWick / 4 <= lowerWick
  );
  
  // Variation 4: Very strong shooting star
  const variation4 = (
    upperWick > 4 * wickBodyRatio * body &&
    upperWick > 2 * body &&
    range >= candleLengthMultiplier * avgRange &&
    candle.open !== candle.close
  );
  
  return variation2 || variation3 || variation4;
};

/**
 * Hammer Pattern (Bullish Reversal)
 * - Long lower wick
 * - Small body at the top
 * - At/near low of recent period
 */
const isHammer = (
  candles: PreparedCandle[],
  idx: number,
  lookback: number = 3,
  wickBodyRatio: number = 0.9,
  candleLengthMultiplier: number = 1
): boolean => {
  if (idx < lookback || !candles[idx].avgRange) return false;
  
  const candle = candles[idx];
  
  // Current candle must be at/near low of lookback period
  const prevLows = candles.slice(idx - lookback, idx).map(c => c.low);
  if (candle.low > Math.min(...prevLows)) return false;
  
  const { body, upperWick, lowerWick, range, avgRange } = candle;
  if (!avgRange) return false;
  
  // Variation 2: Standard hammer
  const variation2 = (
    lowerWick > 2 * wickBodyRatio * body &&
    lowerWick > body &&
    range >= candleLengthMultiplier * avgRange &&
    candle.open !== candle.close &&
    lowerWick / 3 <= upperWick &&
    lowerWick / 4 <= upperWick
  );
  
  // Variation 3: Stronger hammer
  const variation3 = (
    lowerWick > 3 * wickBodyRatio * body &&
    lowerWick > body &&
    range >= candleLengthMultiplier * avgRange &&
    candle.open !== candle.close &&
    lowerWick / 4 <= upperWick
  );
  
  // Variation 4: Very strong hammer
  const variation4 = (
    lowerWick > 4 * wickBodyRatio * body &&
    lowerWick > body &&
    range >= candleLengthMultiplier * avgRange &&
    candle.open !== candle.close
  );
  
  return variation2 || variation3 || variation4;
};

/**
 * Doji Pattern (Indecision/Reversal)
 * - Very small body (open ≈ close)
 */
const isDoji = (
  candles: PreparedCandle[],
  idx: number,
  starRatio: number = 0.1,
  minLengthMultiplier: number = 1
): boolean => {
  if (!candles[idx].avgRange) return false;
  
  const candle = candles[idx];
  const { range, avgRange } = candle;
  if (!avgRange) return false;
  
  return (
    Math.abs(candle.open - candle.close) <= range * starRatio &&
    range >= minLengthMultiplier * avgRange
  );
};

/**
 * Engulfing Pattern (Strong Reversal)
 * - Current candle completely engulfs previous candle
 */
const isEngulfing = (
  candles: PreparedCandle[],
  idx: number,
  engulfingLengthMultiplier: number = 1
): { isPattern: boolean; type: 'bullish' | 'bearish' | null } => {
  if (idx < 1 || !candles[idx].avgRange) {
    return { isPattern: false, type: null };
  }
  
  const candle = candles[idx];
  const prevCandle = candles[idx - 1];
  const { avgRange } = candle;
  if (!avgRange) return { isPattern: false, type: null };
  
  // Bearish Engulfing
  if (
    prevCandle.direction === 1 &&  // Previous was bullish
    candle.direction === -1 &&     // Current is bearish
    candle.open >= prevCandle.close &&
    candle.close <= prevCandle.open &&
    (candle.open - candle.close) > (prevCandle.close - prevCandle.open) &&
    candle.range >= engulfingLengthMultiplier * avgRange
  ) {
    return { isPattern: true, type: 'bearish' };
  }
  
  // Bullish Engulfing
  if (
    prevCandle.direction === -1 &&  // Previous was bearish
    candle.direction === 1 &&       // Current is bullish
    candle.close >= prevCandle.open &&
    candle.open <= prevCandle.close &&
    (candle.close - candle.open) > (prevCandle.open - prevCandle.close) &&
    candle.range >= engulfingLengthMultiplier * avgRange
  ) {
    return { isPattern: true, type: 'bullish' };
  }
  
  return { isPattern: false, type: null };
};

/**
 * Piercing Line Pattern (Bullish Reversal)
 * - Bearish candle followed by bullish candle
 * - Bullish candle opens below previous close, closes above midpoint
 */
const isPiercingLine = (
  candles: PreparedCandle[],
  idx: number,
  piercingRatio: number = 0.5,
  minLengthMultiplier: number = 1
): boolean => {
  if (idx < 1 || !candles[idx].avgRange) return false;
  
  const candle = candles[idx];
  const prevCandle = candles[idx - 1];
  const { avgRange } = candle;
  if (!avgRange) return false;
  
  return (
    prevCandle.direction === -1 &&  // Previous was bearish
    ((prevCandle.open + prevCandle.close) / 2) < candle.close &&
    candle.direction === 1 &&       // Current is bullish
    (candle.close - candle.open) / (0.001 + candle.range) > piercingRatio &&
    candle.range >= minLengthMultiplier * avgRange
  );
};

/**
 * Dark Cloud Cover Pattern (Bearish Reversal)
 * - Bullish candle followed by bearish candle
 * - Bearish candle opens above previous close, closes below midpoint
 */
const isDarkCloudCover = (
  candles: PreparedCandle[],
  idx: number,
  piercingRatio: number = 0.5,
  minLengthMultiplier: number = 1
): boolean => {
  if (idx < 1 || !candles[idx].avgRange) return false;
  
  const candle = candles[idx];
  const prevCandle = candles[idx - 1];
  const { avgRange } = candle;
  if (!avgRange) return false;
  
  return (
    prevCandle.direction === 1 &&   // Previous was bullish
    ((prevCandle.close + prevCandle.open) / 2) > candle.close &&
    candle.direction === -1 &&      // Current is bearish
    candle.close > prevCandle.open &&
    (candle.open - candle.close) / (0.001 + candle.range) > piercingRatio &&
    candle.range >= minLengthMultiplier * avgRange
  );
};

/**
 * Morning/Evening Star Pattern (Strong Reversal)
 * - Three-candle pattern
 * - First candle in trend direction
 * - Second candle is small (indecision)
 * - Third candle reverses
 */
const isStar = (
  candles: PreparedCandle[],
  idx: number,
  starBodyLength: number = 5,
  dojiStarRatio: number = 0.1,
  minLengthMultiplier: number = 1
): { isPattern: boolean; type: 'morning' | 'evening' | null } => {
  if (idx < 2 || !candles[idx].avgRange) {
    return { isPattern: false, type: null };
  }
  
  const candle = candles[idx];
  const prev1 = candles[idx - 1];
  const prev2 = candles[idx - 2];
  const { avgRange } = candle;
  if (!avgRange) return { isPattern: false, type: null };
  
  // Evening Star (Bearish Reversal)
  if (
    candle.high >= prev1.high &&
    prev1.high > prev2.high &&
    prev1.body < starBodyLength &&
    prev2.direction === 1 &&
    (prev2.close - prev2.open) / (0.001 + prev2.range) > dojiStarRatio &&
    candle.direction === -1 &&
    candle.range >= minLengthMultiplier * avgRange
  ) {
    return { isPattern: true, type: 'evening' };
  }
  
  // Morning Star (Bullish Reversal)
  if (
    candle.low <= prev1.low &&
    prev1.low < prev2.low &&
    prev1.body < starBodyLength &&
    prev2.direction === -1 &&
    (prev2.open - prev2.close) / (0.001 + prev2.range) > dojiStarRatio &&
    candle.direction === 1 &&
    candle.range >= minLengthMultiplier * avgRange
  ) {
    return { isPattern: true, type: 'morning' };
  }
  
  return { isPattern: false, type: null };
};

/**
 * Inverted Hammer Pattern (Bullish Reversal at bottom)
 * - Long upper wick
 * - Small body at the bottom
 * - At/near low of recent period
 */
const isInvertedHammer = (
  candles: PreparedCandle[],
  idx: number,
  lookback: number = 3
): boolean => {
  if (idx < lookback || !candles[idx].avgRange) return false;
  
  const candle = candles[idx];
  
  // Must be at/near low of lookback period
  const prevLows = candles.slice(idx - lookback, idx).map(c => c.low);
  if (candle.low > Math.min(...prevLows)) return false;
  
  const { body, upperWick, lowerWick, range, avgRange } = candle;
  if (!avgRange || range < avgRange * 0.8) return false;
  
  return (
    upperWick > 2 * body &&
    lowerWick < body * 0.5 &&
    body > 0
  );
};

/**
 * Hanging Man Pattern (Bearish Reversal at top)
 * - Long lower wick
 * - Small body at the top
 * - At/near high of recent period
 */
const isHangingMan = (
  candles: PreparedCandle[],
  idx: number,
  lookback: number = 3
): boolean => {
  if (idx < lookback || !candles[idx].avgRange) return false;
  
  const candle = candles[idx];
  
  // Must be at/near high of lookback period
  const prevHighs = candles.slice(idx - lookback, idx).map(c => c.high);
  if (candle.high < Math.max(...prevHighs)) return false;
  
  const { body, upperWick, lowerWick, range, avgRange } = candle;
  if (!avgRange || range < avgRange * 0.8) return false;
  
  return (
    lowerWick > 2 * body &&
    upperWick < body * 0.5 &&
    body > 0
  );
};

/**
 * Three White Soldiers (Strong Bullish)
 * - Three consecutive bullish candles
 * - Each opens within previous body, closes higher
 */
const isThreeWhiteSoldiers = (
  candles: PreparedCandle[],
  idx: number
): boolean => {
  if (idx < 2) return false;
  
  const c1 = candles[idx - 2];
  const c2 = candles[idx - 1];
  const c3 = candles[idx];
  
  return (
    c1.direction === 1 && c2.direction === 1 && c3.direction === 1 &&
    c2.close > c1.close && c3.close > c2.close &&
    c2.open > c1.open && c3.open > c2.open &&
    c2.open >= c1.bodyLow && c2.open <= c1.bodyHigh &&
    c3.open >= c2.bodyLow && c3.open <= c2.bodyHigh
  );
};

/**
 * Three Black Crows (Strong Bearish)
 * - Three consecutive bearish candles
 * - Each opens within previous body, closes lower
 */
const isThreeBlackCrows = (
  candles: PreparedCandle[],
  idx: number
): boolean => {
  if (idx < 2) return false;
  
  const c1 = candles[idx - 2];
  const c2 = candles[idx - 1];
  const c3 = candles[idx];
  
  return (
    c1.direction === -1 && c2.direction === -1 && c3.direction === -1 &&
    c2.close < c1.close && c3.close < c2.close &&
    c2.open < c1.open && c3.open < c2.open &&
    c2.open >= c1.bodyLow && c2.open <= c1.bodyHigh &&
    c3.open >= c2.bodyLow && c3.open <= c2.bodyHigh
  );
};

// ==================== MAIN ANALYSIS FUNCTION ====================

export interface CandlestickAnalysis {
  patterns: PatternResult[];
  dominantDirection: SignalDirection | null;
  patternStrength: number;
  primaryPattern: string | null;
}

/**
 * Analyze candles for all patterns and return comprehensive results
 */
export const analyzeCandlestickPatterns = (candles: CandleData[]): CandlestickAnalysis => {
  if (candles.length < 10) {
    return {
      patterns: [],
      dominantDirection: null,
      patternStrength: 0,
      primaryPattern: null,
    };
  }
  
  const preparedCandles = prepareCandles(candles);
  const patterns: PatternResult[] = [];
  
  // Only analyze the most recent candles (last 5)
  const startIdx = Math.max(10, preparedCandles.length - 5);
  
  for (let idx = startIdx; idx < preparedCandles.length; idx++) {
    const candle = preparedCandles[idx];
    
    // Check for patterns with confidence scores
    if (isShootingStar(preparedCandles, idx)) {
      patterns.push({
        pattern: 'Shooting Star',
        direction: 'PUT',
        confidence: 0.85,
        timestamp: candle.time,
      });
    }
    
    if (isHammer(preparedCandles, idx)) {
      patterns.push({
        pattern: 'Hammer',
        direction: 'CALL',
        confidence: 0.85,
        timestamp: candle.time,
      });
    }
    
    if (isDoji(preparedCandles, idx)) {
      // Doji direction depends on context
      const recentTrend = preparedCandles.slice(idx - 5, idx)
        .reduce((sum, c) => sum + c.direction, 0);
      patterns.push({
        pattern: 'Doji',
        direction: recentTrend > 0 ? 'PUT' : 'CALL', // Reversal
        confidence: 0.70,
        timestamp: candle.time,
      });
    }
    
    const engulfing = isEngulfing(preparedCandles, idx);
    if (engulfing.isPattern && engulfing.type) {
      patterns.push({
        pattern: `${engulfing.type === 'bullish' ? 'Bullish' : 'Bearish'} Engulfing`,
        direction: engulfing.type === 'bullish' ? 'CALL' : 'PUT',
        confidence: 0.90,
        timestamp: candle.time,
      });
    }
    
    if (isPiercingLine(preparedCandles, idx)) {
      patterns.push({
        pattern: 'Piercing Line',
        direction: 'CALL',
        confidence: 0.80,
        timestamp: candle.time,
      });
    }
    
    if (isDarkCloudCover(preparedCandles, idx)) {
      patterns.push({
        pattern: 'Dark Cloud Cover',
        direction: 'PUT',
        confidence: 0.80,
        timestamp: candle.time,
      });
    }
    
    const star = isStar(preparedCandles, idx);
    if (star.isPattern && star.type) {
      patterns.push({
        pattern: `${star.type === 'morning' ? 'Morning' : 'Evening'} Star`,
        direction: star.type === 'morning' ? 'CALL' : 'PUT',
        confidence: 0.88,
        timestamp: candle.time,
      });
    }
    
    if (isInvertedHammer(preparedCandles, idx)) {
      patterns.push({
        pattern: 'Inverted Hammer',
        direction: 'CALL',
        confidence: 0.75,
        timestamp: candle.time,
      });
    }
    
    if (isHangingMan(preparedCandles, idx)) {
      patterns.push({
        pattern: 'Hanging Man',
        direction: 'PUT',
        confidence: 0.75,
        timestamp: candle.time,
      });
    }
    
    if (isThreeWhiteSoldiers(preparedCandles, idx)) {
      patterns.push({
        pattern: 'Three White Soldiers',
        direction: 'CALL',
        confidence: 0.92,
        timestamp: candle.time,
      });
    }
    
    if (isThreeBlackCrows(preparedCandles, idx)) {
      patterns.push({
        pattern: 'Three Black Crows',
        direction: 'PUT',
        confidence: 0.92,
        timestamp: candle.time,
      });
    }
  }
  
  // Calculate dominant direction
  let callScore = 0;
  let putScore = 0;
  
  patterns.forEach(p => {
    if (p.direction === 'CALL') {
      callScore += p.confidence;
    } else {
      putScore += p.confidence;
    }
  });
  
  const dominantDirection = patterns.length === 0 ? null :
    callScore > putScore ? 'CALL' : 'PUT';
  
  const patternStrength = patterns.length > 0 
    ? Math.max(callScore, putScore) / patterns.length 
    : 0;
  
  // Get the most recent high-confidence pattern
  const sortedPatterns = [...patterns].sort((a, b) => b.confidence - a.confidence);
  const primaryPattern = sortedPatterns.length > 0 ? sortedPatterns[0].pattern : null;
  
  return {
    patterns,
    dominantDirection,
    patternStrength,
    primaryPattern,
  };
};

/**
 * Get only the most recent and strongest pattern signal
 */
export const getLatestPatternSignal = (candles: CandleData[]): PatternResult | null => {
  const analysis = analyzeCandlestickPatterns(candles);
  
  if (analysis.patterns.length === 0) {
    return null;
  }
  
  // Return the highest confidence pattern from the most recent candle
  const lastCandleTime = candles[candles.length - 1].time;
  const recentPatterns = analysis.patterns.filter(
    p => p.timestamp.getTime() === lastCandleTime.getTime()
  );
  
  if (recentPatterns.length === 0) {
    // Fall back to highest confidence pattern
    return analysis.patterns.sort((a, b) => b.confidence - a.confidence)[0];
  }
  
  return recentPatterns.sort((a, b) => b.confidence - a.confidence)[0];
};
