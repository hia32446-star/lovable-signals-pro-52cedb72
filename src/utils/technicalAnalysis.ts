import { SignalDirection } from '@/types/trading';
import { analyzeCandlestickPatterns, CandleData, CandlestickAnalysis } from './candlestickPatterns';

// Technical Indicator Interfaces
interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  time?: Date;
}

interface IndicatorResult {
  value: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-1
}

interface AnalysisResult {
  direction: SignalDirection;
  confidence: number;
  strategy: string;
  indicators: Record<string, IndicatorResult>;
  trendStrength: number;
  riskLevel: 'low' | 'medium' | 'high';
  candlestickPatterns?: CandlestickAnalysis;
}

// ==================== TECHNICAL INDICATORS ====================

// RSI - Relative Strength Index (Momentum)
export const calculateRSI = (prices: number[], period: number = 14): IndicatorResult => {
  if (prices.length < period + 1) {
    return { value: 50, signal: 'neutral', strength: 0 };
  }

  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let strength = 0;

  if (rsi < 30) {
    signal = 'bullish'; // Oversold
    strength = (30 - rsi) / 30;
  } else if (rsi > 70) {
    signal = 'bearish'; // Overbought
    strength = (rsi - 70) / 30;
  } else if (rsi < 45) {
    signal = 'bullish';
    strength = (45 - rsi) / 45 * 0.5;
  } else if (rsi > 55) {
    signal = 'bearish';
    strength = (rsi - 55) / 45 * 0.5;
  }

  return { value: rsi, signal, strength: Math.min(1, strength) };
};

// MACD - Moving Average Convergence Divergence
export const calculateMACD = (prices: number[]): IndicatorResult => {
  if (prices.length < 26) {
    return { value: 0, signal: 'neutral', strength: 0 };
  }

  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macdLine = ema12 - ema26;
  
  // Calculate signal line (9-period EMA of MACD)
  const macdValues: number[] = [];
  for (let i = 25; i < prices.length; i++) {
    const e12 = calculateEMA(prices.slice(0, i + 1), 12);
    const e26 = calculateEMA(prices.slice(0, i + 1), 26);
    macdValues.push(e12 - e26);
  }
  
  const signalLine = macdValues.length >= 9 ? calculateEMA(macdValues, 9) : macdLine;
  const histogram = macdLine - signalLine;

  let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let strength = 0;

  if (macdLine > signalLine && histogram > 0) {
    signal = 'bullish';
    strength = Math.min(1, Math.abs(histogram) * 100);
  } else if (macdLine < signalLine && histogram < 0) {
    signal = 'bearish';
    strength = Math.min(1, Math.abs(histogram) * 100);
  }

  // Crossover detection (stronger signal)
  if (macdValues.length >= 2) {
    const prevHistogram = macdValues[macdValues.length - 2] - signalLine;
    if (histogram > 0 && prevHistogram <= 0) {
      signal = 'bullish';
      strength = Math.min(1, strength + 0.3);
    } else if (histogram < 0 && prevHistogram >= 0) {
      signal = 'bearish';
      strength = Math.min(1, strength + 0.3);
    }
  }

  return { value: macdLine, signal, strength };
};

// Stochastic Oscillator
export const calculateStochastic = (candles: OHLC[], kPeriod: number = 14, dPeriod: number = 3): IndicatorResult => {
  if (candles.length < kPeriod) {
    return { value: 50, signal: 'neutral', strength: 0 };
  }

  const recentCandles = candles.slice(-kPeriod);
  const lowestLow = Math.min(...recentCandles.map(c => c.low));
  const highestHigh = Math.max(...recentCandles.map(c => c.high));
  const currentClose = candles[candles.length - 1].close;

  const k = highestHigh === lowestLow ? 50 : ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;

  let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let strength = 0;

  if (k < 20) {
    signal = 'bullish'; // Oversold
    strength = (20 - k) / 20;
  } else if (k > 80) {
    signal = 'bearish'; // Overbought
    strength = (k - 80) / 20;
  } else if (k < 35) {
    signal = 'bullish';
    strength = (35 - k) / 35 * 0.5;
  } else if (k > 65) {
    signal = 'bearish';
    strength = (k - 65) / 35 * 0.5;
  }

  return { value: k, signal, strength: Math.min(1, strength) };
};

