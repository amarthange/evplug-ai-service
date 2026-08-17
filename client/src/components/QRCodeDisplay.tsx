import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface QRCodeDisplayProps {
  booking: {
    id?: string;
    bookingId?: string;
    stationId?: string;
    userId?: string;
    startTime?: any;
  } | null;
  stationName?: string;
}

export function QRCodeDisplay({ booking, stationName }: QRCodeDisplayProps) {
  const [qrLoaded, setQrLoaded] = useState(false);
  const [qrError, setQrError] = useState(false);
  const { toast } = useToast();

  const bookingId = booking?.id || booking?.bookingId || "";

  // Reset states if bookingId changes
  useEffect(() => {
    setQrLoaded(false);
    setQrError(false);
  }, [bookingId]);

  if (!bookingId) {
    return (
      <Card className="bg-slate-900 border-slate-800 text-white shadow-xl overflow-hidden">
        <CardContent className="p-8 text-center text-red-400">
          No booking ID found for QR
        </CardContent>
      </Card>
    );
  }

  const qrData = JSON.stringify({
    bookingId: bookingId,
    stationId: booking?.stationId || "",
    type: "ev_checkin"
  });

  // Use qrserver.com as it is more reliable and doesn't require complex URL params
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}&margin=10`;

  return (
    <Card className="bg-slate-900 border-slate-800 text-white shadow-xl overflow-hidden">
      <CardHeader className="text-center space-y-1">
        <div className="mx-auto bg-blue-500/20 w-12 h-12 rounded-full flex items-center justify-center mb-2">
          <QrCode className="w-6 h-6 text-blue-400" />
        </div>
        <CardTitle className="text-xl font-bold tracking-tight">Check-in QR Code</CardTitle>
        <CardDescription className="text-slate-400">
          Scan this at {stationName || "the station"} to start charging
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center pb-8">
        <div className="qr-code-container" style={{ position: 'relative', minHeight: '260px' }}>
          {/* Loading Overlay */}
          {!qrLoaded && !qrError && (
            <div className="qr-loading" style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'white' }}>
              <div className="qr-spinner"/>
              <span>Generating Secure QR...</span>
            </div>
          )}
          
          {qrError && (
            <div className="qr-fallback" style={{ background: 'white', height: '100%', width: '100%' }}>
              <div className="qr-fallback-icon">📱</div>
              <div className="qr-fallback-id">{bookingId.slice(0, 12)}...</div>
              <div className="qr-fallback-text">Show this ID at the station</div>
              <button
                className="qr-retry-btn"
                onClick={() => {
                  setQrError(false);
                  setQrLoaded(false);
                }}>
                Retry QR
              </button>
            </div>
          )}
          
          <img
            src={qrUrl}
            alt="Check-in QR Code"
            className="qr-image"
            style={{ 
              display: qrError ? "none" : "block",
              opacity: qrLoaded ? 1 : 0,
              transition: 'opacity 0.3s ease-in-out'
            }}
            onLoad={() => setQrLoaded(true)}
            onError={() => {
              console.error("QR Code failed to load from:", qrUrl);
              setQrError(true);
            }}
          />
        </div>

        <div className="mt-4 flex flex-col items-center gap-2">
          <p className="text-sm text-slate-500 font-mono tracking-widest uppercase">
            Booking ID: {bookingId.slice(0, 8)}...
          </p>
          <button
            className="copy-id-btn"
            onClick={() => {
              navigator.clipboard.writeText(bookingId);
              toast({
                title: "Booking ID copied! 📋",
                description: "The ID has been copied to your clipboard.",
              });
            }}>
            📋 Copy Booking ID
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
