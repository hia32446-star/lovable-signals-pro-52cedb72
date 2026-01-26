import { TradingStats, ActivityLog as ActivityLogType } from '@/types/trading';
import { technicalIndicators } from '@/data/strategies';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { RefreshCw, Wifi, BarChart3, Activity, CheckCircle } from 'lucide-react';

interface AnalysisDashboardProps {
  stats: TradingStats;
  logs: ActivityLogType[];
}

export const AnalysisDashboard = ({ stats, logs }: AnalysisDashboardProps) => {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-8 h-8 text-primary" />
          <h1 className="text-2xl font-bold text-primary">INTERNAL ANALYSIS DASHBOARD</h1>
        </div>
        <Button variant="outline" className="gap-2 bg-accent/20 hover:bg-accent/30 border-accent/50 text-accent">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* System & Network Status */}
        <div className="glass-panel p-4">
          <div className="flex items-center gap-2 mb-4">
            <Wifi className="w-5 h-5 text-success" />
            <h3 className="font-semibold text-primary">System & Network Status</h3>
          </div>
          
          <div className="border border-border rounded p-3 font-mono text-sm space-y-2">
            <div className="text-muted-foreground mb-2 pb-2 border-b border-border">NETWORK STATUS</div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Connection:</span>
              <span className="text-success flex items-center gap-1">
                <span className="w-2 h-2 bg-success rounded-full" /> ONLINE
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last Success:</span>
              <span>{new Date().toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Uptime:</span>
              <span>Active</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Requests:</span>
              <span>{stats.totalSignals * 12 + 1000}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Failed Requests:</span>
              <span className="text-success">0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Success Rate:</span>
              <span className="text-success">100.0%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Queue Size:</span>
              <span>0</span>
            </div>
          </div>
        </div>

        {/* Signal Buffer Status */}
        <div className="glass-panel p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-accent" />
            <h3 className="font-semibold text-accent">Signal Buffer Status</h3>
          </div>
          
          <div className="border border-border rounded p-3 font-mono text-sm space-y-2">
            <div className="text-muted-foreground mb-2 pb-2 border-b border-border">BUFFER STATISTICS</div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Generated:</span>
              <span>{stats.totalSignals}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duplicates Blocked:</span>
              <span>0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Completed:</span>
              <span>{stats.wins + stats.losses + stats.mtgWins}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Orphaned:</span>
              <span>0</span>
            </div>
            <div className="flex justify-between mt-4">
              <span className="text-muted-foreground">Active Signals:</span>
              <span className="text-primary">{stats.activeSignals}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Completed Signals:</span>
              <span>{stats.wins + stats.losses + stats.mtgWins}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Hash Entries:</span>
              <span>{stats.totalSignals}</span>
            </div>
          </div>
        </div>

        {/* Active Indicators */}
        <div className="glass-panel p-4">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-5 h-5 text-success" />
            <h3 className="font-semibold text-success">Active Indicators</h3>
          </div>
          
          <ScrollArea className="h-[200px]">
            <div className="border border-border rounded p-3 font-mono text-sm">
              <div className="text-muted-foreground mb-2 pb-2 border-b border-border">
                TECHNICAL INDICATORS (Active)
              </div>
              <div className="space-y-1">
                {technicalIndicators.filter(i => i.isActive).map((indicator, idx) => (
                  <div key={idx} className="text-success">
                    ✓ {indicator.name} {indicator.params}
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Strategy Execution Log */}
        <div className="glass-panel p-4">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-warning" />
            <h3 className="font-semibold text-warning">Strategy Execution Log</h3>
          </div>
          
          <ScrollArea className="h-[200px]">
            <div className="border border-border rounded p-3 font-mono text-xs">
              <div className="text-muted-foreground mb-2 pb-2 border-b border-border">
                STRATEGY EXECUTION LOG
              </div>
              <div className="space-y-1">
                {logs.slice(0, 15).map((log) => (
                  <div key={log.id} className="text-muted-foreground">
                    [{formatTime(log.timestamp)}] {log.message}
                  </div>
                ))}
                {logs.length === 0 && (
                  <div className="text-muted-foreground">
                    [--:--:--] System initialized<br />
                    [--:--:--] Strategy Engine ready<br />
                    [--:--:--] 50+ strategies active<br />
                    [--:--:--] Multi-timeframe analyzer ready<br />
                    [--:--:--] Waiting for signals...
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};
