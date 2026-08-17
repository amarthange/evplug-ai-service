import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import jsQR from "jsqr";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Camera, CheckCircle2, AlertCircle, Loader2, ArrowLeft, QrCode } from "lucide-react";

export default function OwnerCheckInScanner() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scanning, setScanning] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function setupCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          videoRef.current.play();
          requestAnimationFrame(scanFrame);
        }
      } catch (err) {
        console.error("Camera access error:", err);
        setError("Could not access camera. Please ensure you have given permission.");
      }
    }

    if (scanning) {
      setupCamera();
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [scanning]);

  const scanFrame = () => {
    if (!videoRef.current || !canvasRef.current || !scanning) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    if (video.readyState === video.HAVE_ENOUGH_DATA && context) {
      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code) {
        handleScan(code.data);
        return;
      }
    }
    requestAnimationFrame(scanFrame);
  };

  const handleScan = async (data: string) => {
    if (processing) return;
    setProcessing(true);
    setScanning(false);

    try {
      let bookingId = "";
      let stationId = "";

      // Try to parse as JSON first (our new robust format)
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === "ev_checkin") {
          bookingId = parsed.bookingId;
          stationId = parsed.stationId;
        } else {
          bookingId = parsed.bookingId || data;
        }
      } catch (e) {
        // Fallback to raw string if not JSON
        bookingId = data;
      }

      if (!bookingId) throw new Error("Invalid QR Code data");

      const bookingRef = doc(db, "bookings", bookingId);
      const bookingSnap = await getDoc(bookingRef);

      if (!bookingSnap.exists()) {
        throw new Error("Booking not found in system");
      }

      const bookingData = bookingSnap.data();

      // Verification: Does this station belong to the current owner?
      if (bookingData.ownerId !== user?.uid) {
        throw new Error("Unauthorized: This booking is for a station you do not own.");
      }

      if (bookingData.status !== "confirmed") {
        if (bookingData.status === "active") {
          throw new Error("User is already checked in and charging.");
        }
        throw new Error(`Booking status is ${bookingData.status}. Only confirmed bookings can check-in.`);
      }

      // Update booking to active
      await updateDoc(bookingRef, {
        status: "active",
        checkedInAt: Date.now(),
        updatedAt: serverTimestamp(),
        checkInMethod: "owner_scan"
      });

      setSuccess({
        id: bookingId,
        stationName: bookingData.stationName,
        connectorType: bookingData.connectorType,
        userName: bookingData.userName || "EV Driver"
      });

      toast({
        title: "Check-in Verified! ✅",
        description: `Verified ${bookingData.userName || "driver"} at ${bookingData.stationName}`,
      });

    } catch (err: any) {
      console.error("Owner scan error:", err);
      setError(err.message || "Failed to verify check-in");
      setProcessing(false);
    }
  };

  const resetScanner = () => {
    setError(null);
    setSuccess(null);
    setScanning(true);
    setProcessing(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 flex flex-col items-center justify-center font-sans">
      <div className="w-full max-w-md">
        <header className="flex items-center mb-8">
          <Button 
            variant="ghost" 
            size="icon" 
            className="mr-4 text-slate-400 hover:text-white bg-white/5"
            onClick={() => setLocation("/owner/dashboard")}
          >
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <div>
            <h1 className="text-2xl font-black tracking-tight uppercase">Owner Check-in</h1>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Scan User QR Code</p>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center text-center space-y-6 bg-emerald-500/10 border border-emerald-500/20 p-8 rounded-[2rem] shadow-2xl shadow-emerald-500/10"
            >
              <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/40">
                <CheckCircle2 className="w-12 h-12 text-white" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-black uppercase tracking-tighter">Verified</h2>
                <p className="text-slate-300 font-medium">
                  Driver: <span className="text-emerald-400 font-black">{success.userName}</span>
                </p>
                <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">
                   {success.stationName} — {success.connectorType}
                </p>
              </div>
              <Button 
                onClick={resetScanner}
                className="bg-emerald-600 hover:bg-emerald-700 text-white w-full h-12 rounded-xl font-black uppercase tracking-widest"
              >
                Scan Next User
              </Button>
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className="bg-red-500/10 border border-red-500/20 rounded-[2rem] p-8 flex flex-col items-center text-center space-y-6 shadow-2xl shadow-red-500/10"
            >
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center">
                <AlertCircle className="w-10 h-10 text-red-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black uppercase text-red-500 tracking-tight">Verification Failed</h3>
                <p className="text-slate-400 font-medium">{error}</p>
              </div>
              <Button 
                onClick={resetScanner}
                className="bg-red-500 hover:bg-red-600 text-white w-full h-12 rounded-xl font-black uppercase tracking-widest"
              >
                Try Again
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="scanner"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="space-y-6"
            >
              <div className="relative aspect-square w-full bg-slate-900 rounded-[2.5rem] overflow-hidden border-4 border-slate-800 shadow-2xl">
                <video 
                  ref={videoRef} 
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />
                
                {/* Scanner Overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="w-72 h-72 border-2 border-white/20 rounded-3xl relative">
                    <div className="absolute -top-1 -left-1 w-12 h-12 border-t-8 border-l-8 border-blue-500 rounded-tl-2xl" />
                    <div className="absolute -top-1 -right-1 w-12 h-12 border-t-8 border-r-8 border-blue-500 rounded-tr-2xl" />
                    <div className="absolute -bottom-1 -left-1 w-12 h-12 border-b-8 border-l-8 border-blue-500 rounded-bl-2xl" />
                    <div className="absolute -bottom-1 -right-1 w-12 h-12 border-b-8 border-r-8 border-blue-500 rounded-br-2xl" />
                    
                    {/* Scanning Line */}
                    <motion.div 
                      className="absolute inset-x-0 top-0 h-1.5 bg-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.8)] z-10"
                      animate={{ top: ["5%", "95%", "5%"] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    />
                  </div>
                  <div className="mt-12 flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2 px-4 py-2 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
                       <QrCode className="w-4 h-4 text-blue-400" />
                       <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80">Awaiting Check-in QR</span>
                    </div>
                  </div>
                </div>

                {processing && (
                  <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center backdrop-blur-md z-20">
                    <Loader2 className="w-16 h-16 text-blue-500 animate-spin mb-4" />
                    <p className="font-black uppercase tracking-widest text-lg">Verifying...</p>
                  </div>
                )}
              </div>

              <div className="bg-white/5 border border-white/10 p-6 rounded-2xl text-center">
                <p className="text-slate-400 text-sm font-medium leading-relaxed">
                  Ask the driver to open their booking and show the <span className="text-white font-bold">"Check-in QR Code"</span>. Align it within the frame to verify their reservation.
                </p>
              </div>

              <Button 
                variant="ghost" 
                className="w-full h-12 rounded-xl text-slate-500 hover:text-white font-black uppercase tracking-widest"
                onClick={() => setLocation("/owner/dashboard")}
              >
                Cancel
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
