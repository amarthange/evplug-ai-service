export type VoiceSupport = 'supported' | 'unsupported' | 'permission_denied';

export interface VoiceReadResultSuccess {
  success: true;
  transcript: string;
  confidence: number;
}

export interface VoiceReadResultError {
  success: false;
  errorType: 'no_speech' | 'aborted' | 'permission_denied' | 'not_supported' | 'error';
  message: string;
}

export type VoiceReadResult = VoiceReadResultSuccess | VoiceReadResultError;

export function detectVoiceSupport(): VoiceSupport {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) return 'unsupported';
  return 'supported';
}

export async function listenForCommand(
  signal: AbortSignal,
  lang: string = 'en-IN'
): Promise<VoiceReadResult> {
  if (detectVoiceSupport() !== 'supported') {
    return {
      success: false,
      errorType: 'not_supported',
      message: 'Voice not supported on this browser'
    };
  }

  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = lang;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;

  return new Promise((resolve) => {
    let resolved = false;

    recognition.onresult = (event: any) => {
      if (resolved) return;
      resolved = true;
      const result = event.results[0][0];
      resolve({
        success: true,
        transcript: result.transcript.trim(),
        confidence: result.confidence
      });
    };

    recognition.onerror = (event: any) => {
      if (resolved) return;
      resolved = true;
      if (event.error === 'no-speech') {
        resolve({
          success: false,
          errorType: 'no_speech',
          message: 'No speech detected. Try again.'
        });
      } else if (event.error === 'not-allowed') {
        resolve({
          success: false,
          errorType: 'permission_denied',
          message: 'Microphone access denied.'
        });
      } else if (event.error === 'aborted') {
        resolve({
          success: false,
          errorType: 'aborted',
          message: 'Cancelled'
        });
      } else {
        resolve({
          success: false,
          errorType: 'error',
          message: 'Voice recognition error. Try typing instead.'
        });
      }
    };

    recognition.onend = () => {
      if (resolved) return;
      resolved = true;
      resolve({
        success: false,
        errorType: 'no_speech',
        message: 'No speech detected.'
      });
    };

    const abortHandler = () => {
      if (resolved) return;
      resolved = true;
      recognition.abort();
      resolve({
        success: false,
        errorType: 'aborted',
        message: 'Cancelled'
      });
    };

    signal.addEventListener('abort', abortHandler);
    
    try {
      recognition.start();
    } catch (e) {
      if (!resolved) {
        resolved = true;
        resolve({
          success: false,
          errorType: 'error',
          message: 'Failed to start voice recognition.'
        });
      }
    }
  });
}
