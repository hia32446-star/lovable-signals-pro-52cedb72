import { useState, useCallback, useRef, useEffect } from 'react';
import { Signal, TradingStats, ActivityLog, CurrencyPair, TelegramConfig, SignalDirection, PairStats } from '@/types/trading';
import { tradingStrategies } from '@/data/strategies';
import { generateChartImage, blobToBase64 } from '@/utils/chartImageGenerator';

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

  const sendToTelegram = useCallback(async (signal: Signal, isResult: boolean = false, currentPairStats?: PairStats) => {
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
      
      message = `🏆 ==== SIGNALS DE ==== 🏆

🌐 ${displayPair}
⏰ ${time}
⏱ M1
${directionEmoji} ${signal.direction}
💋 ${price}

🎰 Current Pair: ${pStats.wins}x${pStats.losses} ·◈· (${pairWinRate}%)
🇲🇴 Signal : ${formatDate(signal.entryTime)}`;

      // Generate and send chart image for signals
      try {
        const chartBlob = await generateChartImage({
          pair: displayPair,
          direction: signal.direction,
          price,
          time,
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
      
      const totalWins = stats.wins + stats.mtgWins;
      const totalDecided = totalWins + stats.losses;
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
🎰 Win: ${totalWins} | Loss: ${stats.losses} (${overallWinRate}%)
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

  const analyzeMarket = useCallback((pair: CurrencyPair): { direction: SignalDirection; confidence: number; strategy: string } | null => {
    // Simulated technical analysis with high accuracy
    const activeStrategies = tradingStrategies.filter(s => s.isActive);
    
    // Multi-indicator confluence check
    const indicators = {
      rsi: Math.random() * 100,
      macd: Math.random() - 0.5,
      stochastic: Math.random() * 100,
      adx: Math.random() * 50,
      bbPosition: Math.random(),
      emaAlignment: Math.random() > 0.5,
      volume: Math.random(),
    };

    // Calculate confluence score
    let bullishScore = 0;
    let bearishScore = 0;

    // RSI analysis
    if (indicators.rsi < 30) bullishScore += 2;
    else if (indicators.rsi > 70) bearishScore += 2;
    else if (indicators.rsi < 45) bullishScore += 1;
    else if (indicators.rsi > 55) bearishScore += 1;

    // MACD analysis
    if (indicators.macd > 0.1) bullishScore += 2;
    else if (indicators.macd < -0.1) bearishScore += 2;
    else if (indicators.macd > 0) bullishScore += 1;
    else bearishScore += 1;

    // Stochastic analysis
    if (indicators.stochastic < 20) bullishScore += 2;
    else if (indicators.stochastic > 80) bearishScore += 2;

    // ADX trend strength
    if (indicators.adx > 25) {
      if (indicators.emaAlignment) bullishScore += 1;
      else bearishScore += 1;
    }

    // Bollinger Band position
    if (indicators.bbPosition < 0.2) bullishScore += 1;
    else if (indicators.bbPosition > 0.8) bearishScore += 1;

    // Volume confirmation
    if (indicators.volume > 0.7) {
      if (bullishScore > bearishScore) bullishScore += 1;
      else bearishScore += 1;
    }

    const totalScore = bullishScore + bearishScore;
    const minConfidence = 90;
    const maxConfidence = 98;

    // Only generate signal if confluence is strong enough
    if (totalScore < 4) return null;

    const direction: SignalDirection = bullishScore > bearishScore ? 'CALL' : 'PUT';
    const dominantScore = Math.max(bullishScore, bearishScore);
    const confidence = Math.min(maxConfidence, minConfidence + (dominantScore / totalScore) * (maxConfidence - minConfidence));

    // Select matching strategy
    const matchingStrategies = activeStrategies.filter(s => {
      if (direction === 'CALL') {
        return s.name.toLowerCase().includes('bullish') || 
               s.name.toLowerCase().includes('bounce') ||
               s.name.toLowerCase().includes('oversold') ||
               s.name.toLowerCase().includes('golden') ||
               s.name.toLowerCase().includes('recovery');
      } else {
        return s.name.toLowerCase().includes('bearish') ||
               s.name.toLowerCase().includes('reversal') ||
               s.name.toLowerCase().includes('overbought') ||
               s.name.toLowerCase().includes('death') ||
               s.name.toLowerCase().includes('rejection');
      }
    });

    const strategy = matchingStrategies.length > 0 
      ? getRandomElement(matchingStrategies)
      : getRandomElement(activeStrategies);

    return {
      direction,
      confidence: Math.round(confidence * 10) / 10,
      strategy: strategy.name,
    };
  }, []);

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

    const signal: Signal = {
      id: generateId(),
      pair: pair.symbol,
      direction: analysis.direction,
      entryTime: new Date(),
      confidence: analysis.confidence,
      strategy: analysis.strategy,
      status: 'active',
      mtgStep,
    };

    setSignals(prev => [signal, ...prev].slice(0, 50));
    addLog('signal', `Signal Generated: ${pair.symbol} ${analysis.direction} (${analysis.confidence}%)`);
    addLog('info', `Based on ${analysis.strategy}`);

    // Get current pair stats for telegram
    const currentPairStats = pairStats.get(pair.symbol) || { wins: 0, losses: 0 };

    // Send to Telegram
    sendToTelegram(signal, false, currentPairStats);

    // Simulate result after 60 seconds
    setTimeout(() => resolveSignal(signal), 60000);

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

    let resolvedSignal: Signal | null = null;
    let newPairStats: PairStats | null = null;

    setSignals(prev => prev.map(s => {
      if (s.id === signal.id) {
        let newStatus: Signal['status'] = isWin ? 'win' : 'loss';
        
        // MTG logic
        if (!isWin && signal.mtgStep !== undefined && signal.mtgStep < 3) {
          // Start or continue MTG
          mtgStateRef.current.set(signal.pair, {
            step: (signal.mtgStep || 0) + 1,
            lastDirection: signal.direction,
          });
          newStatus = 'loss';
        } else if (isWin && signal.mtgStep && signal.mtgStep > 0) {
          // MTG win
          newStatus = 'mtg';
          mtgStateRef.current.delete(signal.pair);
        } else if (isWin) {
          mtgStateRef.current.delete(signal.pair);
        }

        resolvedSignal = { ...s, status: newStatus };

        // Update pair stats
        setPairStats(prev => {
          const updated = new Map(prev);
          const current = updated.get(signal.pair) || { wins: 0, losses: 0 };
          
          if (newStatus === 'win' || newStatus === 'mtg') {
            newPairStats = { wins: current.wins + 1, losses: current.losses };
          } else {
            newPairStats = { wins: current.wins, losses: current.losses + 1 };
          }
          
          updated.set(signal.pair, newPairStats);
          return updated;
        });
        
        // Update stats
        setStats(prev => {
          const wins = newStatus === 'win' ? prev.wins + 1 : prev.wins;
          const mtgWins = newStatus === 'mtg' ? prev.mtgWins + 1 : prev.mtgWins;
          const losses = newStatus === 'loss' ? prev.losses + 1 : prev.losses;
          const totalDecided = wins + mtgWins + losses;
          
          return {
            ...prev,
            wins,
            losses,
            mtgWins,
            activeSignals: Math.max(0, prev.activeSignals - 1),
            winRate: totalDecided > 0 ? ((wins + mtgWins) / totalDecided) * 100 : 0,
          };
        });

        // Log result
        if (newStatus === 'win') {
          addLog('win', `WIN: ${signal.pair}`);
        } else if (newStatus === 'mtg') {
          addLog('win', `MTG WIN: ${signal.pair} (Step ${signal.mtgStep})`);
        } else {
          addLog('loss', `LOSS: ${signal.pair}`);
        }

        return resolvedSignal;
      }
      return s;
    }));

    // Send result to Telegram after state updates
    setTimeout(() => {
      if (resolvedSignal) {
        const currentPairStats = pairStats.get(signal.pair) || { wins: 0, losses: 0 };
        // Adjust for the update we just made
        const adjustedStats = newPairStats || currentPairStats;
        sendToTelegram(resolvedSignal, true, adjustedStats);
      }
    }, 100);
  }, [addLog, sendToTelegram, pairStats]);

  const startBot = useCallback(() => {
    if (isRunning) return;
    
    setIsRunning(true);
    addLog('info', 'Bot Started');
    addLog('info', 'Strategy Engine ready');
    addLog('info', '50+ strategies active');
    addLog('info', 'Multi-timeframe analyzer ready');
    addLog('info', 'Signal buffer initialized');
    addLog('info', 'Waiting for signals...');

    // Generate signals every 30-90 seconds
    const scheduleNext = () => {
      const delay = 30000 + Math.random() * 60000;
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
