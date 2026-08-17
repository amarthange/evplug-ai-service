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
import { Camera, CheckCircle2, AlertCircle, Loader2, ArrowLeft } from "lucide-react";
import { collection, query, where, getDocs } from "firebase/firestore";
import NFCCheckInButton from "@/components/NFCCheckInButton";

export default function ScanQR() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scanning, setScanning] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [nfcError, setNfcError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function setupCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true"); // required to tell iOS safari we don't want fullscreen
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

  const handleScan = async (bookingId: string) => {
    if (processing) return;
    setProcessing(true);
    setScanning(false);

    try {
      const bookingRef = doc(db, "bookings", bookingId);
      const bookingSnap = await getDoc(bookingRef);

      if (!bookingSnap.exists()) {
        throw new Error("Invalid QR code: Booking not found");
      }

      const bookingData = bookingSnap.data();
      
      // Validation
      if (bookingData.userId !== user?.uid) {
        throw new Error("Unauthorized: You do not own this booking");
      }

      if (bookingData.status !== "confirmed" && bookingData.status !== "pending") {
        throw new Error(`Invalid status: Booking is already ${bookingData.status}`);
      }

      // Update booking
      await updateDoc(bookingRef, {
        status: "active",
        checkedInAt: Date.now(),
        updatedAt: serverTimestamp()
      });

      setSuccess({
        id: bookingId,
        stationName: bookingData.stationName || "Charging Station",
        connectorId: bookingData.connectorId
      });

      toast({
        title: "Check-in Successful!",
        description: `Starting session at ${bookingData.stationName}`,
      });

      // Redirect after 2 seconds
      setTimeout(() => {
        setLocation(`/charge/${bookingId}`);
      }, 2000);

    } catch (err: any) {
      console.error("Check-in error:", err);
      setError(err.message || "An unexpected error occurred during check-in");
      setProcessing(false);
    }
  };

  const handleQRCheckIn = async (id: string, isStationId = true) => {
    if (processing) return;
    setProcessing(true);
    setScanning(false);
    setNfcError(null);
    setError(null);

    try {
      let bookingId = id;
      let bookingData: any = null;

      if (isStationId) {
        // Query for active/confirmed booking at this station for the current user
        const q = query(
          collection(db, "bookings"),
          where("stationId", "==", id),
          where("userId", "==", user?.uid),
          where("status", "in", ["confirmed", "pending"])
        );
        
        const querySnap = await getDocs(q);
        if (querySnap.empty) {
          throw new Error("No active booking found for this station. Please ensure you have a confirmed reservation.");
        }
        
        const bookingDoc = querySnap.docs[0];
        bookingId = bookingDoc.id;
        bookingData = bookingDoc.data();
      } else {
        const bookingRef = doc(db, "bookings", id);
        const bookingSnap = await getDoc(bookingRef);
        if (!bookingSnap.exists()) {
          throw new Error("Invalid check-in: Booking not found");
        }
        bookingData = bookingSnap.data();
      }

      // Validation logic (mirrors handleScan)
      if (bookingData.userId !== user?.uid) {
        throw new Error("Unauthorized: You do not own this booking");
      }

      if (bookingData.status !== "confirmed" && bookingData.status !== "pending") {
        throw new Error(`Invalid status: Booking is already ${bookingData.status}`);
      }

      // Update booking to active
      const bookingRef = doc(db, "bookings", bookingId);
      await updateDoc(bookingRef, {
        status: "active",
        checkedInAt: Date.now(),
        updatedAt: serverTimestamp()
      });

      setSuccess({
        id: bookingId,
        stationName: bookingData.stationName || "Charging Station",
        connectorId: bookingData.connectorId
      });

      toast({
        title: "Check-in Successful!",
        description: `Starting session at ${bookingData.stationName}`,
      });

      setTimeout(() => {
        setLocation(`/charge/${bookingId}`);
      }, 2000);

    } catch (err: any) {
      console.error("Check-in error:", err);
      setError(err.message || "An unexpected error occurred during check-in");
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
    <div className="min-h-full bg-[#0f172a] text-white p-4 flex flex-col items-center justify-center">
      <div className="w-full max-w-md">
        <header className="flex items-center mb-8">
          <Button 
            variant="ghost" 
            size="icon" 
            className="mr-4 text-slate-400 hover:text-white"
            onClick={() => setLocation("/bookings")}
          >
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-2xl font-bold">Station Check-in</h1>
        </header>

        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center text-center space-y-6"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 10, stiffness: 100 }}
              >
                <CheckCircle2 className="w-32 h-32 text-green-500" />
              </motion.div>
              <div className="space-y-2">
                <h2 className="text-3xl font-bold">Welcome!</h2>
                <p className="text-slate-400 text-lg">
                  Successfully checked into <span className="text-blue-400 font-semibold">{success.stationName}</span>
                </p>
                <p className="text-slate-500">
                  Connector: <span className="font-mono">{success.connectorId}</span>
                </p>
              </div>
              <div className="flex items-center space-x-2 text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Redirecting to session...</span>
              </div>
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 flex flex-col items-center text-center space-y-4"
            >
              <AlertCircle className="w-16 h-16 text-red-500" />
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-red-500">Check-in Failed</h3>
                <p className="text-slate-400">{error}</p>
              </div>
              <Button 
                onClick={resetScanner}
                className="bg-red-500 hover:bg-red-600 text-white w-full"
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
              <div className="relative aspect-square w-full bg-black rounded-3xl overflow-hidden border-2 border-slate-800">
                <video 
                  ref={videoRef} 
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />
                
                {/* Scanner Overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="w-64 h-64 border-2 border-blue-500/50 rounded-2xl relative">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />
                    
                    {/* Scanning Line */}
                    <motion.div 
                      className="absolute inset-x-0 top-0 h-1 bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                      animate={{ top: ["0%", "100%", "0%"] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    />
                  </div>
                  <p className="mt-8 text-blue-400 font-medium animate-pulse">
                    Position QR code within frame
                  </p>
                </div>

                {processing && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center backdrop-blur-sm">
                    <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                    <p className="font-bold">Verifying Booking...</p>
                  </div>
                )}
              </div>

              <div className="text-center space-y-2">
                <p className="text-slate-400">
                  Scan the QR code displayed at the charging station to verify your arrival and start charging.
                </p>
              </div>

              <Button 
                variant="outline" 
                className="w-full border-slate-800 text-slate-400 hover:bg-slate-800"
                onClick={() => setLocation("/bookings")}
              >
                Cancel
              </Button>

              {/* NFC FALLBACK — NFC check-in option */}
              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-slate-800" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">or use NFC</span>
                  <div className="flex-1 h-px bg-slate-800" />
                </div>

                <NFCCheckInButton
                  onStationIdRead={(stationId) => {
                    setNfcError(null);
                    handleQRCheckIn(stationId, true);
                  }}
                  onError={(message) => setNfcError(message)}
                  disabled={processing}
                />

                {nfcError && (
                  <motion.p 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-[10px] font-bold text-red-400 text-center uppercase tracking-wider"
                  >
                    {nfcError}
                  </motion.p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
