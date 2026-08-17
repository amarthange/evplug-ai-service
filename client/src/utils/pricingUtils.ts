export const calculateEstimatedCost = (
  connector: {
    powerKw: number;
    pricePerKwh: number;
    pricing?: { baseRate?: number };
  },
  userVehicle: {
    batteryCapacity: number;
    chargeType: string;
  } | null,
  targetChargePercent: number = 80
): {
  estimatedKwh: number;
  estimatedCost: number;
  estimatedMinutes: number;
  calculationBasis: "vehicle" | "default";
} => {
  if (!connector) {
    return {
      estimatedKwh: 0,
      estimatedCost: 0,
      estimatedMinutes: 0,
      calculationBasis: "default",
    };
  }
  const pricePerKwh = connector.pricePerKwh || connector.pricing?.baseRate || 0;

  if (userVehicle && userVehicle.batteryCapacity > 0) {
    // Use vehicle battery for accurate estimate:
    const estimatedKwh = userVehicle.batteryCapacity * (targetChargePercent / 100);

    // Estimate time: kWh / actual charge rate
    // Use min of vehicle capacity and connector power
    // Most EVs charge at much less than rated kW
    const effectivePowerKw = Math.min(
      connector.powerKw,
      userVehicle.batteryCapacity * 2.5
    );
    const estimatedMinutes = Math.round((estimatedKwh / effectivePowerKw) * 60);

    const estimatedCost = parseFloat((estimatedKwh * pricePerKwh).toFixed(2));

    return {
      estimatedKwh: parseFloat(estimatedKwh.toFixed(1)),
      estimatedCost,
      estimatedMinutes,
      calculationBasis: "vehicle",
    };
  }

  // Fallback when no vehicle registered:
  // Use a default 40kWh battery assumption
  const defaultBatteryKwh = 40;
  const estimatedKwh = defaultBatteryKwh * (targetChargePercent / 100);
  const estimatedMinutes = Math.round(
    (estimatedKwh / Math.min(connector.powerKw, 50)) * 60
  );
  const estimatedCost = parseFloat((estimatedKwh * pricePerKwh).toFixed(2));

  return {
    estimatedKwh: parseFloat(estimatedKwh.toFixed(1)),
    estimatedCost,
    estimatedMinutes,
    calculationBasis: "default",
  };
};
