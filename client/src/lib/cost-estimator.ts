/**
 * Physics-based cost and time estimator for EV charging.
 * Accounts for non-linear charging speeds (BMS tapering) above 80% SoC.
 */

export interface ChargeEstimate {
  kwhNeeded: number;
  estimatedCost: number;
  estimatedMinutes: number;
  costPerMinute: number;
}

/**
 * Computes a detailed charging estimate.
 * 
 * @param currentSoC - Starting State of Charge (0-100)
 * @param targetSoC - Desired State of Charge (0-100)
 * @param batteryCapacity - Total battery capacity in kWh
 * @param pricePerKwh - Cost in INR per kWh
 * @param powerKw - Max power output of the connector in kW
 */
export function computeChargeEstimate(
  currentSoC: number,
  targetSoC: number,
  batteryCapacity: number,
  pricePerKwh: number,
  powerKw: number
): ChargeEstimate {
  if (targetSoC <= currentSoC) {
    return {
      kwhNeeded: 0,
      estimatedCost: 0,
      estimatedMinutes: 0,
      costPerMinute: 0,
    };
  }

  const kwhNeeded = ((targetSoC - currentSoC) / 100) * batteryCapacity;
  const estimatedCost = kwhNeeded * pricePerKwh;

  let totalMinutes = 0;
  let runningSoC = currentSoC;

  // 1. Linear Phase (below 80%)
  if (runningSoC < 80) {
    const endLinearSoC = Math.min(targetSoC, 80);
    const linearKwh = ((endLinearSoC - runningSoC) / 100) * batteryCapacity;
    const linearMins = (linearKwh / powerKw) * 60;
    totalMinutes += linearMins;
    runningSoC = endLinearSoC;
  }

  // 2. Taper Phase (above 80%) - Numerical Integration in 5% steps
  const STEP_SIZE = 5;
  while (runningSoC < targetSoC) {
    const nextStepSoC = Math.min(runningSoC + STEP_SIZE, targetSoC);
    const deltaSoC = nextStepSoC - runningSoC;
    const kwhInStep = (deltaSoC / 100) * batteryCapacity;

    // P_eff = P_rated * e^(-5 * (SoC_decimal - 0.8))
    // We use the SoC at the start of the step for conservative estimation
    const effectivePower = powerKw * Math.exp(-5 * ((runningSoC / 100) - 0.8));
    
    // Time = Energy / Power
    const minsInStep = (kwhInStep / Math.max(0.1, effectivePower)) * 60;
    totalMinutes += minsInStep;
    runningSoC = nextStepSoC;
  }

  const costPerMinute = totalMinutes > 0 ? estimatedCost / totalMinutes : 0;

  return {
    kwhNeeded: Number(kwhNeeded.toFixed(2)),
    estimatedCost: Math.round(estimatedCost),
    estimatedMinutes: Math.ceil(totalMinutes),
    costPerMinute: Number(costPerMinute.toFixed(2)),
  };
}

/**
 * ACCEPTANCE TESTS:
 * 
 * Test 1: Linear range only
 * Input: batteryCapacity=75kWh, currentSoC=30%, targetSoC=80%, price=₹12, power=22kW
 * kwhNeeded = (80-30)/100 * 75 = 0.5 * 75 = 37.5 kWh
 * estimatedCost = 37.5 * 12 = ₹450
 * estimatedMinutes = (37.5 / 22) * 60 = 1.7045 * 60 = 102.27 -> ~103 mins
 * Result matches acceptance criteria.
 * 
 * Test 2: Taper phase inclusion
 * Input: batteryCapacity=75kWh, currentSoC=80%, targetSoC=100%, price=₹12, power=22kW
 * kwhNeeded = (100-80)/100 * 75 = 0.2 * 75 = 15 kWh
 * Linear time would be (15/22)*60 = 40.9 mins
 * Tapered integration (5% steps):
 * Step 1 (80-85%): effP = 22 * exp(-5*(0.8-0.8)) = 22. Kwh = 3.75. Mins = (3.75/22)*60 = 10.22
 * Step 2 (85-90%): effP = 22 * exp(-5*(0.85-0.8)) = 22 * 0.778 = 17.1. Kwh = 3.75. Mins = (3.75/17.1)*60 = 13.15
 * Step 3 (90-95%): effP = 22 * exp(-5*(0.9-0.8)) = 22 * 0.606 = 13.3. Kwh = 3.75. Mins = (3.75/13.3)*60 = 16.91
 * Step 4 (95-100%): effP = 22 * exp(-5*(0.95-0.8)) = 22 * 0.472 = 10.3. Kwh = 3.75. Mins = (3.75/10.3)*60 = 21.84
 * Total Taper Time = 10.22 + 13.15 + 16.91 + 21.84 = 62.12 mins (vs 40.9 mins linear)
 * Taper phase correctly produces longer time.
 */
