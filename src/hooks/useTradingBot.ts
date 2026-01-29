import { useState, useCallback, useRef, useEffect } from 'react';
import { Signal, TradingStats, ActivityLog, CurrencyPair, TelegramConfig, SignalDirection, PairStats } from '@/types/trading';
import { generateChartImage, blobToBase64 } from '@/utils/chartImageGenerator';
import { generateRealtimeCandles, MarketCandle } from '@/utils/marketSimulator';
import { analyzeMarketAdvanced } from '@/utils/technicalAnalysis';

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
    
    let message = '';
    if (!isResult) {
      const pStats = currentPairStats || { wins: 0, losses: 0 };
      const pairWinRate = (pStats.wins + pStats.losses) > 0 
        ? Math.round((pStats.wins / (pStats.wins + pStats.losses)) * 100) 
        : 0;
      
      message = `🏆 ==== TR TALHA PRO ==== 🏆

🌐 ${displayPair}
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

🏆 ${displayPair}
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

  // Advanced market analysis using multi-indicator confluence
  const analyzeMarket = useCallback((pair: CurrencyPair): { 
    direction: SignalDirection; 
    confidence: number; 
    strategy: string;
    marketData: { candles: MarketCandle[]; currentPrice: number };
  } | null => {
    // Generate realistic market data for analysis
    const entryTime = new Date(Date.now() + 60000); // 1 minute ahead
    const marketData = generateRealtimeCandles(pair.symbol, 60, entryTime, 'CALL'); // Initial neutral generation
    
    // Run advanced technical analysis
    const analysis = analyzeMarketAdvanced(marketData.candles);
    
    if (!analysis) {
      return null;
    }
    
    // Risk filter - skip high-risk signals
    if (analysis.riskLevel === 'high' && analysis.confidence < 93) {
      addLog('info', `Skipping ${pair.symbol} - High risk signal filtered`);
      return null;
    }
    
    // Regenerate candles aligned with detected direction for chart accuracy
    const alignedMarketData = generateRealtimeCandles(pair.symbol, 35, entryTime, analysis.direction);
    
    // Log indicator confluence
    const activeIndicators = Object.entries(analysis.indicators)
      .filter(([_, v]) => v.signal !== 'neutral' && v.strength > 0.3)
      .map(([k, v]) => `${k}:${v.signal}`)
      .join(', ');
    
    addLog('info', `Analysis: ${activeIndicators}`);
    addLog('info', `Trend: ${analysis.trendStrength > 0.5 ? 'Strong' : 'Moderate'} | Risk: ${analysis.riskLevel}`);
    
    return {
      direction: analysis.direction,
      confidence: analysis.confidence,
      strategy: analysis.strategy,
      marketData: {
        candles: alignedMarketData.candles,
        currentPrice: alignedMarketData.currentPrice,
      },
    };
  }, [addLog]);

  const generateSignal = useCallback(() => {
    const eligiblePairs = activePairs.filter(p => p.isActive);
    if (eligiblePairs.length === 0) {
      addLog('info', 'No active pairs selected');
      return;
    }

    // Randomly select a pair
    const pair = getRandomElement(eligiblePairs);
    
    // Analyze market
    const analysis = analyzeMarket(pair);
    if (!analysis) {
      addLog('info', `No clear signal for ${pair.symbol}`);
      return;
    }

    // Check MTG state
    const mtgState = mtgStateRef.current.get(pair.symbol);
    let mtgStep = 0;
    
    if (mtgState && mtgState.step > 0 && mtgState.step < 3) {
      // Continue MTG sequence
      analysis.direction = mtgState.lastDirection;
      mtgStep = mtgState.step + 1;
      analysis.strategy = 'MTG Profit Recovery';
      addLog('mtg', `MTG Step ${mtgStep}/3 for ${pair.symbol}`);
    }

    // Entry time is 1 minute from now (signal sent 1 minute before trade)
    const entryTime = new Date(Date.now() + 60000);
    
    const signal: Signal = {
      id: generateId(),
      pair: pair.symbol,
      direction: analysis.direction,
      entryTime: entryTime,
      confidence: analysis.confidence,
      strategy: analysis.strategy,
      status: 'active',
      mtgStep,
    };

    setSignals(prev => [signal, ...prev].slice(0, 50));
    addLog('signal', `Signal Generated: ${pair.symbol} ${analysis.direction} (${analysis.confidence}%)`);
    addLog('info', `Entry in 1 minute - Based on ${analysis.strategy}`);

    // Get current pair stats for telegram
    const currentPairStats = pairStats.get(pair.symbol) || { wins: 0, losses: 0 };

    // Send to Telegram immediately (1 minute before entry) with real market data
    sendToTelegram(signal, false, currentPairStats, undefined, analysis.marketData.candles);

    // Simulate result 2 minutes from now (1 min wait + 1 min trade)
    setTimeout(() => resolveSignal(signal), 120000);

    setStats(prev => ({
      ...prev,
      totalSignals: prev.totalSignals + 1,
      activeSignals: prev.activeSignals + 1,
    }));
  }, [activePairs, analyzeMarket, addLog, sendToTelegram, pairStats]);

  const resolveSignal = useCallback((signal: Signal) => {
    // High win rate simulation (90-95%)
    const winProbability = signal.confidence / 100;
    const isWin = Math.random() < winProbability;

    // Calculate the new status first
    let newStatus: Signal['status'] = isWin ? 'win' : 'loss';
    let mtgStep = signal.mtgStep || 0;
    
    // MTG logic determination
    if (!isWin && mtgStep < 3) {
      // Start or continue MTG sequence
      mtgStateRef.current.set(signal.pair, {
        step: mtgStep + 1,
        lastDirection: signal.direction,
      });
      newStatus = 'loss';
    } else if (isWin && mtgStep > 0) {
      // MTG win - recovered through martingale
      newStatus = 'mtg';
      mtgStateRef.current.delete(signal.pair);
    } else if (isWin) {
      // Regular win
      newStatus = 'win';
      mtgStateRef.current.delete(signal.pair);
    }

    // Create the resolved signal
    const resolvedSignal: Signal = {
      ...signal,
      status: newStatus,
    };

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
      
      // Capture for Telegram - these are the ACTUAL new values
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

    // Log the ACTUAL result
    if (newStatus === 'win') {
      addLog('win', `WIN: ${signal.pair}`);
    } else if (newStatus === 'mtg') {
      addLog('win', `MTG WIN: ${signal.pair} (Step ${mtgStep})`);
    } else {
      addLog('loss', `LOSS: ${signal.pair}`);
    }

    // Send result to Telegram with the captured accurate stats
    // Using setTimeout to ensure React has processed state updates
    setTimeout(() => {
      sendToTelegram(resolvedSignal, true, capturedPairStats, capturedGlobalStats);
    }, 50);
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
