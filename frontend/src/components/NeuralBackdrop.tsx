import { motion, useReducedMotion } from 'framer-motion'

type Tone = 'cyan' | 'blue' | 'amber'

type Soma = {
  id: string
  x: number
  y: number
  r: number
  halo: number
  tone: Tone
}

type Branch = {
  id: string
  d: string
  width: number
  opacity: number
  tone: Tone
  emphasis?: boolean
  pulse?: {
    duration: number
    delay: number
    dash?: number
  }
}

type Satellite = {
  id: string
  x: number
  y: number
  size: number
  tone: Tone
}

const palette: Record<Tone, { stroke: string; glow: string; ring: string; core: string; halo: string }> = {
  cyan: {
    stroke: 'rgba(125, 211, 252, 0.42)',
    glow: 'rgba(34, 211, 238, 0.22)',
    ring: 'rgba(165, 243, 252, 0.22)',
    core: '#9eefff',
    halo: 'rgba(34, 211, 238, 0.12)',
  },
  blue: {
    stroke: 'rgba(147, 197, 253, 0.38)',
    glow: 'rgba(96, 165, 250, 0.18)',
    ring: 'rgba(191, 219, 254, 0.2)',
    core: '#c9e1ff',
    halo: 'rgba(96, 165, 250, 0.1)',
  },
  amber: {
    stroke: 'rgba(251, 191, 36, 0.32)',
    glow: 'rgba(251, 191, 36, 0.16)',
    ring: 'rgba(253, 230, 138, 0.18)',
    core: '#ffe1a6',
    halo: 'rgba(251, 191, 36, 0.08)',
  },
}

const somas: Soma[] = [
  { id: 'alpha', x: 184, y: 232, r: 18, halo: 74, tone: 'cyan' },
  { id: 'beta', x: 520, y: 182, r: 15, halo: 62, tone: 'blue' },
  { id: 'gamma', x: 918, y: 262, r: 20, halo: 80, tone: 'amber' },
  { id: 'delta', x: 1278, y: 212, r: 17, halo: 72, tone: 'cyan' },
  { id: 'epsilon', x: 356, y: 618, r: 23, halo: 92, tone: 'amber' },
  { id: 'zeta', x: 804, y: 520, r: 27, halo: 108, tone: 'cyan' },
  { id: 'eta', x: 1244, y: 640, r: 21, halo: 84, tone: 'blue' },
]

