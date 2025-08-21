import { motion } from "framer-motion";

interface RadarChartProps {
  userTraits: { [key: string]: number };
  movieTraits: { [key: string]: number };
  className?: string;
}

const TRAIT_LABELS = {
  energy: "Energy",
  mood: "Mood", 
  depth: "Depth",
  optimism: "Optimism",
  novelty: "Novelty",
  comfort: "Comfort",
  intensity: "Intensity",
  humor: "Humor",
  darkness: "Darkness"
};

export const RadarChart = ({ userTraits, movieTraits, className }: RadarChartProps) => {
  const size = 200;
  const center = size / 2;
  const maxRadius = center - 20;
  
  const traits = Object.keys(TRAIT_LABELS);
  const angleStep = (2 * Math.PI) / traits.length;

  const getPoint = (traitIndex: number, value: number) => {
    const angle = traitIndex * angleStep - Math.PI / 2;
    const radius = value * maxRadius;
    return {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle)
    };
  };

  const getUserPath = () => {
    const points = traits.map((trait, index) => 
      getPoint(index, userTraits[trait] || 0)
    );
    return `M ${points.map(p => `${p.x},${p.y}`).join(' L ')} Z`;
  };

  const getMoviePath = () => {
    const points = traits.map((trait, index) => 
      getPoint(index, movieTraits[trait] || 0)
    );
    return `M ${points.map(p => `${p.x},${p.y}`).join(' L ')} Z`;
  };

  const getGridPath = (scale: number) => {
    const points = traits.map((_, index) => 
      getPoint(index, scale)
    );
    return `M ${points.map(p => `${p.x},${p.y}`).join(' L ')} Z`;
  };

  return (
    <div className={`relative ${className}`}>
      <svg width={size} height={size} className="overflow-visible">
        {/* Grid lines */}
        {[0.2, 0.4, 0.6, 0.8, 1.0].map((scale, index) => (
          <path
            key={index}
            d={getGridPath(scale)}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth="1"
            opacity={0.3}
          />
        ))}
        
        {/* Axis lines */}
        {traits.map((_, index) => {
          const point = getPoint(index, 1);
          return (
            <line
              key={index}
              x1={center}
              y1={center}
              x2={point.x}
              y2={point.y}
              stroke="hsl(var(--border))"
              strokeWidth="1"
              opacity={0.3}
            />
          );
        })}

        {/* Movie area */}
        <motion.path
          d={getMoviePath()}
          fill="hsl(var(--muted))"
          fillOpacity="0.3"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth="2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
        />

        {/* User area */}
        <motion.path
          d={getUserPath()}
          fill="hsl(var(--primary))"
          fillOpacity="0.2"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1, delay: 0.8 }}
        />

        {/* Labels */}
        {traits.map((trait, index) => {
          const labelPoint = getPoint(index, 1.15);
          return (
            <text
              key={trait}
              x={labelPoint.x}
              y={labelPoint.y}
              textAnchor="middle"
              dominantBaseline="central"
              className="text-xs fill-foreground font-medium"
            >
              {TRAIT_LABELS[trait as keyof typeof TRAIT_LABELS]}
            </text>
          );
        })}
      </svg>
      
      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-primary rounded-full opacity-60"></div>
          <span className="text-sm text-muted-foreground">Your Profile</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-muted-foreground rounded-full opacity-60"></div>
          <span className="text-sm text-muted-foreground">Movie Profile</span>
        </div>
      </div>
    </div>
  );
};