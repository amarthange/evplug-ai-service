export type NFCSupport =
  | 'supported'     // NDEFReader available, permission grantable
  | 'unsupported'   // NDEFReader not in window
  | 'permission_denied'  // User denied NFC permission
  | 'not_mobile'    // Not on Android/mobile (NFC never works on desktop)

export type NFCReadResult = {
  success: true
  stationId: string
} | {
  success: false
  errorType: 'invalid_tag' | 'read_error' | 'timeout' | 'aborted'
  message: string
}

export function detectNFCSupport(): NFCSupport {
  if (!('NDEFReader' in window)) return 'unsupported'
  
  // Heuristic for non-mobile (NFC only works on Android Chrome)
  const ua = navigator.userAgent
  const isAndroid = /Android/i.test(ua)
  if (!isAndroid) return 'unsupported'
  
  return 'supported'
}

export async function readNFCTag(
  signal: AbortSignal,
  timeoutMs: number = 30000
): Promise<NFCReadResult> {
  if (detectNFCSupport() !== 'supported') {
    return { 
      success: false, 
      errorType: 'read_error',
      message: 'NFC not supported on this device' 
    }
  }

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({ 
        success: false, 
        errorType: 'timeout', 
        message: 'Scan timed out. Please try again.' 
      })
    }, timeoutMs)

    const ndef = new (window as any).NDEFReader()

    const cleanup = () => {
      clearTimeout(timeoutId)
    }

    ndef.scan({ signal }).then(() => {
      ndef.addEventListener('reading', ({ message }: any) => {
        cleanup()
        for (const record of message.records) {
          if (record.recordType === 'text') {
            const decoder = new TextDecoder(record.encoding ?? 'utf-8')
            const text = decoder.decode(record.data)
            const prefix = text.startsWith('evplugfinder-station:') 
              ? 'evplugfinder-station:' 
              : text.startsWith('volthub-station:') 
                ? 'volthub-station:' 
                : null;
            if (prefix) {
              const stationId = text.replace(prefix, '').trim()
              if (stationId.length > 0) {
                resolve({ success: true, stationId })
                return
              }
            }
            
            // Tag found but wrong format
            resolve({
              success: false,
              errorType: 'invalid_tag',
              message: 'This NFC tag is not an EVPlugFinder station tag'
            })
            return
          }
        }
        
        resolve({
          success: false,
          errorType: 'invalid_tag',
          message: 'No valid data found on this NFC tag'
        })
      })

      signal.addEventListener('abort', () => {
        cleanup()
        resolve({ 
          success: false, 
          errorType: 'aborted', 
          message: 'Scan cancelled' 
        })
      }, { once: true })

    }).catch((err: any) => {
      cleanup()
      if (err.name === 'NotAllowedError') {
        resolve({ 
          success: false, 
          errorType: 'read_error',
          message: 'NFC permission denied. Enable NFC in device settings.' 
        })
      } else {
        resolve({ 
          success: false, 
          errorType: 'read_error',
          message: 'Could not start NFC scan. Try holding your phone closer.' 
        })
      }
    })
  })
}