const branches: Branch[] = [
  { id: 'alpha-a', d: 'M 184 232 C 138 196 96 186 58 206', width: 1.2, opacity: 0.34, tone: 'cyan' },
  { id: 'alpha-b', d: 'M 184 232 C 226 182 278 152 338 136', width: 1.2, opacity: 0.36, tone: 'cyan' },
  { id: 'alpha-c', d: 'M 184 232 C 148 284 114 338 90 404', width: 1.2, opacity: 0.34, tone: 'cyan' },
  { id: 'alpha-d', d: 'M 184 232 C 236 254 280 262 334 254', width: 1.05, opacity: 0.3, tone: 'blue' },
  { id: 'alpha-twig', d: 'M 104 336 C 82 350 68 374 60 406', width: 0.95, opacity: 0.24, tone: 'cyan' },

  { id: 'beta-a', d: 'M 520 182 C 492 130 448 102 396 96', width: 1.1, opacity: 0.32, tone: 'blue' },
  { id: 'beta-b', d: 'M 520 182 C 590 142 654 126 724 134', width: 1.2, opacity: 0.34, tone: 'blue' },
  { id: 'beta-c', d: 'M 520 182 C 552 234 584 280 630 324', width: 1.18, opacity: 0.32, tone: 'cyan' },

  { id: 'gamma-a', d: 'M 918 262 C 872 206 836 164 796 128', width: 1.18, opacity: 0.34, tone: 'amber' },
  { id: 'gamma-b', d: 'M 918 262 C 998 236 1072 246 1146 286', width: 1.2, opacity: 0.34, tone: 'blue' },
  { id: 'gamma-c', d: 'M 918 262 C 884 322 860 384 844 456', width: 1.18, opacity: 0.32, tone: 'amber' },

  { id: 'delta-a', d: 'M 1278 212 C 1222 150 1170 114 1092 98', width: 1.18, opacity: 0.34, tone: 'cyan' },
  { id: 'delta-b', d: 'M 1278 212 C 1342 188 1408 190 1484 216', width: 1.16, opacity: 0.3, tone: 'cyan' },
  { id: 'delta-c', d: 'M 1278 212 C 1248 278 1232 344 1242 410', width: 1.12, opacity: 0.28, tone: 'blue' },

  { id: 'epsilon-a', d: 'M 356 618 C 280 588 220 572 146 586', width: 1.18, opacity: 0.34, tone: 'amber' },
  { id: 'epsilon-b', d: 'M 356 618 C 428 560 494 526 572 504', width: 1.22, opacity: 0.36, tone: 'amber' },
  { id: 'epsilon-c', d: 'M 356 618 C 324 694 294 754 264 822', width: 1.18, opacity: 0.32, tone: 'amber' },
  { id: 'epsilon-d', d: 'M 356 618 C 412 660 450 710 492 770', width: 1.05, opacity: 0.28, tone: 'blue' },

  { id: 'zeta-a', d: 'M 804 520 C 708 500 650 470 600 414', width: 1.2, opacity: 0.34, tone: 'cyan' },
  { id: 'zeta-b', d: 'M 804 520 C 884 462 950 432 1036 420', width: 1.22, opacity: 0.34, tone: 'cyan' },
  { id: 'zeta-c', d: 'M 804 520 C 772 606 748 674 724 760', width: 1.2, opacity: 0.32, tone: 'blue' },
  { id: 'zeta-d', d: 'M 804 520 C 882 562 968 610 1072 666', width: 1.25, opacity: 0.36, tone: 'amber' },

  { id: 'eta-a', d: 'M 1244 640 C 1162 596 1102 588 1040 602', width: 1.18, opacity: 0.32, tone: 'blue' },
  { id: 'eta-b', d: 'M 1244 640 C 1306 582 1368 536 1440 482', width: 1.18, opacity: 0.3, tone: 'blue' },
  { id: 'eta-c', d: 'M 1244 640 C 1222 716 1214 788 1228 860', width: 1.16, opacity: 0.28, tone: 'cyan' },
  { id: 'eta-d', d: 'M 1244 640 C 1308 692 1378 728 1468 754', width: 1.1, opacity: 0.28, tone: 'amber' },

  {
    id: 'alpha-beta-link',
    d: 'M 338 136 C 398 126 454 138 520 182',
    width: 1.46,
    opacity: 0.54,
    tone: 'blue',
    emphasis: true,
    pulse: { duration: 10.8, delay: 0.6, dash: 0.1 },
  },
  {
    id: 'beta-gamma-link',
    d: 'M 724 134 C 792 156 846 196 918 262',
    width: 1.52,
    opacity: 0.56,
    tone: 'cyan',
    emphasis: true,
    pulse: { duration: 12.4, delay: 1.4, dash: 0.12 },
  },
  {
    id: 'gamma-delta-link',
    d: 'M 1036 420 C 1122 348 1188 280 1278 212',
    width: 1.46,
    opacity: 0.52,
    tone: 'cyan',
    emphasis: true,
    pulse: { duration: 11.6, delay: 2.4, dash: 0.09 },
  },
  {
    id: 'beta-zeta-link',
    d: 'M 630 324 C 688 392 738 454 804 520',
    width: 1.5,
    opacity: 0.52,
    tone: 'cyan',
    emphasis: true,
    pulse: { duration: 12.8, delay: 0.8, dash: 0.1 },
  },
  {
    id: 'epsilon-zeta-link',
    d: 'M 572 504 C 646 476 716 482 804 520',
    width: 1.52,
    opacity: 0.54,
    tone: 'amber',
    emphasis: true,
    pulse: { duration: 13.2, delay: 1.8, dash: 0.11 },
  },
  {
    id: 'gamma-zeta-link',
    d: 'M 844 456 C 826 474 814 492 804 520',
    width: 1.42,
    opacity: 0.48,
    tone: 'amber',
    emphasis: true,
    pulse: { duration: 9.8, delay: 2.2, dash: 0.14 },
  },
  {
    id: 'zeta-eta-link',
    d: 'M 804 520 C 940 506 1088 548 1244 640',
    width: 1.6,
    opacity: 0.58,
    tone: 'blue',
    emphasis: true,
    pulse: { duration: 13.8, delay: 0.4, dash: 0.1 },
  },
]

