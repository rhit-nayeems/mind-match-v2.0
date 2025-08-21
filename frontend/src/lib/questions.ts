export type TraitKey = 'energy'|'mood'|'depth'|'optimism'|'novelty'|'comfort'|'intensity'|'humor'|'darkness'
export type TraitVector = Record<TraitKey, number>
export type Choice = { label: string, deltas: Partial<TraitVector> }
export type Question = { prompt: string, choices: Choice[] }

export const QUESTIONS: Question[] = [
  { prompt: 'Tonight I want something…', choices: [
    { label: 'Cozy & calm', deltas: { energy: -0.10, comfort: 0.12, mood: 0.08 } },
    { label: 'Adventurous', deltas: { energy: 0.10, novelty: 0.08 } },
    { label: 'Deep/serious', deltas: { depth: 0.10, darkness: 0.08 } },
    { label: 'Light & funny', deltas: { humor: 0.12, optimism: 0.08 } },
  ]},
  { prompt: 'Preferred pacing?', choices: [
    { label: 'Slow & gentle', deltas: { energy: -0.08, comfort: 0.06 } },
    { label: 'Balanced', deltas: { energy: 0.04 } },
    { label: 'Fast', deltas: { energy: 0.10, intensity: 0.08 } },
    { label: 'Methodical', deltas: { depth: 0.06 } },
  ]},
  { prompt: 'Emotional tone?', choices: [
    { label: 'Uplifting', deltas: { optimism: 0.12, humor: 0.08 } },
    { label: 'Bittersweet', deltas: { mood: 0.06, comfort: 0.04 } },
    { label: 'Dark/tense', deltas: { darkness: 0.12, intensity: 0.06 } },
    { label: 'Reflective', deltas: { depth: 0.10 } },
  ]},
  { prompt: 'Familiar vs Novel?', choices: [
    { label: 'Familiar comfort', deltas: { novelty: -0.10, comfort: 0.10 } },
    { label: 'A little new', deltas: { novelty: 0.04 } },
    { label: 'New & different', deltas: { novelty: 0.10 } },
    { label: 'Boldly experimental', deltas: { novelty: 0.14, intensity: 0.04 } },
  ]},
  { prompt: 'Social vibe?', choices: [
    { label: 'Solo, cozy', deltas: { comfort: 0.08 } },
    { label: 'Group energy', deltas: { energy: 0.06 } },
    { label: 'Quiet duo', deltas: { depth: 0.08 } },
    { label: 'Laugh with friends', deltas: { humor: 0.10 } },
  ]},
  { prompt: 'Complexity level?', choices: [
    { label: 'Mind-bending', deltas: { depth: 0.12 } },
    { label: 'Thoughtful', deltas: { depth: 0.06 } },
    { label: 'Simple & fun', deltas: { depth: -0.04, humor: 0.06 } },
    { label: 'Action-forward', deltas: { energy: 0.08 } },
  ]},
  { prompt: 'Intensity threshold?', choices: [
    { label: 'Keep it soft', deltas: { intensity: -0.08, comfort: 0.06 } },
    { label: 'Some thrills', deltas: { intensity: 0.04 } },
    { label: 'Bring the heat', deltas: { intensity: 0.10 } },
    { label: 'Edge of seat', deltas: { intensity: 0.14, darkness: 0.06 } },
  ]},
  { prompt: 'Humor appetite?', choices: [
    { label: 'Not tonight', deltas: { humor: -0.04, depth: 0.06 } },
    { label: 'A little', deltas: { humor: 0.04 } },
    { label: 'Yes please', deltas: { humor: 0.10 } },
    { label: 'Make me cackle', deltas: { humor: 0.14, optimism: 0.04 } },
  ]},
  { prompt: 'Dark vs bright?', choices: [
    { label: 'Bright', deltas: { darkness: -0.10, optimism: 0.10 } },
    { label: 'Neutral', deltas: { darkness: 0.04 } },
    { label: 'Dark themes', deltas: { darkness: 0.10 } },
    { label: 'Pitch-black', deltas: { darkness: 0.16, depth: 0.04 } },
  ]},
]