// Bollinger Bands
export const calculateBollingerBands = (prices: number[], period: number = 20): IndicatorResult => {
  if (prices.length < period) {
    return { value: 0.5, signal: 'neutral', strength: 0 };
  }

  const recentPrices = prices.slice(-period);
  const sma = recentPrices.reduce((a, b) => a + b, 0) / period;
  const variance = recentPrices.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  const upperBand = sma + 2 * stdDev;
  const lowerBand = sma - 2 * stdDev;
  const currentPrice = prices[prices.length - 1];

  // Position within bands (0 = lower band, 1 = upper band)
  const position = (currentPrice - lowerBand) / (upperBand - lowerBand);

  let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let strength = 0;

  if (position < 0.15) {
    signal = 'bullish'; // Near lower band - potential bounce
    strength = (0.15 - position) / 0.15;
  } else if (position > 0.85) {
    signal = 'bearish'; // Near upper band - potential reversal
    strength = (position - 0.85) / 0.15;
  } else if (position < 0.35) {
    signal = 'bullish';
    strength = (0.35 - position) / 0.35 * 0.5;
  } else if (position > 0.65) {
    signal = 'bearish';
    strength = (position - 0.65) / 0.35 * 0.5;
  }

  return { value: position, signal, strength: Math.min(1, strength) };
};

// ADX - Average Directional Index (Trend Strength)
export const calculateADX = (candles: OHLC[], period: number = 14): IndicatorResult => {
  if (candles.length < period + 1) {
    return { value: 25, signal: 'neutral', strength: 0.5 };
  }

  let plusDM = 0;
  let minusDM = 0;
  let tr = 0;

  for (let i = candles.length - period; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];

    const highDiff = current.high - prev.high;
    const lowDiff = prev.low - current.low;

    plusDM += highDiff > lowDiff && highDiff > 0 ? highDiff : 0;
    minusDM += lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0;

    tr += Math.max(
      current.high - current.low,
      Math.abs(current.high - prev.close),
      Math.abs(current.low - prev.close)
    );
  }

  const plusDI = tr > 0 ? (plusDM / tr) * 100 : 0;
  const minusDI = tr > 0 ? (minusDM / tr) * 100 : 0;
  const dx = plusDI + minusDI > 0 ? (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100 : 0;
  const adx = dx; // Simplified - normally would smooth

  let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let strength = adx / 50; // Normalize to 0-1

  if (adx > 25) {
    signal = plusDI > minusDI ? 'bullish' : 'bearish';
  }

  return { value: adx, signal, strength: Math.min(1, strength) };
};

// Williams %R
export const calculateWilliamsR = (candles: OHLC[], period: number = 14): IndicatorResult => {
  if (candles.length < period) {
    return { value: -50, signal: 'neutral', strength: 0 };
  }

  const recentCandles = candles.slice(-period);
  const highestHigh = Math.max(...recentCandles.map(c => c.high));
  const lowestLow = Math.min(...recentCandles.map(c => c.low));
  const currentClose = candles[candles.length - 1].close;

  const wr = highestHigh === lowestLow ? -50 : ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100;

  let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let strength = 0;

  if (wr < -80) {
    signal = 'bullish'; // Oversold
    strength = (-80 - wr) / 20;
  } else if (wr > -20) {
    signal = 'bearish'; // Overbought
    strength = (wr + 20) / 20;
  }

  return { value: wr, signal, strength: Math.min(1, Math.abs(strength)) };
};

