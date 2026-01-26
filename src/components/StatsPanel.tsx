import { TradingStats } from '@/types/trading';
import { CheckSquare, XSquare, Zap, TrendingUp } from 'lucide-react';

interface StatsPanelProps {
  stats: TradingStats;
  isRunning: boolean;
}

export const StatsPanel = ({ stats, isRunning }: StatsPanelProps) => {
  return (
    <div className="glass-panel p-4 space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-primary">Today's Statistics</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="stat-card">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CheckSquare className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wider">Wins</span>
          </div>
          <span className="text-3xl font-bold text-success">{stats.wins}</span>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-2 text-muted-foreground">
            <XSquare className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wider">Losses</span>
          </div>
          <span className="text-3xl font-bold text-destructive">{stats.losses}</span>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Zap className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wider">MTG</span>
          </div>
          <span className="text-3xl font-bold text-primary">{stats.mtgWins}</span>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wider">Win Rate</span>
          </div>
          <span className="text-3xl font-bold text-success">
            {stats.winRate.toFixed(0)}%
          </span>
        </div>
      </div>

      <div className="glass-panel p-3 flex items-center justify-center gap-3">
        <div className={`w-3 h-3 rounded-full ${isRunning ? 'bg-success animate-pulse-glow' : 'bg-muted'}`} />
        <span className={`font-medium ${isRunning ? 'text-success' : 'text-muted-foreground'}`}>
          {isRunning ? 'Bot Running' : 'Bot Stopped'}
        </span>
      </div>
    </div>
  );
};
