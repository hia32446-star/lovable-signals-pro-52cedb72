import { useState, useCallback } from 'react';
import { CurrencyPair, TelegramConfig } from '@/types/trading';
import { realMarketPairs, otcMarketPairs } from '@/data/currencyPairs';
import { useTradingBot } from '@/hooks/useTradingBot';
import { Header } from '@/components/Header';
import { PairSelector } from '@/components/PairSelector';
import { StatsPanel } from '@/components/StatsPanel';
import { ActivityLog } from '@/components/ActivityLog';
import { BotControl } from '@/components/BotControl';
import { TelegramConfig as TelegramConfigComponent } from '@/components/TelegramConfig';
import { AnalysisDashboard } from '@/components/AnalysisDashboard';
import { ChartView } from '@/components/ChartView';

const Index = () => {
  const [currentView, setCurrentView] = useState<'main' | 'analysis' | 'chart'>('main');
  const [realPairs, setRealPairs] = useState<CurrencyPair[]>(realMarketPairs);
  const [otcPairs, setOtcPairs] = useState<CurrencyPair[]>(otcMarketPairs);
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>({
    botToken: '',
    chatId: '',
    isEnabled: false,
  });

  const allActivePairs = [...realPairs, ...otcPairs];
  
  const {
    isRunning,
    stats,
    activityLog,
    startBot,
    stopBot,
  } = useTradingBot(allActivePairs, telegramConfig);

  const toggleRealPair = useCallback((symbol: string) => {
    setRealPairs(prev =>
      prev.map(pair =>
        pair.symbol === symbol ? { ...pair, isActive: !pair.isActive } : pair
      )
    );
  }, []);

  const toggleOtcPair = useCallback((symbol: string) => {
    setOtcPairs(prev =>
      prev.map(pair =>
        pair.symbol === symbol ? { ...pair, isActive: !pair.isActive } : pair
      )
    );
  }, []);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-[1600px] mx-auto">
        <Header 
          currentView={currentView} 
          onViewChange={setCurrentView}
          isOnline={isRunning}
        />

        {currentView === 'main' && (
          <div className="grid grid-cols-[1fr_320px] gap-4">
            <div className="space-y-4">
              <PairSelector
                title="Real Markets"
                icon="real"
                pairs={realPairs}
                onTogglePair={toggleRealPair}
              />
              
              <PairSelector
                title="OTC Markets"
                icon="otc"
                pairs={otcPairs}
                onTogglePair={toggleOtcPair}
              />

              <div className="flex gap-3">
                <div className="flex-1">
                  <BotControl
                    isRunning={isRunning}
                    onStart={startBot}
                    onStop={stopBot}
                  />
                </div>
                <TelegramConfigComponent
                  config={telegramConfig}
                  onUpdate={setTelegramConfig}
                />
              </div>
            </div>

            <div className="space-y-4">
              <StatsPanel stats={stats} isRunning={isRunning} />
              <ActivityLog logs={activityLog} />
            </div>
          </div>
        )}

        {currentView === 'analysis' && (
          <AnalysisDashboard stats={stats} logs={activityLog} />
        )}

        {currentView === 'chart' && (
          <ChartView />
        )}
      </div>
    </div>
  );
};

export default Index;
