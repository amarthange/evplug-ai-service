import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Nfc, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { detectNFCSupport, readNFCTag } from '@/lib/nfc-reader'
import { cn } from '@/lib/utils'

interface NFCCheckInButtonProps {
  onStationIdRead: (stationId: string) => void
  onError: (message: string) => void
  disabled?: boolean
}

export default function NFCCheckInButton({ onStationIdRead, onError, disabled }: NFCCheckInButtonProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [countdown, setCountdown] = useState(30)
  const abortControllerRef = useRef<AbortController | null>(null)
  const nfcSupport = detectNFCSupport()

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (isScanning && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1)
      }, 1000)
    } else if (countdown === 0) {
      handleCancel()
    }
    return () => clearInterval(timer)
  }, [isScanning, countdown])

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  const handleStartScan = async () => {
    if (isScanning) return
    
    abortControllerRef.current?.abort()
    abortControllerRef.current = new AbortController()
    
    setIsScanning(true)
    setCountdown(30)

    try {
      const result = await readNFCTag(abortControllerRef.current.signal, 30000)
      
      if (result.success) {
        setIsScanning(false)
        onStationIdRead(result.stationId)
      } else if (result.errorType !== 'aborted') {
        setIsScanning(false)
        onError(result.message)
      }
    } catch (err) {
      setIsScanning(false)
      onError('An unexpected error occurred during NFC scan.')
    }
  }

  const handleCancel = () => {
    abortControllerRef.current?.abort()
    setIsScanning(false)
  }

  if (nfcSupport === 'unsupported') {
    return null
  }

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {!isScanning ? (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <Button
              onClick={handleStartScan}
              disabled={disabled}
              className="w-full h-20 premium-glass border-slate-800 bg-white/5 hover:bg-white/10 rounded-2xl flex flex-col gap-1 transition-all group"
            >
              <Nfc className="w-6 h-6 text-blue-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-black uppercase tracking-widest text-slate-300">
                Tap to station NFC tag
              </span>
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="scanning"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full h-32 premium-glass border-blue-500/30 bg-blue-500/5 rounded-3xl flex flex-col items-center justify-center relative overflow-hidden"
          >
            {/* Animated Pulse Rings */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <motion.div
                className="absolute w-24 h-24 border-2 border-blue-500/20 rounded-full"
                animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
              />
              <motion.div
                className="absolute w-24 h-24 border-2 border-blue-500/20 rounded-full"
                animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.6 }}
              />
              <motion.div
                className="absolute w-24 h-24 border-2 border-blue-500/20 rounded-full"
                animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 1.2 }}
              />
            </div>

            <div className="z-10 flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-sm font-black text-blue-400 uppercase tracking-tighter">
                Hold phone to NFC tag...
              </p>
              <p className="text-[10px] font-bold text-blue-500/60 uppercase">
                Scanning... {countdown}s
              </p>
              <button
                onClick={handleCancel}
                className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
