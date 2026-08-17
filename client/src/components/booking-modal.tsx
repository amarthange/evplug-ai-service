import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { Station, Connector } from "@shared/schema";
import { addMinutes } from "date-fns";
import { safeFormat } from "@/lib/date-utils";
import { calculateEstimatedCost } from "@/utils/pricingUtils";

interface BookingModalProps {
  open: boolean;
  onClose: () => void;
  station: Station | null;
  connector: Connector | null;
  vehicle?: {
    batteryCapacity: number;
    chargeType: string;
  } | null;
  onConfirm: (data: { startTime: number; duration: number }) => void;
  loading?: boolean;
}

export function BookingModal({
  open,
  onClose,
  station,
  connector,
  vehicle = null,
  onConfirm,
  loading = false,
}: BookingModalProps) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [duration, setDuration] = useState(30);

  if (!station || !connector) return null;

  // Generate time slots (next 8 hours in 30-min increments)
  const now = new Date();
  const slots = Array.from({ length: 16 }, (_, i) => {
    const slotTime = addMinutes(now, i * 30);
    return {
      time: slotTime.getTime(),
      label: safeFormat(slotTime, "HH:mm"),
    };
  });

  const currentHour = new Date().getHours();
  const isSurge = currentHour >= 17 && currentHour < 21;
  const surgeMultiplier = isSurge ? 1.5 : 1;
  const price = (connector.pricePerKwh || 15) * surgeMultiplier;

  const estimate = calculateEstimatedCost(
    { ...connector, pricePerKwh: price },
    vehicle,
    80
  );

  const currencyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
  const totalPrice = estimate.estimatedCost;

  const handleConfirm = () => {
    if (selectedSlot !== null) {
      onConfirm({ startTime: selectedSlot, duration });
      setSelectedSlot(null);
      setDuration(30);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="modal-booking">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Book {connector.type} at {station.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Time Slot Picker */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Select Start Time</Label>
            <div className="grid grid-cols-4 gap-2">
              {slots.map((slot) => (
                <Button
                  key={slot.time}
                  variant={selectedSlot === slot.time ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedSlot(slot.time)}
                  className="font-mono"
                  data-testid={`button-timeslot-${slot.label}`}
                >
                  {slot.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Duration Selector */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Duration</Label>
            <div className="grid grid-cols-4 gap-2">
              {[30, 60, 90, 120].map((mins) => (
                <Button
                  key={mins}
                  variant={duration === mins ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDuration(mins)}
                  data-testid={`button-duration-${mins}`}
                >
                  {mins} min
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Price Breakdown */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            {isSurge && (
              <div className="flex justify-between text-sm text-destructive font-semibold mb-2">
                <span>Surge Pricing Active</span>
                <span>1.5x Rate</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Power Rating</span>
              <span className="font-mono font-medium">{connector.powerKw} kW</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Rate</span>
              <span className="font-mono font-medium">{currencyFormatter.format(price)}/kWh</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-mono font-medium">{duration} min</span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-semibold">
              <span>Estimated Total</span>
              <span className="font-mono" data-testid="text-total-price">{currencyFormatter.format(totalPrice)}</span>
            </div>
            {estimate.calculationBasis === "default" && (
              <div className="estimate-disclaimer">
                * Estimate based on 40kWh battery. Add your vehicle for accurate pricing.
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-booking">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedSlot === null || loading}
            data-testid="button-confirm-booking"
          >
            {loading ? "Processing..." : "Confirm Booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
