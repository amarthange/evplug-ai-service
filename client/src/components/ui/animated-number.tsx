import { useState, useEffect } from "react";

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

/**
 * AnimatedNumber Component
 * 
 * Animates a numeric value from 0 to the target value over a specified duration.
 * Features:
 * - Fluid requestAnimationFrame based execution
 * - Standardized easing (linear growth)
 * - Locale-aware formatting (en-IN)
 */
export const AnimatedNumber = ({ 
  value, 
  duration = 1500, 
  prefix = "", 
  suffix = "",
  decimals = 0
}: AnimatedNumberProps) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const startValue = 0;
    
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const current = progress * (value - startValue) + startValue;
      
      setDisplay(current);

      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    window.requestAnimationFrame(step);
  }, [value, duration]);

  return (
    <span>
      {prefix}
      {display.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
};