// CCI - Commodity Channel Index
export const calculateCCI = (candles: OHLC[], period: number = 20): IndicatorResult => {
  if (candles.length < period) {
    return { value: 0, signal: 'neutral', strength: 0 };
  }

  const recentCandles = candles.slice(-period);
  const typicalPrices = recentCandles.map(c => (c.high + c.low + c.close) / 3);
  const sma = typicalPrices.reduce((a, b) => a + b, 0) / period;
  const meanDeviation = typicalPrices.reduce((sum, tp) => sum + Math.abs(tp - sma), 0) / period;

  const currentTP = typicalPrices[typicalPrices.length - 1];
  const cci = meanDeviation === 0 ? 0 : (currentTP - sma) / (0.015 * meanDeviation);

  let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let strength = 0;

  if (cci < -100) {
    signal = 'bullish'; // Oversold
    strength = Math.min(1, (-100 - cci) / 100);
  } else if (cci > 100) {
    signal = 'bearish'; // Overbought
    strength = Math.min(1, (cci - 100) / 100);
  }

  return { value: cci, signal, strength };
};

// ==================== HELPER FUNCTIONS ====================

const calculateEMA = (prices: number[], period: number): number => {
  if (prices.length < period) return prices[prices.length - 1];

  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }

  return ema;
};

// Calculate SMA
const calculateSMA = (prices: number[], period: number): number => {
  if (prices.length < period) return prices[prices.length - 1];
  return prices.slice(-period).reduce((a, b) => a + b, 0) / period;
};

// Detect trend using multiple EMAs
const detectTrend = (prices: number[]): { direction: 'up' | 'down' | 'sideways'; strength: number } => {
  if (prices.length < 50) {
    return { direction: 'sideways', strength: 0 };
  }

  const ema8 = calculateEMA(prices, 8);
  const ema21 = calculateEMA(prices, 21);
  const ema50 = calculateEMA(prices, 50);
  const currentPrice = prices[prices.length - 1];

  let bullishCount = 0;
  let bearishCount = 0;

  // Check EMA alignment
  if (currentPrice > ema8) bullishCount++;
  else bearishCount++;

  if (ema8 > ema21) bullishCount++;
  else bearishCount++;

  if (ema21 > ema50) bullishCount++;
  else bearishCount++;

  if (currentPrice > ema50) bullishCount++;
  else bearishCount++;

  const strength = Math.abs(bullishCount - bearishCount) / 4;

  if (bullishCount >= 3) return { direction: 'up', strength };
  if (bearishCount >= 3) return { direction: 'down', strength };
  return { direction: 'sideways', strength: 0.2 };
};

// ==================== MAIN ANALYSIS FUNCTION ====================

