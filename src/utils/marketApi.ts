// Real Market Data API Service
// Fetches live market data from external API

export interface MarketTick {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface MarketApiResponse {
  success: boolean;
  symbol: string;
  data: MarketTick[];
  currentPrice: number;
  timestamp: number;
}

export interface LiveMarketData {
  candles: MarketTick[];
  currentPrice: number;
  entryPrice: number;
  symbol: string;
  fetchedAt: Date;
}

// Use Cloud proxy to bypass mixed content restrictions
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const API_BASE_URL = `${SUPABASE_URL}/functions/v1/market-proxy`;

const safeParseJson = async (response: Response): Promise<any | null> => {
  try {
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const parseNumericValue = (value: unknown): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

const parseApiCandleTime = (value: unknown): number => {
  if (typeof value === 'number') {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }

  if (typeof value === 'string') {
    const normalized = value.includes('T') ? value : value.replace(' ', 'T');
    const parsed = new Date(normalized).getTime();
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Date.now();
};

// Convert pair symbol to API format (ensure _otc suffix)
const formatSymbolForApi = (symbol: string): string => {
  // Clean the symbol first
  let formatted = symbol
    .replace(/\s*\(OTC\)\s*/i, '') // Remove (OTC)
    .replace('-OTC', '')           // Remove -OTC
    .replace(/\s+/g, '')           // Remove spaces
    .replace('/', '');             // Remove slash
  
  // Always ensure _otc suffix for API compatibility
  if (!formatted.toLowerCase().endsWith('_otc')) {
    formatted = formatted + '_otc';
  }
  
  return formatted;
};

// API error types for better handling
export interface ApiError {
  code: 'TIMEOUT' | 'CONNECTION_REFUSED' | 'API_ERROR' | 'PARSE_ERROR' | 'UNKNOWN';
  message: string;
  retryable: boolean;
}

// Track API status for UI feedback
let lastApiStatus: { success: boolean; error?: ApiError; timestamp: Date } = {
  success: true,
  timestamp: new Date(),
};

export const getApiStatus = () => lastApiStatus;

// Fetch real market data from API with enhanced error handling
export const fetchMarketData = async (symbol: string): Promise<LiveMarketData | null> => {
  const formattedSymbol = formatSymbolForApi(symbol);

  if (!SUPABASE_URL) {
    const apiError: ApiError = {
      code: 'UNKNOWN',
      message: 'Backend URL is not configured',
      retryable: false,
    };
    lastApiStatus = { success: false, error: apiError, timestamp: new Date() };
    console.error(`Market API error [${apiError.code}]: ${apiError.message}`);
    return null;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout (includes proxy retries)
    
    const response = await fetch(`${API_BASE_URL}?symbol=${formattedSymbol}`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    
    clearTimeout(timeoutId);

    const responseData = await safeParseJson(response);
    if (!responseData) {
      const apiError: ApiError = {
        code: 'PARSE_ERROR',
        message: `Invalid JSON from backend (status ${response.status})`,
        retryable: true,
      };
      lastApiStatus = { success: false, error: apiError, timestamp: new Date() };
      console.error(`Market API error [${apiError.code}]: ${apiError.message}`);
      return null;
    }

    // If backend returns structured status payload
    if (typeof responseData === 'object' && responseData !== null && 'success' in responseData) {
      if (responseData.success !== true) {
        const apiError: ApiError = {
          code: responseData.code || 'API_ERROR',
          message: responseData.error || 'Market API error',
          retryable: responseData.retryable ?? true,
        };
        lastApiStatus = { success: false, error: apiError, timestamp: new Date() };
        console.error(`Market API error [${apiError.code}]: ${apiError.message}`);
        return null;
      }
    }

    // Handle proxy response wrapper OR raw API response
    const data = responseData?.success ? responseData.data : responseData;
    
    // Handle different API response formats
    let candles: MarketTick[] = [];
    let currentPrice = 0;

    const mapApiCandle = (item: any): MarketTick => ({
      time: parseApiCandleTime(item.candle_time ?? item.time ?? item.epoch ?? item.t),
      open: parseNumericValue(item.open ?? item.o),
      high: parseNumericValue(item.high ?? item.h),
      low: parseNumericValue(item.low ?? item.l),
      close: parseNumericValue(item.close ?? item.c),
      volume: parseNumericValue(item.volume ?? item.v),
    });

    const normalizeCandles = (items: any[]): MarketTick[] => {
      return items
        .filter((item) => item && (item.pair === formattedSymbol || !item.pair))
        .map(mapApiCandle)
        .filter((candle) => candle.high >= candle.low && candle.open > 0 && candle.close > 0)
        .sort((a, b) => a.time - b.time);
    };
    
    // New API format: { data: [{ pair, time, epoch, open, high, low, close }] }
    if (data?.data && Array.isArray(data.data)) {
      candles = normalizeCandles(data.data);
      currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;
    } else if (Array.isArray(data)) {
      candles = normalizeCandles(data);
      currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;
      currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;
    } else if (data.price || data.currentPrice) {
      currentPrice = parseFloat(data.price || data.currentPrice);
    }
    
    console.log(`Fetched ${candles.length} candles for ${formattedSymbol}, current price: ${currentPrice}`);
    
    // Update API status on success
    lastApiStatus = { success: true, timestamp: new Date() };
    
    return {
      candles,
      currentPrice,
      entryPrice: currentPrice,
      symbol: formattedSymbol,
      fetchedAt: new Date(),
    };
  } catch (error) {
    let apiError: ApiError;
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        apiError = { code: 'TIMEOUT', message: 'Request timeout', retryable: true };
      } else if (error.message.includes('Failed to fetch')) {
        apiError = { code: 'CONNECTION_REFUSED', message: 'Network error', retryable: true };
      } else {
        apiError = { code: 'UNKNOWN', message: error.message, retryable: true };
      }
    } else {
      apiError = { code: 'UNKNOWN', message: 'Unknown error', retryable: true };
    }
    
    lastApiStatus = { success: false, error: apiError, timestamp: new Date() };
    console.error(`Market API error [${apiError.code}]: ${apiError.message}`);
    return null;
  }
};

// Get current price for result validation
export const getCurrentPrice = async (symbol: string): Promise<number | null> => {
  const data = await fetchMarketData(symbol);
  return data?.currentPrice || null;
};

// Store for tracking trade entries
interface TradeEntry {
  signalId: string;
  pair: string;
  direction: 'CALL' | 'PUT';
  entryPrice: number;
  entryTime: Date;
  tradeTime: Date; // The actual candle time for the trade
  marketData: LiveMarketData;
}

const activeTradeEntries = new Map<string, TradeEntry>();

export const recordTradeEntry = (
  signalId: string, 
  pair: string, 
  direction: 'CALL' | 'PUT', 
  entryPrice: number,
  marketData: LiveMarketData
): void => {
  const now = new Date();
  // Trade candle is the next minute (signal sent 1 min before)
  const tradeTime = new Date(now.getTime());
  tradeTime.setSeconds(0, 0);
  tradeTime.setMinutes(tradeTime.getMinutes() + 1);
  
  activeTradeEntries.set(signalId, {
    signalId,
    pair,
    direction,
    entryPrice,
    entryTime: now,
    tradeTime,
    marketData,
  });
};

export const getTradeEntry = (signalId: string): TradeEntry | undefined => {
  return activeTradeEntries.get(signalId);
};

export const clearTradeEntry = (signalId: string): void => {
  activeTradeEntries.delete(signalId);
};

// Get the specific candle for a given trade time
export const getTradeCandle = async (
  symbol: string,
  tradeTime: Date
): Promise<{ open: number; close: number; high: number; low: number } | null> => {
  const data = await fetchMarketData(symbol);
  
  if (!data || data.candles.length === 0) {
    return null;
  }
  
  // Find the candle that matches the trade time (compare minute precision)
  const tradeMinute = Math.floor(tradeTime.getTime() / 60000);
  
  for (const candle of data.candles) {
    const candleMinute = Math.floor(candle.time / 60000);
    if (candleMinute === tradeMinute) {
      return {
        open: candle.open,
        close: candle.close,
        high: candle.high,
        low: candle.low,
      };
    }
  }
  
  // If exact match not found, return the most recent candle
  const lastCandle = data.candles[data.candles.length - 1];
  return {
    open: lastCandle.open,
    close: lastCandle.close,
    high: lastCandle.high,
    low: lastCandle.low,
  };
};

// Accurate result validation using candle open/close comparison
// This follows the Python bot's logic exactly:
// - If close > open → Candle direction is CALL (bullish)
// - If close < open → Candle direction is PUT (bearish)
// - If close == open → DOJI (counts as WIN)
// - Win if signal direction matches candle direction
export const validateTradeResult = async (
  signalId: string, 
  direction: 'CALL' | 'PUT'
): Promise<{ 
  isWin: boolean; 
  entryPrice: number; 
  exitPrice: number; 
  priceDiff: number;
  candleDirection: 'CALL' | 'PUT' | 'DOJI';
  validationMethod: 'candle_direction' | 'price_comparison';
} | null> => {
  const entry = activeTradeEntries.get(signalId);
  
  if (!entry) {
    console.error('No trade entry found for signal:', signalId);
    return null;
  }
  
  // Try to get the exact trade candle for accurate validation
  const tradeCandle = await getTradeCandle(entry.pair, entry.tradeTime);
  
  if (!tradeCandle) {
    console.error('Could not fetch trade candle for:', entry.pair);
    // Clean up entry
    activeTradeEntries.delete(signalId);
    return null;
  }
  
  const { open, close } = tradeCandle;
  
  // Determine candle direction using Python bot's logic
  let candleDirection: 'CALL' | 'PUT' | 'DOJI';
  if (close > open) {
    candleDirection = 'CALL';
  } else if (close < open) {
    candleDirection = 'PUT';
  } else {
    candleDirection = 'DOJI';
  }
  
  // Determine result:
  // - DOJI always counts as WIN (market indecision, no clear loser)
  // - Otherwise, signal direction must match candle direction to WIN
  let isWin: boolean;
  if (candleDirection === 'DOJI') {
    isWin = true; // DOJI always counts as WIN per Python bot logic
    console.log(`DOJI detected - counting as WIN for ${entry.pair}`);
  } else {
    isWin = direction === candleDirection;
  }
  
  const priceDiff = close - open;
  
  console.log(`Trade validation for ${entry.pair}:`);
  console.log(`  Signal: ${direction}, Candle: ${candleDirection}`);
  console.log(`  Open: ${open.toFixed(5)}, Close: ${close.toFixed(5)}, Diff: ${priceDiff.toFixed(5)}`);
  console.log(`  Result: ${isWin ? 'WIN' : 'LOSS'}`);
  
  // Clean up entry
  activeTradeEntries.delete(signalId);
  
  return {
    isWin,
    entryPrice: open,
    exitPrice: close,
    priceDiff,
    candleDirection,
    validationMethod: 'candle_direction',
  };
};

// Legacy price comparison method (fallback)
export const validateTradeResultByPrice = async (
  signalId: string, 
  direction: 'CALL' | 'PUT'
): Promise<{ isWin: boolean; entryPrice: number; exitPrice: number; priceDiff: number } | null> => {
  const entry = activeTradeEntries.get(signalId);
  
  if (!entry) {
    return null;
  }
  
  const exitPrice = await getCurrentPrice(entry.pair);
  
  if (exitPrice === null) {
    return null;
  }
  
  const priceDiff = exitPrice - entry.entryPrice;
  const isWin = direction === 'CALL' ? priceDiff > 0 : priceDiff < 0;
  
  activeTradeEntries.delete(signalId);
  
  return {
    isWin,
    entryPrice: entry.entryPrice,
    exitPrice,
    priceDiff,
  };
};

// Convert API candles to chart format
export const convertToChartCandles = (apiCandles: MarketTick[]): {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}[] => {
  return apiCandles.map((candle, index) => ({
    time: new Date(candle.time || Date.now() - (apiCandles.length - index) * 60000),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }));
};