const satellites: Satellite[] = [
  { id: 'sat-1', x: 58, y: 206, size: 3.2, tone: 'cyan' },
  { id: 'sat-2', x: 338, y: 136, size: 2.7, tone: 'blue' },
  { id: 'sat-3', x: 724, y: 134, size: 2.9, tone: 'cyan' },
  { id: 'sat-4', x: 1092, y: 98, size: 2.6, tone: 'cyan' },
  { id: 'sat-5', x: 146, y: 586, size: 3.1, tone: 'amber' },
  { id: 'sat-6', x: 572, y: 504, size: 3, tone: 'amber' },
  { id: 'sat-7', x: 1036, y: 420, size: 2.8, tone: 'cyan' },
  { id: 'sat-8', x: 1440, y: 482, size: 2.5, tone: 'blue' },
  { id: 'sat-9', x: 1228, y: 860, size: 2.4, tone: 'cyan' },
]

function AmbientLights({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#040915]" />
      <div
        className="absolute inset-0 opacity-95"
        style={{
          background:
            'radial-gradient(circle at 16% 12%, rgba(34,211,238,0.18), transparent 24%), radial-gradient(circle at 78% 10%, rgba(96,165,250,0.14), transparent 22%), radial-gradient(circle at 52% 88%, rgba(251,191,36,0.08), transparent 24%), linear-gradient(180deg, #040915 0%, #050b16 48%, #030711 100%)',
        }}
      />

      <motion.div
        className="absolute left-[-10%] top-[-12%] h-[34rem] w-[34rem] rounded-full opacity-75 blur-3xl"
        style={{ background: 'radial-gradient(circle at 50% 50%, rgba(34,211,238,0.16), rgba(96,165,250,0.06) 40%, transparent 72%)' }}
        animate={reducedMotion ? undefined : { x: [0, 32, -12, 0], y: [0, 18, -12, 0], scale: [1, 1.06, 0.98, 1] }}
        transition={{ duration: 32, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute right-[-10%] top-[12%] h-[28rem] w-[28rem] rounded-full opacity-55 blur-3xl"
        style={{ background: 'radial-gradient(circle at 50% 50%, rgba(96,165,250,0.14), rgba(34,211,238,0.05) 42%, transparent 72%)' }}
        animate={reducedMotion ? undefined : { x: [0, -24, 10, 0], y: [0, 14, -10, 0], scale: [1, 1.04, 0.97, 1] }}
        transition={{ duration: 36, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-[-14%] left-1/2 h-[24rem] w-[38rem] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{ background: 'radial-gradient(circle at 50% 40%, rgba(34,211,238,0.12), rgba(251,191,36,0.08) 34%, rgba(96,165,250,0.05) 52%, transparent 76%)' }}
        animate={reducedMotion ? undefined : { x: ['-50%', '-47%', '-52%', '-50%'], scale: [1, 1.05, 0.98, 1] }}
        transition={{ duration: 40, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

function StructuredGrid() {
  return (
    <div
      className="absolute inset-0 opacity-45"
      style={{
        backgroundImage:
          'linear-gradient(rgba(186,230,253,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(186,230,253,0.06) 1px, transparent 1px)',
        backgroundSize: '84px 84px',
        maskImage: 'radial-gradient(circle at 50% 40%, black 12%, rgba(0,0,0,0.84) 56%, transparent 92%)',
        WebkitMaskImage: 'radial-gradient(circle at 50% 40%, black 12%, rgba(0,0,0,0.84) 56%, transparent 92%)',
      }}
    />
  )
}

function ScanBeam({ reducedMotion }: { reducedMotion: boolean }) {
  if (reducedMotion) return null

  return (
    <motion.div
      className="absolute inset-y-[-10%] left-[-34%] w-[32%] rotate-[10deg] blur-2xl"
      style={{
        background:
          'linear-gradient(90deg, transparent 0%, rgba(125,211,252,0.03) 18%, rgba(103,232,249,0.12) 50%, rgba(251,191,36,0.05) 78%, transparent 100%)',
      }}
      initial={{ x: '0%' }}
      animate={{ x: ['0%', '465%'] }}
      transition={{ duration: 19, ease: 'linear', repeat: Infinity, repeatDelay: 8 }}
    />
  )
}

function NeuralNetwork({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <svg
      className="absolute inset-0 h-full w-full opacity-95"
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <radialGradient id="soma-cyan" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#f6feff" stopOpacity="0.95" />
          <stop offset="40%" stopColor="#9cecff" stopOpacity="0.92" />
          <stop offset="100%" stopColor="#103546" stopOpacity="0.14" />
        </radialGradient>
        <radialGradient id="soma-blue" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#f4f8ff" stopOpacity="0.94" />
          <stop offset="42%" stopColor="#bfd7ff" stopOpacity="0.88" />
          <stop offset="100%" stopColor="#12253f" stopOpacity="0.14" />
        </radialGradient>
        <radialGradient id="soma-amber" cx="50%" cy="50%" r="72%">
          <stop offset="0%" stopColor="#fffaf0" stopOpacity="0.94" />
          <stop offset="40%" stopColor="#ffd98f" stopOpacity="0.86" />
          <stop offset="100%" stopColor="#3c2b0c" stopOpacity="0.12" />
        </radialGradient>
      </defs>

      <g opacity="0.18">
        {branches.filter((branch) => branch.emphasis).map((branch) => {
          const tone = palette[branch.tone]
          return (
            <path
              key={`${branch.id}-glow`}
              d={branch.d}
              fill="none"
              stroke={tone.glow}
              strokeWidth={branch.width * 4.5}
              strokeLinecap="round"
            />
          )
        })}
      </g>

      <g>
        {branches.map((branch) => {
          const tone = palette[branch.tone]
          return (
            <path
              key={branch.id}
              d={branch.d}
              fill="none"
              stroke={tone.stroke}
              strokeWidth={branch.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={branch.opacity}
            />
          )
        })}
      </g>

      {!reducedMotion && (
        <g>
          {branches.filter((branch) => branch.pulse).map((branch) => {
            const tone = palette[branch.tone]
            return (
              <motion.path
                key={`${branch.id}-pulse`}
                d={branch.d}
                fill="none"
                stroke={tone.core}
                strokeWidth={branch.width + 0.45}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={`${branch.pulse?.dash ?? 0.1} 1`}
                initial={{ strokeDashoffset: 1, opacity: 0 }}
                animate={{ strokeDashoffset: [1, -1], opacity: [0, 0.95, 0.12] }}
                transition={{
                  duration: branch.pulse?.duration ?? 12,
                  delay: branch.pulse?.delay ?? 0,
                  ease: 'linear',
                  repeat: Infinity,
                }}
              />
            )
          })}
        </g>
      )}

      <g opacity="0.78">
        {satellites.map((sat) => {
          const tone = palette[sat.tone]
          return (
            <g key={sat.id} transform={`translate(${sat.x} ${sat.y})`}>
              <circle r={sat.size * 2.8} fill={tone.halo} opacity="0.55" />
              <circle r={sat.size} fill={tone.core} />
            </g>
          )
        })}
      </g>

      <g>
        {somas.map((soma) => {
          const tone = palette[soma.tone]
          return (
            <g key={soma.id} transform={`translate(${soma.x} ${soma.y})`}>
              <circle r={soma.halo} fill={tone.halo} opacity="0.42" />
              <circle r={soma.r + 9} fill="none" stroke={tone.ring} strokeWidth="1" opacity="0.45" />
              <circle r={soma.r + 4} fill="none" stroke={tone.stroke} strokeWidth="1.15" opacity="0.46" />
              <circle r={soma.r} fill={`url(#soma-${soma.tone})`} stroke={tone.core} strokeWidth="1.15" />
              <circle r={Math.max(3, soma.r * 0.22)} fill="#f8fdff" opacity="0.84" />
            </g>
          )
        })}
      </g>
    </svg>
  )
}

function ReadabilityVeil() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(circle at 50% 42%, rgba(5,9,21,0) 0%, rgba(5,9,21,0.06) 52%, rgba(5,9,21,0.28) 82%, rgba(5,9,21,0.64) 100%)',
      }}
    />
  )
}

export default function NeuralBackdrop() {
  const reducedMotion = useReducedMotion()

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <AmbientLights reducedMotion={!!reducedMotion} />
      <StructuredGrid />
      <NeuralNetwork reducedMotion={!!reducedMotion} />
      <ScanBeam reducedMotion={!!reducedMotion} />
      <ReadabilityVeil />
    </div>
  )
}
