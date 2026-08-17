import { useState } from 'react';
import { 
  Calendar, 
  Clock, 
  User, 
  MoreVertical, 
  Play, 
  XCircle, 
  CheckCircle2,
  AlertCircle,
  Timer,
  Zap
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  type MaintenanceWindow, 
  type StationWithWindows,
  formatWindowTimeRange,
  formatRelativeTime,
  activateWindow,
  deactivateWindow,
  cancelWindow
} from '@/lib/maintenance-scheduler';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface MaintenanceWindowCardProps {
  window: MaintenanceWindow;
  station: StationWithWindows;
}

export default function MaintenanceWindowCard({ window, station }: MaintenanceWindowCardProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const statusConfig = {
    scheduled: { color: 'bg-blue-500/10 text-blue-500', icon: Calendar, label: 'Scheduled' },
    active: { color: 'bg-amber-500/10 text-amber-500 animate-pulse', icon: Zap, label: 'Active' },
    completed: { color: 'bg-emerald-500/10 text-emerald-500', icon: CheckCircle2, label: 'Completed' },
    cancelled: { color: 'bg-slate-500/10 text-slate-500', icon: XCircle, label: 'Cancelled' },
  };

  const config = statusConfig[window.status];
  const Icon = config.icon;

  const handleAction = async (action: 'start' | 'end' | 'cancel') => {
    setIsLoading(true);
    try {
      if (action === 'start') {
        await activateWindow(window, station, db);
        toast({ title: "Maintenance Started", description: "The station/connector is now in maintenance mode." });
      } else if (action === 'end') {
        await deactivateWindow(window, station, db);
        toast({ title: "Maintenance Completed", description: "Station status has been restored to active." });
      } else if (action === 'cancel') {
        await cancelWindow(window, station, db);
        toast({ title: "Maintenance Cancelled", description: "The scheduled window has been removed." });
      }
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "Action Failed", 
        description: error.message || "Failed to perform action" 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isFullStation = window.affectedConnectorIds.length === 0;

  return (
    <Card className={cn(
      "overflow-hidden border-l-4",
      window.status === 'active' ? "border-l-amber-500" : 
      window.status === 'scheduled' ? "border-l-blue-500" : "border-l-slate-200"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn("px-1.5 py-0 h-5 text-[10px] uppercase font-bold", config.color)}>
                <Icon className="w-3 h-3 mr-1" />
                {config.label}
              </Badge>
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                {isFullStation ? "Entire Station" : `Connector ${window.affectedConnectorIds.join(', ')}`}
              </span>
            </div>
            
            <h4 className="font-semibold text-sm leading-none pt-1">
              {window.reason}
            </h4>
            
            <div className="flex flex-col gap-1 pt-2">
              <div className="flex items-center text-xs text-muted-foreground gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>{formatWindowTimeRange(window.scheduledStart, window.scheduledEnd)}</span>
              </div>
              
              {window.status === 'scheduled' && (
                <div className="flex items-center text-xs text-blue-500 font-medium gap-1.5">
                  <Timer className="w-3.5 h-3.5" />
                  <span>{formatRelativeTime(window.scheduledStart)}</span>
                </div>
              )}

              {window.status === 'active' && (
                <div className="flex items-center text-xs text-amber-500 font-medium gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Ending in {formatRelativeTime(window.scheduledEnd).replace('starts in ', '')}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {(window.status === 'scheduled' || window.status === 'active') && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isLoading}>
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {window.status === 'scheduled' && (
                    <>
                      <DropdownMenuItem onClick={() => handleAction('start')} className="text-amber-500">
                        <Play className="mr-2 h-4 w-4" />
                        Start Now
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleAction('cancel')} className="text-destructive">
                        <XCircle className="mr-2 h-4 w-4" />
                        Cancel Window
                      </DropdownMenuItem>
                    </>
                  )}
                  {window.status === 'active' && (
                    <DropdownMenuItem onClick={() => handleAction('end')} className="text-emerald-500 font-semibold">
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      End Early
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            
            {window.status === 'completed' && (
               <div className="text-[10px] text-muted-foreground italic flex items-center gap-1">
                 <CheckCircle2 className="w-3 h-3" />
                 History
               </div>
            )}
          </div>
        </div>
        
        <div className="mt-4 pt-3 border-t flex items-center justify-between text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <User className="w-3 h-3" />
            <span>ID: {window.createdBy.slice(0, 8)}</span>
          </div>
          <div>
            Ref: {window.id.slice(-6)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
