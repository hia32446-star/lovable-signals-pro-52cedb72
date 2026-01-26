import { useState } from 'react';
import { TelegramConfig as TelegramConfigType } from '@/types/trading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Send, Settings } from 'lucide-react';

interface TelegramConfigProps {
  config: TelegramConfigType;
  onUpdate: (config: TelegramConfigType) => void;
}

export const TelegramConfig = ({ config, onUpdate }: TelegramConfigProps) => {
  const [localConfig, setLocalConfig] = useState(config);
  const [isOpen, setIsOpen] = useState(false);

  const handleSave = () => {
    onUpdate(localConfig);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Send className="w-4 h-4" />
          Telegram
          {config.isEnabled && <span className="w-2 h-2 bg-success rounded-full animate-pulse-glow" />}
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-panel border-primary/30">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Settings className="w-5 h-5" />
            Telegram Bot Configuration
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="telegram-enabled">Enable Telegram Notifications</Label>
            <Switch
              id="telegram-enabled"
              checked={localConfig.isEnabled}
              onCheckedChange={(checked) => 
                setLocalConfig(prev => ({ ...prev, isEnabled: checked }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bot-token">Bot Token</Label>
            <Input
              id="bot-token"
              type="password"
              placeholder="Enter your Telegram bot token"
              value={localConfig.botToken}
              onChange={(e) => 
                setLocalConfig(prev => ({ ...prev, botToken: e.target.value }))
              }
              className="bg-secondary border-border"
            />
            <p className="text-xs text-muted-foreground">
              Get this from @BotFather on Telegram
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="chat-id">Chat ID</Label>
            <Input
              id="chat-id"
              placeholder="Enter your chat or channel ID"
              value={localConfig.chatId}
              onChange={(e) => 
                setLocalConfig(prev => ({ ...prev, chatId: e.target.value }))
              }
              className="bg-secondary border-border"
            />
            <p className="text-xs text-muted-foreground">
              Your personal chat ID or channel ID (with @)
            </p>
          </div>

          <Button onClick={handleSave} className="w-full">
            Save Configuration
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
