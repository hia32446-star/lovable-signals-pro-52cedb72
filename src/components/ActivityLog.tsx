import { ActivityLog as ActivityLogType } from '@/types/trading';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText } from 'lucide-react';

interface ActivityLogProps {
  logs: ActivityLogType[];
}

export const ActivityLog = ({ logs }: ActivityLogProps) => {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const getLogClass = (type: ActivityLogType['type']) => {
    switch (type) {
      case 'win':
        return 'win';
      case 'loss':
        return 'loss';
      case 'signal':
        return 'signal';
      case 'mtg':
        return 'signal';
      case 'error':
        return 'loss';
      default:
        return 'info';
    }
  };

  const getLogIcon = (type: ActivityLogType['type']) => {
    switch (type) {
      case 'win':
        return '✅';
      case 'loss':
        return '❌';
      case 'signal':
        return '📊';
      case 'mtg':
        return '🔄';
      case 'error':
        return '⚠️';
      default:
        return 'ℹ️';
    }
  };


  return (
    <div className="glass-panel p-4 h-[280px] flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-primary">Activity Log</h3>
      </div>

      <ScrollArea className="flex-1 pr-2">
        <div className="space-y-1 font-mono text-xs">
          {logs.length === 0 ? (
            <div className="text-muted-foreground text-center py-8">
              No activity yet. Start the bot to see signals.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className={`activity-log-entry ${getLogClass(log.type)} animate-slide-in`}
              >
                <span className="text-muted-foreground">[{formatTime(log.timestamp)}]</span>
                <span className="mx-1">{getLogIcon(log.type)}</span>
                <span>{log.message}</span>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
