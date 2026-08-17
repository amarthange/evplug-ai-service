import { 
  History, 
  CalendarClock, 
  Zap, 
  Inbox,
  LayoutGrid
} from 'lucide-react';
import { 
  type StationWithWindows, 
  type MaintenanceWindow 
} from '@/lib/maintenance-scheduler';
import MaintenanceWindowCard from './MaintenanceWindowCard';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from '@/components/ui/badge';

interface MaintenanceWindowListProps {
  station: StationWithWindows;
}

export default function MaintenanceWindowList({ station }: MaintenanceWindowListProps) {
  const windows = station.maintenanceWindows || [];

  const activeWindows = windows.filter(w => w.status === 'active');
  const scheduledWindows = windows.filter(w => w.status === 'scheduled');
  const pastWindows = windows.filter(w => w.status === 'completed' || w.status === 'cancelled')
    .sort((a, b) => b.scheduledStart.getTime() - a.scheduledStart.getTime());

  if (windows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 border-2 border-dashed rounded-xl bg-muted/30">
        <div className="bg-muted p-3 rounded-full mb-3">
          <Inbox className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No maintenance windows found</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Schedule your first maintenance to keep things running smooth.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Section */}
      {activeWindows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600">Currently Active</h3>
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] bg-amber-100 text-amber-700 hover:bg-amber-100">
              {activeWindows.length}
            </Badge>
          </div>
          <div className="grid gap-3">
            {activeWindows.map(window => (
              <MaintenanceWindowCard key={window.id} window={window} station={station} />
            ))}
          </div>
        </div>
      )}

      {/* Scheduled Section */}
      {scheduledWindows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <CalendarClock className="w-4 h-4 text-blue-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600">Upcoming Windows</h3>
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] bg-blue-100 text-blue-700 hover:bg-blue-100">
              {scheduledWindows.length}
            </Badge>
          </div>
          <div className="grid gap-3">
            {scheduledWindows.map(window => (
              <MaintenanceWindowCard key={window.id} window={window} station={station} />
            ))}
          </div>
        </div>
      )}

      {/* History Section */}
      {pastWindows.length > 0 && (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="history" className="border-none">
            <AccordionTrigger className="hover:no-underline py-2 group px-1">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                  Historical Records
                </span>
                <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                  {pastWindows.length}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-3 pb-1">
              <div className="grid gap-3">
                {pastWindows.map(window => (
                  <div key={window.id} className="opacity-70 hover:opacity-100 transition-opacity">
                    <MaintenanceWindowCard window={window} station={station} />
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* Quick Stats / Summary Footer */}
      <div className="pt-2 px-1">
        <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between">
           <div className="flex items-center gap-2 text-xs text-muted-foreground">
             <LayoutGrid className="w-3.5 h-3.5" />
             <span>Station Coverage: <strong>{station.totalConnectors} Connectors</strong></span>
           </div>
           <div className="text-[10px] text-muted-foreground">
             Last Updated: {new Date().toLocaleTimeString()}
           </div>
        </div>
      </div>
    </div>
  );
}