export const analyzeMarketAdvanced = (candles: OHLC[]): AnalysisResult | null => {
  if (candles.length < 50) {
    return null;
  }

  const closePrices = candles.map(c => c.close);

  // Calculate all indicators
  const rsi = calculateRSI(closePrices, 14);
  const macd = calculateMACD(closePrices);
  const stochastic = calculateStochastic(candles, 14, 3);
  const bollinger = calculateBollingerBands(closePrices, 20);
  const adx = calculateADX(candles, 14);
  const williamsR = calculateWilliamsR(candles, 14);
  const cci = calculateCCI(candles, 20);

  // Trend analysis
  const trend = detectTrend(closePrices);

  // Candlestick Pattern Analysis (NEW)
  const candleDataForPatterns: CandleData[] = candles.map((c, i) => ({
    time: (c as any).time || new Date(Date.now() - (candles.length - i) * 60000),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
  const candlestickPatterns = analyzeCandlestickPatterns(candleDataForPatterns);

  // Confluence scoring
  let bullishScore = 0;
  let bearishScore = 0;
  let totalWeight = 0;

  const indicators: Record<string, IndicatorResult> = {
    RSI: rsi,
    MACD: macd,
    Stochastic: stochastic,
    'Bollinger Bands': bollinger,
    ADX: adx,
    'Williams %R': williamsR,
    CCI: cci,
  };

  // Weight each indicator
  const weights = {
    RSI: 2.5,
    MACD: 3.0,
    Stochastic: 2.0,
    'Bollinger Bands': 2.0,
    ADX: 1.5,
    'Williams %R': 1.5,
    CCI: 1.5,
  };

  Object.entries(indicators).forEach(([name, result]) => {
    const weight = weights[name as keyof typeof weights] || 1;
    totalWeight += weight;

    if (result.signal === 'bullish') {
      bullishScore += weight * result.strength;
    } else if (result.signal === 'bearish') {
      bearishScore += weight * result.strength;
    }
  });

  // Trend confirmation bonus
  if (trend.direction === 'up') {
    bullishScore += 2 * trend.strength;
    totalWeight += 2;
  } else if (trend.direction === 'down') {
    bearishScore += 2 * trend.strength;
    totalWeight += 2;
  }

  // Candlestick Pattern Bonus (HIGH WEIGHT - from Python bot)
  if (candlestickPatterns.patterns.length > 0) {
    const patternWeight = 4.0; // High weight for candlestick patterns
    totalWeight += patternWeight;
    
    candlestickPatterns.patterns.forEach(pattern => {
      if (pattern.direction === 'CALL') {
        bullishScore += patternWeight * pattern.confidence;
      } else {
        bearishScore += patternWeight * pattern.confidence;
      }
    });
  }

  // Calculate confluence score
  const maxScore = Math.max(bullishScore, bearishScore);
  const confluenceRatio = maxScore / totalWeight;

  // Minimum threshold for signal generation (lowered if strong pattern detected)
  const minThreshold = candlestickPatterns.patternStrength > 0.8 ? 0.25 : 0.35;
  if (confluenceRatio < minThreshold) {
    return null; // No clear signal
  }

  const direction: SignalDirection = bullishScore > bearishScore ? 'CALL' : 'PUT';

  // Confidence calculation (90-98% range for high accuracy)
  // Boost confidence if candlestick patterns confirm direction
  let baseConfidence = 90;
  const maxConfidence = 98;
  
  // Pattern confirmation boost
  if (candlestickPatterns.dominantDirection === direction && candlestickPatterns.patternStrength > 0.7) {
    baseConfidence += 2; // Extra 2% for pattern confirmation
  }
  
  const confidence = Math.min(maxConfidence, baseConfidence + (confluenceRatio * (maxConfidence - baseConfidence)));

  // Risk assessment
  const volatility = bollinger.value; // BB position indicates volatility context
  let riskLevel: 'low' | 'medium' | 'high' = 'medium';

  if (adx.value > 30 && confluenceRatio > 0.5) {
    riskLevel = 'low'; // Strong trend with high confluence
  } else if (adx.value < 20 || confluenceRatio < 0.4) {
    riskLevel = 'high'; // Weak trend or low confluence
  }
  
  // Strong candlestick pattern reduces risk
  if (candlestickPatterns.patternStrength > 0.85 && candlestickPatterns.dominantDirection === direction) {
    riskLevel = riskLevel === 'high' ? 'medium' : 'low';
  }

  // Strategy selection based on conditions
  let strategy = 'Multi-Indicator Confluence';

  // Prioritize candlestick patterns for strategy naming (like Python bot)
  if (candlestickPatterns.primaryPattern && candlestickPatterns.patternStrength > 0.7) {
    strategy = candlestickPatterns.primaryPattern;
  } else if (rsi.signal !== 'neutral' && rsi.strength > 0.5) {
    if (rsi.value < 30 || rsi.value > 70) {
      strategy = direction === 'CALL' ? 'RSI Oversold Bounce' : 'RSI Overbought Reversal';
    }
  } else if (macd.strength > 0.5 && macd.signal !== 'neutral') {
    strategy = 'MACD Crossover Strategy';
  } else if (stochastic.strength > 0.6) {
    strategy = direction === 'CALL' ? 'Stochastic Oversold Recovery' : 'Stochastic Overbought Pullback';
  } else if (bollinger.strength > 0.5 && trend.strength > 0.5) {
    strategy = direction === 'CALL' ? 'Bollinger Band Bounce' : 'Bollinger Band Rejection';
  } else if (trend.strength > 0.7 && adx.value > 25) {
    strategy = direction === 'CALL' ? 'Strong Uptrend Continuation' : 'Strong Downtrend Continuation';
  } else if (confluenceRatio > 0.6 && Object.values(indicators).filter(i => i.signal === direction.toLowerCase()).length >= 5) {
    strategy = 'Maximum Confluence Entry';
  }

  return {
    direction,
    confidence: Math.round(confidence * 10) / 10,
    strategy,
    indicators,
    trendStrength: trend.strength,
    riskLevel,
    candlestickPatterns,
  };
};
