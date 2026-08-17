import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

import { 
  type StationWithWindows, 
  type ConflictInfo,
  checkBookingConflicts 
} from '@/lib/maintenance-scheduler';

const formSchema = z.object({
  date: z.date({
    required_error: "Maintenance date is required.",
  }),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)"),
  duration: z.string().min(1, "Duration is required"),
  reason: z.string().min(5, "Reason must be at least 5 characters"),
  connectorId: z.string().default("all"),
});

type FormValues = z.infer<typeof formSchema>;

interface MaintenanceScheduleDialogProps {
  station: StationWithWindows;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function MaintenanceScheduleDialog({
  station,
  isOpen,
  onOpenChange,
  onSuccess
}: MaintenanceScheduleDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: new Date(),
      startTime: format(new Date(), 'HH:mm'),
      duration: "60",
      reason: "",
      connectorId: "all",
    },
  });

  const watchDate = form.watch('date');
  const watchStartTime = form.watch('startTime');
  const watchDuration = form.watch('duration');
  const watchConnectorId = form.watch('connectorId');

  // Debounced conflict check
  useEffect(() => {
    if (!isOpen) return;
    
    const check = async () => {
      const { start, end } = calculateRange();
      if (!start || !end) return;

      setIsCheckingConflicts(true);
      const connectorIds = watchConnectorId === 'all' 
        ? [] 
        : [watchConnectorId];
        
      const result = await checkBookingConflicts(db, station.stationId, connectorIds, start, end);
      setConflict(result);
      setIsCheckingConflicts(false);
    };

    const timer = setTimeout(check, 500);
    return () => clearTimeout(timer);
  }, [watchDate, watchStartTime, watchDuration, watchConnectorId, isOpen]);

  const calculateRange = () => {
    try {
      const [hours, minutes] = watchStartTime.split(':').map(Number);
      const start = new Date(watchDate);
      start.setHours(hours, minutes, 0, 0);
      
      const end = new Date(start.getTime() + parseInt(watchDuration) * 60000);
      return { start, end };
    } catch (e) {
      return { start: null, end: null };
    }
  };

  async function onSubmit(values: FormValues) {
    if (!user) return;
    setIsSubmitting(true);

    try {
      const { start, end } = calculateRange();
      if (!start || !end) throw new Error("Invalid time range");

      const windowId = `maint_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const connectorIds = values.connectorId === 'all' ? [] : [values.connectorId];

      const newWindow = {
        id: windowId,
        scheduledStart: Timestamp.fromDate(start),
        scheduledEnd: Timestamp.fromDate(end),
        affectedConnectorIds: connectorIds,
        reason: values.reason,
        status: 'scheduled',
        createdAt: Timestamp.now(),
        createdBy: user.uid,
        notifiedAt: null
      };

      const stationRef = doc(db, 'stations', station.stationId);
      await updateDoc(stationRef, {
        maintenanceWindows: arrayUnion(newWindow)
      });

      toast({
        title: "Maintenance Scheduled",
        description: `Successfully scheduled for ${format(start, 'PPP p')}`,
      });

      onOpenChange(false);
      form.reset();
      onSuccess?.();
    } catch (error: any) {
      console.error("Scheduling failed:", error);
      toast({
        variant: "destructive",
        title: "Scheduling Failed",
        description: error.message || "An unexpected error occurred",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Schedule Maintenance</DialogTitle>
          <DialogDescription>
            Schedule a maintenance window for {station.stationName}. 
            Station status will automatically update when the window starts.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date < new Date(new Date().setHours(0, 0, 0, 0))
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time (24h)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input placeholder="HH:mm" {...field} />
                        <Clock className="absolute right-3 top-2.5 h-4 w-4 opacity-50" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="duration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (minutes)</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select duration" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="15">15 min</SelectItem>
                        <SelectItem value="30">30 min</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="120">2 hours</SelectItem>
                        <SelectItem value="240">4 hours</SelectItem>
                        <SelectItem value="480">8 hours</SelectItem>
                        <SelectItem value="1440">24 hours</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="connectorId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scope</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select scope" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="all">Entire Station</SelectItem>
                        {station.connectors.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            Connector {c.id} ({c.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for Maintenance</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="e.g., Routine inspection, Software update, Hardware repair" 
                      className="resize-none"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {conflict && conflict.bookingCount > 0 && (
              <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive animate-in fade-in slide-in-from-top-1">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Conflict Detected</AlertTitle>
                <AlertDescription className="text-xs">
                  There are <strong>{conflict.bookingCount}</strong> existing booking(s) during this window. 
                  Users will be notified if you proceed, but active sessions may be interrupted.
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter className="pt-4">
              <Button 
                variant="ghost" 
                type="button" 
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || isCheckingConflicts}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scheduling...
                  </>
                ) : (
                  "Confirm Schedule"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
