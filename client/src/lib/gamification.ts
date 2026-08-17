export interface Milestone {
  id: string;
  title: string;
  description: string;
  icon: string;
  threshold: number;
  type: 'bookings' | 'kwh' | 'co2';
  color: string;
}

export const MILESTONES: Milestone[] = [
  {
    id: 'first_charge',
    title: 'First Spark',
    description: 'Complete your first charging session',
    icon: '⚡',
    threshold: 1,
    type: 'bookings',
    color: '#22c55e'
  },
  {
    id: 'eco_warrior',
    title: 'Eco Warrior',
    description: 'Save 50kg of CO2 emissions',
    icon: '🌿',
    threshold: 50,
    type: 'co2',
    color: '#10b981'
  },
  {
    id: 'power_user',
    title: 'Power User',
    description: 'Consume over 500 kWh of clean energy',
    icon: '🔋',
    threshold: 500,
    type: 'kwh',
    color: '#3b82f6'
  },
  {
    id: 'road_tripper',
    title: 'Road Tripper',
    description: 'Complete 10 charging sessions',
    icon: '🚗',
    threshold: 10,
    type: 'bookings',
    color: '#f59e0b'
  },
  {
    id: 'planet_saver',
    title: 'Planet Saver',
    description: 'Save 200kg of CO2 emissions',
    icon: '🌍',
    threshold: 200,
    type: 'co2',
    color: '#6366f1'
  }
];

export function calculateImpact(totalKwh: number) {
  // Rough estimate: 1 kWh of EV charging saves ~0.4kg of CO2 compared to ICE
  const co2Saved = totalKwh * 0.4;
  const treesEquivalent = co2Saved / 20; // 1 tree absorbs ~20kg CO2/year
  const petrolSaved = totalKwh * 0.12; // ~0.12 liters of petrol equivalent per kWh

  return {
    co2Saved: parseFloat(co2Saved.toFixed(1)),
    treesEquivalent: parseFloat(treesEquivalent.toFixed(1)),
    petrolSaved: parseFloat(petrolSaved.toFixed(1))
  };
}

export function getEarnedMilestones(stats: { bookings: number; kwh: number; co2: number }) {
  return MILESTONES.filter(m => {
    if (m.type === 'bookings') return stats.bookings >= m.threshold;
    if (m.type === 'kwh') return stats.kwh >= m.threshold;
    if (m.type === 'co2') return stats.co2 >= m.threshold;
    return false;
  });
}
