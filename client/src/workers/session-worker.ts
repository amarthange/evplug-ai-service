/**
 * SeniorDevOps Session Simulation Worker
 * 
 * This worker runs the charging physics engine independently of the main UI thread.
 * It ensures the session continues ticking even if mobile data is lost or the 
 * main thread is blocked by heavy rendering.
 */

interface WorkerSessionConfig {
  sessionId: string
  userId: string
  startSoC: number
  powerKw: number
  ratePerKwh: number
  batteryCapacityKwh: number
  prePaidAmount: number
  sessionStartTimestamp: number
  resumeFromSecs?: number
}

interface WorkerTickPayload {
  elapsedSecs: number
  soc: number
  kwhDelivered: number
  currentCost: number
  effectivePowerKw: number
  isTapered: boolean
  minsToFull: number | null
}

type WorkerInMessage =
  | { type: 'START'; payload: WorkerSessionConfig }
  | { type: 'STOP' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }

type WorkerOutMessage =
  | { type: 'TICK'; payload: WorkerTickPayload }
  | { type: 'AUTO_STOP'; reason: 'PREPAID_LIMIT' | 'BATTERY_FULL' }

let intervalId: any = null;
let config: WorkerSessionConfig | null = null;

/**
 * Charging Physics Engine (Internal Copy)
 * Note: Workers cannot import from the main React bundle in default Vite worker builds.
 */
function computeChargingState(
  startSoC: number,
  powerKw: number,
  ratePerKwh: number,
  elapsedSecs: number,
  batteryCapacityKwh: number = 40
) {
  let currentSoC = startSoC;
  let totalKwh = 0;
  let lastEffectivePower = powerKw;

  for (let s = 0; s < elapsedSecs; s++) {
    let effectivePower;
    if (currentSoC <= 80) {
      effectivePower = powerKw;
    } else {
      effectivePower = powerKw * Math.exp(-5 * ((currentSoC / 100) - 0.8));
    }

    const kwhThisSecond = effectivePower / 3600;
    const socGainThisSecond = (kwhThisSecond / batteryCapacityKwh) * 100;

    totalKwh += kwhThisSecond;
    currentSoC += socGainThisSecond;
    lastEffectivePower = effectivePower;

    if (currentSoC >= 100) {
      currentSoC = 100;
      lastEffectivePower = 0;
      break;
    }
  }

  // Mins to Full estimation
  let futureSoC = currentSoC;
  let additionalSecs = 0;
  const MAX_FUTURE_SECS = 3600 * 12;

  while (futureSoC < 100 && additionalSecs < MAX_FUTURE_SECS) {
    let p;
    if (futureSoC <= 80) p = powerKw;
    else p = powerKw * Math.exp(-5 * ((futureSoC / 100) - 0.8));
    const kwhNext = p / 3600;
    const socGainNext = (kwhNext / batteryCapacityKwh) * 100;
    futureSoC += socGainNext;
    additionalSecs++;
  }

  return {
    soc: Math.min(currentSoC, 100),
    kwhDelivered: totalKwh,
    currentCost: totalKwh * ratePerKwh,
    effectivePowerKw: lastEffectivePower,
    isTapered: currentSoC > 80,
    minsToFull: additionalSecs > 0 ? Math.min(Math.ceil(additionalSecs / 60), 999) : 0
  };
}

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'START':
      if (intervalId) clearInterval(intervalId);
      config = msg.payload;
      
      const startTick = () => {
        if (!config) return;
        
        const now = Date.now();
        // Calculate elapsed time from the original start timestamp to handle restarts
        let elapsed = Math.floor((now - config.sessionStartTimestamp) / 1000);
        
        // Apply manual resume override if provided (e.g. from IDB)
        if (config.resumeFromSecs !== undefined && config.resumeFromSecs > elapsed) {
          elapsed = config.resumeFromSecs;
        }

        const state = computeChargingState(
          config.startSoC,
          config.powerKw,
          config.ratePerKwh,
          elapsed,
          config.batteryCapacityKwh
        );

        self.postMessage({
          type: 'TICK',
          payload: {
            elapsedSecs: elapsed,
            ...state
          }
        });

        // AUTO-STOP CHECKS
        if (config.prePaidAmount > 0 && state.currentCost >= config.prePaidAmount - 0.1) {
          self.postMessage({ type: 'AUTO_STOP', reason: 'PREPAID_LIMIT' });
          clearInterval(intervalId);
        } else if (state.soc >= 99.9) {
          self.postMessage({ type: 'AUTO_STOP', reason: 'BATTERY_FULL' });
          clearInterval(intervalId);
        }
      };

      // Run first tick immediately then every second
      startTick();
      intervalId = setInterval(startTick, 1000);
      break;

    case 'STOP':
      if (intervalId) clearInterval(intervalId);
      config = null;
      break;

    case 'PAUSE':
    case 'RESUME':
      // Future use, no-op for now
      break;
  }
};
