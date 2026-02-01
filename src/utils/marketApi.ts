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

// Convert pair symbol to API format
const formatSymbolForApi = (symbol: string): string => {
  // Remove spaces and standardize format
  // Examples: "EUR/USD (OTC)" -> "EURUSD-OTC", "BRLUSD-OTC" -> "BRLUSD-OTC"
  return symbol
    .replace(/\s*\(OTC\)\s*/i, '-OTC')
    .replace(/\s+/g, '')
    .replace('/', '');
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
    
    if (Array.isArray(data)) {
      candles = data.map((item: any) => ({
        time: item.time || item.t || Date.now(),
        open: parseFloat(item.open || item.o || 0),
        high: parseFloat(item.high || item.h || 0),
        low: parseFloat(item.low || item.l || 0),
        close: parseFloat(item.close || item.c || 0),
        volume: parseFloat(item.volume || item.v || 0),
      }));
      currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;
    } else if (data.data && Array.isArray(data.data)) {
      candles = data.data.map((item: any) => ({
        time: item.time || item.t || Date.now(),
        open: parseFloat(item.open || item.o || 0),
        high: parseFloat(item.high || item.h || 0),
        low: parseFloat(item.low || item.l || 0),
        close: parseFloat(item.close || item.c || 0),
        volume: parseFloat(item.volume || item.v || 0),
      }));
      currentPrice = data.price || data.currentPrice || (candles.length > 0 ? candles[candles.length - 1].close : 0);
    } else if (data.price || data.currentPrice) {
      currentPrice = parseFloat(data.price || data.currentPrice);
    }
    
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
  activeTradeEntries.set(signalId, {
    signalId,
    pair,
    direction,
    entryPrice,
    entryTime: new Date(),
    marketData,
  });
};

export const getTradeEntry = (signalId: string): TradeEntry | undefined => {
  return activeTradeEntries.get(signalId);
};

export const clearTradeEntry = (signalId: string): void => {
  activeTradeEntries.delete(signalId);
};

// Validate trade result using real market data
export const validateTradeResult = async (
  signalId: string, 
  direction: 'CALL' | 'PUT'
): Promise<{ isWin: boolean; entryPrice: number; exitPrice: number; priceDiff: number } | null> => {
  const entry = activeTradeEntries.get(signalId);
  
  if (!entry) {
    console.error('No trade entry found for signal:', signalId);
    return null;
  }
  
  // Fetch current price for exit
  const exitPrice = await getCurrentPrice(entry.pair);
  
  if (exitPrice === null) {
    console.error('Could not fetch exit price for:', entry.pair);
    return null;
  }
  
  const priceDiff = exitPrice - entry.entryPrice;
  
  // CALL wins if price went UP, PUT wins if price went DOWN
  const isWin = direction === 'CALL' ? priceDiff > 0 : priceDiff < 0;
  
  // Clean up entry
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
