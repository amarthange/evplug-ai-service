import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FileText, Download, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { generateReceipt } from "@/lib/receipt-generator";
import { storage, db } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

interface ReceiptButtonProps {
  booking: any;
  station: any;
  className?: string;
}

export function ReceiptButton({ booking, station, className }: ReceiptButtonProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "generating" | "uploading" | "success" | "error">("idle");

  const handleDownload = async () => {
    if (!user || !booking) return;

    // If receipt already exists, just download it
    if (booking.receiptUrl) {
      window.open(booking.receiptUrl, "_blank");
      return;
    }

    setIsGenerating(true);
    setStatus("generating");
    setProgress(20);

    try {
      // 1. Generate PDF
      const pdfBlob = await generateReceipt(booking, user, station);
      setProgress(60);
      setStatus("uploading");

      // 2. Upload to Firebase Storage
      const storagePath = `receipts/${user.uid}/${booking.id}.pdf`;
      const storageRef = ref(storage, storagePath);
      
      let downloadUrl = null;
      try {
        await uploadBytes(storageRef, pdfBlob);
        downloadUrl = await getDownloadURL(storageRef);
        setProgress(90);

        // 3. Update Booking document
        await updateDoc(doc(db, "bookings", booking.id), {
          receiptUrl: downloadUrl
        });
      } catch (uploadErr) {
        console.error("Storage upload failed, falling back to local download:", uploadErr);
        // Fallback: Download locally even if upload fails
      }

      setProgress(100);
      setStatus("success");

      // 4. Trigger Download
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Receipt-${booking.id.slice(0, 8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Receipt Generated! ✅",
        description: downloadUrl 
          ? "Receipt saved and downloaded successfully." 
          : "Receipt downloaded (cloud sync failed).",
      });

      // Reset after 3 seconds
      setTimeout(() => {
        setStatus("idle");
        setIsGenerating(false);
        setProgress(0);
      }, 3000);

    } catch (err) {
      console.error("Receipt generation failed:", err);
      setStatus("error");
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: "Could not create your receipt. Please try again.",
      });
      setTimeout(() => {
        setStatus("idle");
        setIsGenerating(false);
      }, 3000);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <Button 
        onClick={handleDownload} 
        disabled={isGenerating}
        className="w-full h-12 font-bold gap-2 relative overflow-hidden"
        variant={status === "success" ? "outline" : "default"}
      >
        {status === "idle" && (
          <>
            <FileText className="w-4 h-4" />
            {booking.receiptUrl ? "View Receipt" : "Download GST Receipt"}
          </>
        )}
        {(status === "generating" || status === "uploading") && (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {status === "generating" ? "Generating PDF..." : "Saving to Cloud..."}
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            Ready!
          </>
        )}
        {status === "error" && (
          <>
            <AlertCircle className="w-4 h-4 text-destructive" />
            Retry Generation
          </>
        )}
      </Button>

      {isGenerating && (
        <div className="space-y-1">
          <Progress value={progress} className="h-1" />
          <p className="text-[10px] text-center text-muted-foreground animate-pulse">
            Please wait, your tax invoice is being prepared...
          </p>
        </div>
      )}
    </div>
  );
}
