import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const MARKET_API_BASE = "http://217.154.173.102:11955/api/market/quotex/";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Helper to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Fetch with retry logic
async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout per attempt
      
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return response;
      }
      
      // Non-retryable HTTP errors
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Client error: ${response.status}`);
      }
      
      lastError = new Error(`Server error: ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on client errors or abort
      if (lastError.name === 'AbortError') {
        lastError = new Error('Request timeout');
      }
      
      console.log(`Attempt ${attempt}/${retries} failed: ${lastError.message}`);
    }
    
    // Wait before retry (exponential backoff)
    if (attempt < retries) {
      await delay(RETRY_DELAY_MS * attempt);
    }
  }
  
  throw lastError || new Error('All retry attempts failed');
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const symbol = url.searchParams.get('symbol');

  if (!symbol) {
    return new Response(
      JSON.stringify({ error: 'Missing symbol parameter', code: 'MISSING_PARAM' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`Fetching market data for: ${symbol}`);

  try {
    const response = await fetchWithRetry(`${MARKET_API_BASE}?symbol=${encodeURIComponent(symbol)}`);
    const data = await response.json();
    
    console.log(`Market data received for ${symbol}: ${data.candles?.length || (Array.isArray(data) ? data.length : 0)} candles`);

    return new Response(
      JSON.stringify({
        success: true,
        data,
        timestamp: Date.now(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      },
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isTimeout = errorMessage.includes('timeout');
    const isConnectionRefused = errorMessage.includes('Connection refused') || errorMessage.includes('connect error');
    
    console.error(`Proxy error for ${symbol}: ${errorMessage}`);

    // Determine error code for frontend handling
    let code = 'API_ERROR';
    if (isTimeout) code = 'TIMEOUT';
    if (isConnectionRefused) code = 'CONNECTION_REFUSED';

    // NOTE: Return HTTP 200 so clients (including Cloud SDK invocations) don't throw on non-2xx.
    // The real error is conveyed via success:false + code.
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        code,
        symbol,
        timestamp: Date.now(),
        retryable: isConnectionRefused || isTimeout,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      },
    );
  }
});
