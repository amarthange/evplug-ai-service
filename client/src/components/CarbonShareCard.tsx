import React, { useMemo } from 'react';
import { 
  CarbonImpactData, 
  generateShareSVG 
} from '../lib/carbon-share-engine';
import { motion } from 'framer-motion';

interface CarbonShareCardProps {
  data: CarbonImpactData;
  className?: string;
}

/**
 * CarbonShareCard
 * Renders a visual preview of the impact card using the same SVG logic
 * used for the PNG export.
 */
export const CarbonShareCard: React.FC<CarbonShareCardProps> = ({ 
  data, 
  className = "" 
}) => {
  const svgContent = useMemo(() => generateShareSVG(data), [data]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`relative w-full aspect-[400/560] rounded-xl overflow-hidden shadow-2xl ${className}`}
      style={{
        background: '#0f2419',
        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)'
      }}
    >
      <div 
        className="w-full h-full flex items-center justify-center"
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
      
      {/* Decorative glass overlay for UI preview only */}
      <div className="absolute inset-0 pointer-events-none border border-white/10 rounded-xl" />
    </motion.div>
  );
};
