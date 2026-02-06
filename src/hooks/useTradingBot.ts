import { useState, useCallback, useRef, useEffect } from 'react';
import { Signal, TradingStats, ActivityLog, CurrencyPair, TelegramConfig, SignalDirection, PairStats } from '@/types/trading';
import { generateChartImage, blobToBase64 } from '@/utils/chartImageGenerator';
import { generateRealtimeCandles, MarketCandle } from '@/utils/marketSimulator';
import { analyzeMarketAdvanced } from '@/utils/technicalAnalysis';
import { fetchMarketData, recordTradeEntry, validateTradeResult, LiveMarketData, convertToChartCandles } from '@/utils/marketApi';
import { 
  saveSignal, 
  updateSignalResult, 
  updateDailyStats, 
  updatePairStats as updateDbPairStats,
  fetchTodayStats,
  fetchAllPairStats,
  fetchRecentSignals,
  countActiveSignals,
  getPairStats as getDbPairStats,
} from '@/services/signalTrackingService';

const generateId = () => Math.random().toString(36).substr(2, 9);

const getRandomElement = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const useTradingBot = (activePairs: CurrencyPair[], telegramConfig: TelegramConfig) => {
  const [isRunning, setIsRunning] = useState(false);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [stats, setStats] = useState<TradingStats>({
    wins: 0,
    losses: 0,
    mtgWins: 0,
    winRate: 0,
    totalSignals: 0,
    activeSignals: 0,
  });
  const [pairStats, setPairStats] = useState<Map<string, PairStats>>(new Map());
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mtgStateRef = useRef<Map<string, { step: number; lastDirection: SignalDirection }>>(new Map());

  const addLog = useCallback((type: ActivityLog['type'], message: string) => {
    const log: ActivityLog = {
      id: generateId(),
      timestamp: new Date(),
      type,
      message,
    };
    setActivityLog(prev => [log, ...prev].slice(0, 100));
  }, []);

  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`;
  };

  const generateChartCaption = (signal: Signal) => {
    return `${signal.pair} - ${signal.direction}`;
  };

  const sendToTelegram = useCallback(async (
    signal: Signal, 
    isResult: boolean = false, 
    currentPairStats?: PairStats,
    currentStats?: { wins: number; losses: number; mtgWins: number },
    marketCandles?: MarketCandle[]
  ) => {
    if (!telegramConfig.isEnabled || !telegramConfig.botToken || !telegramConfig.chatId) return;

    const directionEmoji = signal.direction === 'CALL' ? '🟢' : '🔴';
    const time = new Date(signal.entryTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const marketType = signal.pair.includes('OTC') ? '(OTC)' : '';
    const pairName = signal.pair.replace(' (OTC)', '').replace('-OTC', '');
    const displayPair = `${pairName} ${marketType}`.trim();
    
    // Generate a simulated price
    const basePrice = 1.0 + Math.random() * 50;
    const price = basePrice.toFixed(4);
    
    // Escape underscores for Telegram Markdown
    const esc = (s: string) => s.replace(/_/g, '\\_');
    
    let message = '';
    if (!isResult) {
      const pStats = currentPairStats || { wins: 0, losses: 0 };
      const pairWinRate = (pStats.wins + pStats.losses) > 0 
        ? Math.round((pStats.wins / (pStats.wins + pStats.losses)) * 100) 
        : 0;
      
      message = `🏆 ==== TR TALHA PRO ==== 🏆

🌐 ${esc(displayPair)}
⏰ ${time}
⏱ M1
${directionEmoji} ${signal.direction}
💋 ${price}

🎰 Current Pair: ${pStats.wins}x${pStats.losses} ·◈· (${pairWinRate}%)
🇲🇴 Signal : ${formatDate(signal.entryTime)}`;

      // Generate and send chart image for signals with real market data
      try {
        const chartBlob = await generateChartImage({
          pair: displayPair,
          direction: signal.direction,
          price,
          time,
          entryTime: new Date(signal.entryTime),
          candles: marketCandles, // Pass pre-analyzed market candles
        });
        
        const base64Image = await blobToBase64(chartBlob);
        
        // Send photo with caption
        const formData = new FormData();
        formData.append('chat_id', telegramConfig.chatId);
        formData.append('photo', chartBlob, 'chart.png');
        formData.append('caption', message);
        formData.append('parse_mode', 'Markdown');
        
        await fetch(`https://api.telegram.org/bot${telegramConfig.botToken}/sendPhoto`, {
          method: 'POST',
          body: formData,
        });
        
        addLog('info', `Chart image sent to Telegram for ${signal.pair}`);
        return;
      } catch (chartError) {
        addLog('error', `Chart generation failed, sending text only: ${chartError}`);
        // Fall through to send text message
      }

    } else {
      const resultEmoji = signal.status === 'win' ? '✅✅✅' : signal.status === 'mtg' ? '🔄✅✅' : '❌❌❌';
      const resultText = signal.status === 'win' ? 'WIN' : signal.status === 'mtg' ? 'MTG WIN' : 'LOSS';
      
      // Use passed stats for accurate calculation
      const statsToUse = currentStats || stats;
      const totalWins = statsToUse.wins + statsToUse.mtgWins;
      const totalDecided = totalWins + statsToUse.losses;
      const overallWinRate = totalDecided > 0 ? Math.round((totalWins / totalDecided) * 100) : 0;
      
      const pStats = currentPairStats || { wins: 0, losses: 0 };
      const pairWinRate = (pStats.wins + pStats.losses) > 0 
        ? Math.round((pStats.wins / (pStats.wins + pStats.losses)) * 100) 
        : 0;
      
      message = `=========== RESULT ============

🏆 ${esc(displayPair)}
⏰ ${time}

${resultEmoji} ${resultText}
${signal.status === 'mtg' ? `🔄 MTG Step: ${signal.mtgStep}/3\n` : ''}
🎰 Win: ${totalWins} | Loss: ${statsToUse.losses} (${overallWinRate}%)
🇲🇴 Esse par: ${pStats.wins}x${pStats.losses} (${pairWinRate}%)`;
    }

    try {
      await fetch(`https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramConfig.chatId,
          text: message,
          parse_mode: 'Markdown',
        }),
      });
    } catch (error) {
      addLog('error', `Failed to send Telegram message: ${error}`);
    }
  }, [telegramConfig, stats, addLog]);

  // Advanced market analysis using real API data + multi-indicator confluence
  const analyzeMarket = useCallback(async (pair: CurrencyPair): Promise<{ 
    direction: SignalDirection; 
    confidence: number; 
    strategy: string;
    marketData: { candles: MarketCandle[]; currentPrice: number };
    liveData?: LiveMarketData;
  } | null> => {
    const entryTime = new Date(Date.now() + 60000); // 1 minute ahead
    
    // Try to fetch real market data from API
    let liveData: LiveMarketData | null = null;
    let candlesForAnalysis: MarketCandle[] = [];
    
    try {
      addLog('info', `Fetching real market data for ${pair.symbol}...`);
      liveData = await fetchMarketData(pair.symbol);
      
      if (liveData && liveData.candles.length > 0) {
        addLog('info', `✅ Live data received: ${liveData.candles.length} candles @ ${liveData.currentPrice.toFixed(5)}`);
        
        // Convert API candles to MarketCandle format
        candlesForAnalysis = liveData.candles.map((c, i) => ({
          time: new Date(c.time || Date.now() - (liveData!.candles.length - i) * 60000),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume || 0,
        }));
      } else {
        addLog('info', `API returned no candles, using simulated data`);
      }
    } catch (error) {
      addLog('info', `API unavailable, using simulated data`);
    }
    
    // Fallback to simulated data if API fails
    if (candlesForAnalysis.length < 20) {
      const simulatedData = generateRealtimeCandles(pair.symbol, 60, entryTime, 'CALL');
      candlesForAnalysis = simulatedData.candles;
      if (!liveData) {
        liveData = {
          candles: candlesForAnalysis.map(c => ({
            time: c.time.getTime(),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })),
          currentPrice: simulatedData.currentPrice,
          entryPrice: simulatedData.currentPrice,
          symbol: pair.symbol,
          fetchedAt: new Date(),
        };
      }
    }
    
    // Run advanced technical analysis on real/simulated data
    const analysis = analyzeMarketAdvanced(candlesForAnalysis);
    
    if (!analysis) {
      return null;
    }
    
    // Risk filter - skip high-risk signals
    if (analysis.riskLevel === 'high' && analysis.confidence < 93) {
      addLog('info', `Skipping ${pair.symbol} - High risk signal filtered`);
      return null;
    }
    
    // For chart generation, use real data if available or generate aligned simulated data
    let chartCandles: MarketCandle[];
    if (liveData && liveData.candles.length >= 20) {
      // Use last 35 real candles for chart
      chartCandles = candlesForAnalysis.slice(-35);
    } else {
      // Generate aligned candles for chart
      const alignedMarketData = generateRealtimeCandles(pair.symbol, 35, entryTime, analysis.direction);
      chartCandles = alignedMarketData.candles;
    }
    
    // Log indicator confluence
    const activeIndicators = Object.entries(analysis.indicators)
      .filter(([_, v]) => v.signal !== 'neutral' && v.strength > 0.3)
      .map(([k, v]) => `${k}:${v.signal}`)
      .join(', ');
    
    addLog('info', `📊 Analysis: ${activeIndicators}`);
    addLog('info', `📈 Trend: ${analysis.trendStrength > 0.5 ? 'Strong' : 'Moderate'} | Risk: ${analysis.riskLevel}`);
    
    return {
      direction: analysis.direction,
      confidence: analysis.confidence,
      strategy: analysis.strategy,
      marketData: {
        candles: chartCandles,
        currentPrice: liveData?.currentPrice || chartCandles[chartCandles.length - 1].close,
      },
      liveData: liveData || undefined,
    };
  }, [addLog]);

  const generateSignal = useCallback(async () => {
    const eligiblePairs = activePairs.filter(p => p.isActive);
    if (eligiblePairs.length === 0) {
      addLog('info', 'No active pairs selected');
      return;
    }

    // Randomly select a pair
    const pair = getRandomElement(eligiblePairs);
    
    // Analyze market (async)
    const analysis = await analyzeMarket(pair);
    if (!analysis) {
      addLog('info', `No clear signal for ${pair.symbol}`);
      return;
    }

    // Check MTG state
    const mtgState = mtgStateRef.current.get(pair.symbol);
    let mtgStep = 0;
    let direction = analysis.direction;
    let strategy = analysis.strategy;
    
    if (mtgState && mtgState.step > 0 && mtgState.step < 3) {
      // Continue MTG sequence
      direction = mtgState.lastDirection;
      mtgStep = mtgState.step + 1;
      strategy = 'MTG Profit Recovery';
      addLog('mtg', `MTG Step ${mtgStep}/3 for ${pair.symbol}`);
    }

    // Entry time is 1 minute from now (signal sent 1 minute before trade)
    const entryTime = new Date(Date.now() + 60000);
    
    const signal: Signal = {
      id: generateId(),
      pair: pair.symbol,
      direction,
      entryTime: entryTime,
      confidence: analysis.confidence,
      strategy,
      status: 'active',
      mtgStep,
      openPrice: analysis.liveData?.entryPrice || analysis.marketData.currentPrice,
    };

    // Determine data source for tracking
    const dataSource = analysis.liveData ? 'live' : 'simulated';

    // Record trade entry for real result validation
    if (analysis.liveData) {
      recordTradeEntry(signal.id, pair.symbol, direction, analysis.liveData.entryPrice, analysis.liveData);
      addLog('info', `📝 Entry recorded @ ${analysis.liveData.entryPrice.toFixed(5)}`);
    }

    // *** PERSIST SIGNAL TO DATABASE ***
    const saved = await saveSignal(signal, signal.openPrice || null, dataSource as 'live' | 'simulated');
    if (saved) {
      addLog('info', `💾 Signal saved to database (${dataSource})`);
    }

    setSignals(prev => [signal, ...prev].slice(0, 50));
    addLog('signal', `🎯 Signal Generated: ${pair.symbol} ${direction} (${analysis.confidence}%)`);
    addLog('info', `⏰ Entry in 1 minute - Based on ${strategy}`);

    // Get current pair stats for telegram
    const currentPairStats = pairStats.get(pair.symbol) || { wins: 0, losses: 0 };

    // Send to Telegram immediately (1 minute before entry) with real market data
    sendToTelegram(signal, false, currentPairStats, undefined, analysis.marketData.candles);

    // Resolve result 2 minutes from now (1 min wait + 1 min trade)
    setTimeout(() => resolveSignal(signal, dataSource as 'live' | 'simulated'), 120000);

    setStats(prev => ({
      ...prev,
      totalSignals: prev.totalSignals + 1,
      activeSignals: prev.activeSignals + 1,
    }));
  }, [activePairs, analyzeMarket, addLog, sendToTelegram, pairStats]);

  const resolveSignal = useCallback(async (signal: Signal, initialDataSource: 'live' | 'simulated' = 'simulated') => {
    // Try to validate with real market data using candle direction comparison
    // This follows the Python bot's accurate validation logic
    let isWin: boolean;
    let entryPrice = signal.openPrice || 0;
    let exitPrice = 0;
    let priceDiff = 0;
    let usedRealData = false;
    let finalDataSource: 'live' | 'simulated' = initialDataSource;
    let candleDirection: 'CALL' | 'PUT' | 'DOJI' | null = null;
    
    try {
      const realResult = await validateTradeResult(signal.id, signal.direction);
      
      if (realResult) {
        // Use REAL market candle data for accurate result
        // Python bot logic: compare candle open vs close to determine direction
        isWin = realResult.isWin;
        entryPrice = realResult.entryPrice;
        exitPrice = realResult.exitPrice;
        priceDiff = realResult.priceDiff;
        candleDirection = realResult.candleDirection;
        usedRealData = true;
        finalDataSource = 'live';
        
        // Log accurate validation with candle direction
        const directionEmoji = candleDirection === 'CALL' ? '📈' : candleDirection === 'PUT' ? '📉' : '➖';
        addLog('info', `📊 Real validation: Open ${entryPrice.toFixed(5)} → Close ${exitPrice.toFixed(5)}`);
        addLog('info', `${directionEmoji} Candle: ${candleDirection} | Signal: ${signal.direction} → ${isWin ? '✅ MATCH' : '❌ MISMATCH'}`);
      } else {
        // Fallback to confidence-based simulation
        const winProbability = signal.confidence / 100;
        isWin = Math.random() < winProbability;
        finalDataSource = 'simulated';
        addLog('info', `⚠️ Using simulated result (API unavailable)`);
      }
    } catch (error) {
      // Fallback to confidence-based simulation
      const winProbability = signal.confidence / 100;
      isWin = Math.random() < winProbability;
      finalDataSource = 'simulated';
      addLog('info', `⚠️ Using simulated result (Error: ${error})`);
    }

    // Calculate the new status
    let newStatus: Signal['status'] = isWin ? 'win' : 'loss';
    let mtgStep = signal.mtgStep || 0;
    // Track whether this is a final result that should update stats
    let isFinalResult = true;
    
    // MTG logic determination (follows Python bot's martingale system)
    if (!isWin && mtgStep < 3) {
      // Start or continue MTG sequence — NOT a final result yet
      mtgStateRef.current.set(signal.pair, {
        step: mtgStep + 1,
        lastDirection: signal.direction,
      });
      newStatus = 'mtg_pending'; // Intermediate loss, waiting for MTG recovery
      isFinalResult = false;
      addLog('mtg', `🔄 MTG triggered for ${signal.pair} — advancing to step ${mtgStep + 1}/3`);
    } else if (!isWin && mtgStep >= 3) {
      // All MTG levels exhausted — FINAL LOSS
      newStatus = 'loss';
      mtgStateRef.current.delete(signal.pair);
      isFinalResult = true;
      addLog('loss', `💀 All MTG levels failed for ${signal.pair} — FINAL LOSS`);
    } else if (isWin && mtgStep > 0) {
      // MTG win - recovered through martingale
      newStatus = 'mtg';
      mtgStateRef.current.delete(signal.pair);
      isFinalResult = true;
    } else if (isWin) {
      // Regular win
      newStatus = 'win';
      mtgStateRef.current.delete(signal.pair);
      isFinalResult = true;
    }

    // Create the resolved signal with price data
    const resolvedSignal: Signal = {
      ...signal,
      status: newStatus,
      openPrice: entryPrice || signal.openPrice,
      closePrice: exitPrice || undefined,
    };

    // *** PERSIST RESULT TO DATABASE ***
    const resultSaved = await updateSignalResult(
      signal.id,
      newStatus,
      exitPrice || null,
      priceDiff || null,
      finalDataSource
    );
    if (resultSaved) {
      const sourceEmoji = finalDataSource === 'live' ? '🔴' : '⚪';
      addLog('info', `💾 Result saved (${sourceEmoji} ${finalDataSource.toUpperCase()})${candleDirection ? ` - Candle: ${candleDirection}` : ''}`);
    }

    // Only update stats and send result to Telegram on FINAL results
    if (isFinalResult) {
      // Update database stats
      if (newStatus === 'win' || newStatus === 'loss' || newStatus === 'mtg') {
        await updateDailyStats(newStatus);
        await updateDbPairStats(signal.pair, newStatus);
      }

      // Update signals list
      setSignals(prev => prev.map(s => s.id === signal.id ? resolvedSignal : s));

      // Update pair stats atomically and capture the new values
      let capturedPairStats: PairStats = { wins: 0, losses: 0 };
      setPairStats(prev => {
        const updated = new Map(prev);
        const current = prev.get(signal.pair) || { wins: 0, losses: 0 };
        
        if (newStatus === 'win' || newStatus === 'mtg') {
          capturedPairStats = { wins: current.wins + 1, losses: current.losses };
        } else {
          capturedPairStats = { wins: current.wins, losses: current.losses + 1 };
        }
        
        updated.set(signal.pair, capturedPairStats);
        return updated;
      });

      // Update global stats atomically and capture for Telegram
      let capturedGlobalStats = { wins: 0, losses: 0, mtgWins: 0 };
      setStats(prev => {
        const newWins = newStatus === 'win' ? prev.wins + 1 : prev.wins;
        const newMtgWins = newStatus === 'mtg' ? prev.mtgWins + 1 : prev.mtgWins;
        const newLosses = newStatus === 'loss' ? prev.losses + 1 : prev.losses;
        const totalDecided = newWins + newMtgWins + newLosses;
        const newWinRate = totalDecided > 0 ? ((newWins + newMtgWins) / totalDecided) * 100 : 0;
        
        capturedGlobalStats = { wins: newWins, losses: newLosses, mtgWins: newMtgWins };
        
        return {
          ...prev,
          wins: newWins,
          losses: newLosses,
          mtgWins: newMtgWins,
          activeSignals: Math.max(0, prev.activeSignals - 1),
          winRate: newWinRate,
        };
      });

      // Log the ACTUAL final result with price info
      const priceInfo = usedRealData ? ` (${entryPrice.toFixed(5)} → ${exitPrice.toFixed(5)})` : '';
      if (newStatus === 'win') {
        addLog('win', `✅ NORMAL WIN: ${signal.pair}${priceInfo}`);
      } else if (newStatus === 'mtg') {
        addLog('win', `🔄 MTG WIN: ${signal.pair} (Step ${mtgStep}/3)${priceInfo}`);
      } else {
        addLog('loss', `❌ FINAL LOSS: ${signal.pair} (all MTG levels failed)${priceInfo}`);
      }

      // Send result to Telegram with accurate stats
      setTimeout(() => {
        sendToTelegram(resolvedSignal, true, capturedPairStats, capturedGlobalStats);
      }, 50);
    } else {
      // MTG pending — just update the signal list UI but don't count in stats
      setSignals(prev => prev.map(s => s.id === signal.id ? resolvedSignal : s));
      setStats(prev => ({
        ...prev,
        activeSignals: Math.max(0, prev.activeSignals - 1),
      }));
    }
  }, [addLog, sendToTelegram]);

  const startBot = useCallback(() => {
    if (isRunning) return;
    
    setIsRunning(true);
    addLog('info', 'Bot Started');
    addLog('info', 'Strategy Engine ready');
    addLog('info', '50+ strategies active');
    addLog('info', 'Multi-timeframe analyzer ready');
    addLog('info', 'Signal buffer initialized');
    addLog('info', 'Waiting for signals...');

    // Generate signals every 3-4 minutes (180000-240000ms)
    const scheduleNext = () => {
      const delay = 180000 + Math.random() * 60000; // 3-4 minutes
      intervalRef.current = setTimeout(() => {
        generateSignal();
        scheduleNext();
      }, delay);
    };

    // Initial signal after 5 seconds
    setTimeout(() => {
      generateSignal();
      scheduleNext();
    }, 5000);
  }, [isRunning, addLog, generateSignal]);

  const stopBot = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    addLog('info', 'Bot Stopped');
  }, [addLog]);

  // Load persisted stats on mount
  useEffect(() => {
    const loadPersistedData = async () => {
      try {
        addLog('info', '📊 Loading persisted data...');
        
        // Load today's stats
        const todayStats = await fetchTodayStats();
        if (todayStats) {
          setStats(prev => ({
            ...prev,
            wins: todayStats.wins,
            losses: todayStats.losses,
            mtgWins: todayStats.mtgWins,
            winRate: todayStats.winRate,
            totalSignals: todayStats.totalSignals,
          }));
          addLog('info', `✅ Loaded today: ${todayStats.wins + todayStats.mtgWins}W/${todayStats.losses}L`);
        }

        // Load pair stats
        const persistedPairStats = await fetchAllPairStats();
        if (persistedPairStats.size > 0) {
          setPairStats(persistedPairStats);
          addLog('info', `✅ Loaded ${persistedPairStats.size} pair stats`);
        }

        // Load recent signals
        const recentSignals = await fetchRecentSignals(50);
        if (recentSignals.length > 0) {
          setSignals(recentSignals);
          
          // Count active signals
          const activeCount = await countActiveSignals();
          setStats(prev => ({ ...prev, activeSignals: activeCount }));
          
          addLog('info', `✅ Loaded ${recentSignals.length} recent signals`);
        }
      } catch (error) {
        addLog('error', `Failed to load persisted data: ${error}`);
      }
    };

    loadPersistedData();
  }, [addLog]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
    };
  }, []);

  return {
    isRunning,
    signals,
    stats,
    activityLog,
    startBot,
    stopBot,
    generateSignal,
  };
};
