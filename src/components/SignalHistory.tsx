import { useState, useEffect } from 'react';
import { Signal } from '@/types/trading';
import { fetchRecentSignals, fetchHistoricalStats, DbDailyStats } from '@/services/signalTrackingService';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Activity, Calendar, BarChart3 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SignalHistoryProps {
  refreshTrigger?: number;
}

export const SignalHistory = ({ refreshTrigger }: SignalHistoryProps) => {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [dailyStats, setDailyStats] = useState<DbDailyStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      const [signalsData, statsData] = await Promise.all([
        fetchRecentSignals(100),
        fetchHistoricalStats(7),
      ]);
      setSignals(signalsData);
      setDailyStats(statsData);
      setIsLoading(false);
    };

    loadData();
  }, [refreshTrigger]);

  const getStatusBadge = (status: Signal['status']) => {
    switch (status) {
      case 'win':
        return <Badge className="bg-success text-success-foreground">WIN</Badge>;
      case 'loss':
        return <Badge variant="destructive">LOSS</Badge>;
      case 'mtg':
        return <Badge className="bg-primary text-primary-foreground">MTG WIN</Badge>;
      case 'mtg_pending':
        return <Badge variant="outline" className="animate-pulse text-warning border-warning/50">MTG...</Badge>;
      case 'active':
        return <Badge variant="outline" className="animate-pulse">ACTIVE</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getDirectionIcon = (direction: string) => {
    return direction === 'CALL' ? (
      <TrendingUp className="w-4 h-4 text-success" />
    ) : (
      <TrendingDown className="w-4 h-4 text-destructive" />
    );
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  // Calculate totals from historical data
  const totalStats = dailyStats.reduce(
    (acc, day) => ({
      wins: acc.wins + day.wins,
      losses: acc.losses + day.losses,
      mtgWins: acc.mtgWins + day.mtg_wins,
      totalSignals: acc.totalSignals + day.total_signals,
    }),
    { wins: 0, losses: 0, mtgWins: 0, totalSignals: 0 }
  );

  const overallWinRate =
    totalStats.wins + totalStats.mtgWins + totalStats.losses > 0
      ? ((totalStats.wins + totalStats.mtgWins) /
          (totalStats.wins + totalStats.mtgWins + totalStats.losses)) *
        100
      : 0;

  if (isLoading) {
    return (
      <div className="glass-panel p-8 flex items-center justify-center">
        <Activity className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading history...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-panel border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Total Signals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">{totalStats.totalSignals}</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-success" />
              Wins
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-success">
              {totalStats.wins + totalStats.mtgWins}
            </p>
            <p className="text-xs text-muted-foreground">
              ({totalStats.wins} direct + {totalStats.mtgWins} MTG)
            </p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-destructive" />
              Losses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{totalStats.losses}</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Win Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-success">{overallWinRate.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Stats */}
      {dailyStats.length > 0 && (
        <Card className="glass-panel border-0">
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              Daily Performance (Last 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {dailyStats.map((day) => (
                <div
                  key={day.date}
                  className="flex-shrink-0 glass-panel p-3 rounded-lg min-w-[100px] text-center"
                >
                  <p className="text-xs text-muted-foreground">{formatDate(day.date)}</p>
                  <p className="text-lg font-bold text-success">{day.wins + day.mtg_wins}W</p>
                  <p className="text-sm text-destructive">{day.losses}L</p>
                  <p className="text-xs text-muted-foreground">{day.win_rate.toFixed(0)}%</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Signal History Table */}
      <Card className="glass-panel border-0">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Recent Signals ({signals.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="text-muted-foreground">Time</TableHead>
                  <TableHead className="text-muted-foreground">Pair</TableHead>
                  <TableHead className="text-muted-foreground">Direction</TableHead>
                  <TableHead className="text-muted-foreground">Strategy</TableHead>
                  <TableHead className="text-muted-foreground">Confidence</TableHead>
                  <TableHead className="text-muted-foreground">Entry</TableHead>
                  <TableHead className="text-muted-foreground">Exit</TableHead>
                  <TableHead className="text-muted-foreground">Source</TableHead>
                  <TableHead className="text-muted-foreground">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signals.map((signal) => (
                  <TableRow key={signal.id} className="border-border/30">
                    <TableCell className="font-mono text-xs">
                      {formatTime(signal.entryTime)}
                    </TableCell>
                    <TableCell className="font-medium">{signal.pair}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {getDirectionIcon(signal.direction)}
                        <span
                          className={
                            signal.direction === 'CALL' ? 'text-success' : 'text-destructive'
                          }
                        >
                          {signal.direction}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                      {signal.strategy}
                    </TableCell>
                    <TableCell>
                      <span className="text-primary font-medium">{signal.confidence}%</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {signal.openPrice?.toFixed(5) || '-'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {signal.closePrice?.toFixed(5) || '-'}
                    </TableCell>
                    <TableCell>
                      {signal.dataSource === 'live' ? (
                        <Badge className="bg-success/20 text-success border-success/30 text-xs">
                          🔴 LIVE
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground text-xs">
                          ⚪ SIM
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(signal.status)}</TableCell>
                  </TableRow>
                ))}
                {signals.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      No signals recorded yet. Start the bot to generate signals.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
