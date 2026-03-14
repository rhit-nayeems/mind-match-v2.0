// frontend/src/data/questions.ts
export const TRAIT_KEYS = [
  "darkness",
  "energy",
  "mood",
  "depth",
  "optimism",
  "novelty",
  "comfort",
  "intensity",
  "humor",
] as const;

export type TraitKey = typeof TRAIT_KEYS[number];
export type TraitVector = Record<TraitKey, number>;
export type QuizGroup = "personality" | "today";
export type QuestionStage = "core" | "adaptive";

export type Choice = {
  id: string;
  label: string;
  group: QuizGroup;
  deltas: Partial<Record<TraitKey, number>>;
};

export type Question = {
  id: string;
  text: string;
  stage: QuestionStage;
  focus: TraitKey[];
  choices: Choice[];
};

export type Responses = Record<string, string>;

export type TraitContext = {
  blended: TraitVector;
  blendedArray: number[];
  personality: TraitVector;
  mood: TraitVector;
  confidence: {
    overall: number;
    personality: number;
    mood: number;
    per_trait: TraitVector;
  };
};

export const DEFAULT_CORE_PER_GROUP = 5;
export const DEFAULT_ADAPTIVE_PER_GROUP = 4;

const PERSONALITY_WEIGHT = 0.68;
const TODAY_WEIGHT = 0.32;
const SCALE = 0.5;

function clamp01(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function makeTraitVector(fill = 0): TraitVector {
  return Object.fromEntries(TRAIT_KEYS.map((k) => [k, fill])) as TraitVector;
}

function vectorFromAccumulator(acc: TraitVector, n: number): TraitVector {
  const out = makeTraitVector(0.5);
  for (const k of TRAIT_KEYS) {
    const avg = n ? acc[k] / n : 0;
    out[k] = clamp01(0.5 + SCALE * avg);
  }
  return out;
}

function traitClarity(value: number) {
  return clamp01(Math.abs(value - 0.5) * 2);
}

function vectorClarity(vec: TraitVector) {
  let total = 0;
  for (const k of TRAIT_KEYS) total += traitClarity(vec[k]);
  return clamp01(total / TRAIT_KEYS.length);
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function q(
  id: string,
  text: string,
  group: QuizGroup,
  stage: QuestionStage,
  focus: TraitKey[],
  choices: Array<{ id: string; label: string; deltas: Partial<Record<TraitKey, number>> }>
): Question {
  return {
    id,
    text,
    stage,
    focus,
    choices: choices.map((c) => ({ ...c, group })),
  };
}

function questionCoverage(question: Question): TraitKey[] {
  const covered = new Set<TraitKey>(question.focus);
  for (const choice of question.choices) {
    for (const k of Object.keys(choice.deltas) as TraitKey[]) {
      if (Math.abs(Number(choice.deltas[k] ?? 0)) > 0) covered.add(k);
    }
  }
  return TRAIT_KEYS.filter((k) => covered.has(k));
}

function traitCoverageCounts(questions: Question[]): TraitVector {
  const out = makeTraitVector(0);
  for (const question of questions) {
    for (const k of questionCoverage(question)) out[k] += 1;
  }
  return out;
}

const PERSONALITY_CORE_POOL: Question[] = [
  q("p_story", "What kind of opening usually hooks you?", "personality", "core", ["depth", "energy", "humor"], [
    { id: "p_story_1", label: "A story that gets me invested in the people", deltas: { depth: 0.44, mood: 0.14, intensity: 0.08 } },
    { id: "p_story_2", label: "A balanced story with heart", deltas: { depth: 0.2, comfort: 0.22, optimism: 0.08 } },
    { id: "p_story_3", label: "Something fun and easy to track", deltas: { humor: 0.3, energy: 0.2, depth: -0.2 } },
    { id: "p_story_4", label: "A big cinematic rush", deltas: { energy: 0.36, intensity: 0.28, depth: -0.26 } },
  ]),
  q("p_risk", "In general, how adventurous are you with movie picks?", "personality", "core", ["novelty", "comfort"], [
    { id: "p_risk_1", label: "I mostly rewatch or stay familiar", deltas: { comfort: 0.44, novelty: -0.38 } },
    { id: "p_risk_2", label: "I branch out once in a while", deltas: { comfort: 0.16, novelty: 0.1 } },
    { id: "p_risk_3", label: "I like trying fresh angles", deltas: { novelty: 0.34, mood: 0.08 } },
    { id: "p_risk_4", label: "I want bold, left-field choices", deltas: { novelty: 0.5, intensity: 0.1, comfort: -0.28 } },
  ]),
  q("p_tone", "What tone do you usually enjoy most?", "personality", "core", ["darkness", "optimism", "mood"], [
    { id: "p_tone_1", label: "Warm and hopeful", deltas: { optimism: 0.42, darkness: -0.32, comfort: 0.18 } },
    { id: "p_tone_2", label: "A balanced mix", deltas: { mood: 0.24, depth: 0.1 } },
    { id: "p_tone_3", label: "Moody and introspective", deltas: { darkness: 0.26, mood: 0.3, optimism: -0.12 } },
    { id: "p_tone_4", label: "Dark and emotionally heavy", deltas: { darkness: 0.5, intensity: 0.14, optimism: -0.32 } },
  ]),
  q("p_pace", "What kind of pace do you usually enjoy?", "personality", "core", ["energy", "intensity", "depth"], [
    { id: "p_pace_1", label: "Slow and takes its time", deltas: { depth: 0.26, mood: 0.2, energy: -0.2 } },
    { id: "p_pace_2", label: "Steady with room to breathe", deltas: { depth: 0.2, energy: 0.04 } },
    { id: "p_pace_3", label: "Quick and energetic", deltas: { energy: 0.3, intensity: 0.16, depth: -0.12 } },
    { id: "p_pace_4", label: "Intense from the start", deltas: { intensity: 0.42, energy: 0.24, comfort: -0.16 } },
  ]),
  q("p_humor", "How much humor do you want in your usual picks?", "personality", "core", ["humor", "optimism", "darkness"], [
    { id: "p_humor_1", label: "Not much", deltas: { humor: -0.2, depth: 0.18, darkness: 0.12 } },
    { id: "p_humor_2", label: "A little is enough", deltas: { humor: 0.14, mood: 0.08 } },
    { id: "p_humor_3", label: "I like a solid dose", deltas: { humor: 0.34, optimism: 0.18, darkness: -0.1 } },
    { id: "p_humor_4", label: "I want genuinely funny", deltas: { humor: 0.5, optimism: 0.2, depth: -0.16 } },
  ]),
  q("p_ambiguity", "How do you feel about morally gray characters?", "personality", "core", ["depth", "darkness", "comfort"], [
    { id: "p_ambiguity_1", label: "I prefer clear good vs bad", deltas: { comfort: 0.3, depth: -0.2, darkness: -0.16 } },
    { id: "p_ambiguity_2", label: "Some gray area is good", deltas: { depth: 0.14, mood: 0.1 } },
    { id: "p_ambiguity_3", label: "Complex ethics make it better", deltas: { depth: 0.34, darkness: 0.16 } },
    { id: "p_ambiguity_4", label: "Give me full moral ambiguity", deltas: { depth: 0.48, darkness: 0.2, comfort: -0.18 } },
  ]),
];
const TODAY_CORE_POOL: Question[] = [
  q("t_energy", "What kind of movie feels right for your energy right now?", "today", "core", ["energy", "intensity", "comfort"], [
    { id: "t_energy_1", label: "Something calm and low-pressure.", deltas: { energy: -0.32, comfort: 0.34, intensity: -0.2 } },
    { id: "t_energy_2", label: "Something easy to ease into.", deltas: { energy: -0.1, comfort: 0.2, mood: 0.1 } },
    { id: "t_energy_3", label: "Something that keeps me engaged.", deltas: { energy: 0.22, intensity: 0.1 } },
    { id: "t_energy_4", label: "Something fast and exciting.", deltas: { energy: 0.42, intensity: 0.2, comfort: -0.14 } },
  ]),
  q("t_emotion", "How heavy do you want this movie to get?", "today", "core", ["intensity", "comfort", "depth"], [
    { id: "t_emotion_1", label: "Keep it light.", deltas: { comfort: 0.36, humor: 0.2, intensity: -0.22 } },
    { id: "t_emotion_2", label: "A little weight is fine.", deltas: { mood: 0.2, comfort: 0.1 } },
    { id: "t_emotion_3", label: "I am okay with heavier themes.", deltas: { depth: 0.24, intensity: 0.24 } },
    { id: "t_emotion_4", label: "Go intense.", deltas: { intensity: 0.46, darkness: 0.12, comfort: -0.18 } },
  ]),
  q("t_attention", "How locked in do you want to be for a movie right now?", "today", "core", ["depth", "comfort"], [
    { id: "t_attention_1", label: "I want to half-watch.", deltas: { comfort: 0.34, depth: -0.28, humor: 0.14 } },
    { id: "t_attention_2", label: "Light attention only.", deltas: { depth: -0.06, comfort: 0.16 } },
    { id: "t_attention_3", label: "I can stay pretty focused.", deltas: { depth: 0.2, mood: 0.08 } },
    { id: "t_attention_4", label: "I am ready to really lock in.", deltas: { depth: 0.44, intensity: 0.1, comfort: -0.16 } },
  ]),
  q("t_outlook", "What kind of emotional effect do you want this movie to have?", "today", "core", ["optimism", "darkness", "mood"], [
    { id: "t_outlook_1", label: "Cheer me up.", deltas: { optimism: 0.44, darkness: -0.34, comfort: 0.14 } },
    { id: "t_outlook_2", label: "Keep me level.", deltas: { mood: 0.18 } },
    { id: "t_outlook_3", label: "Let me sit with something thoughtful.", deltas: { darkness: 0.18, mood: 0.26 } },
    { id: "t_outlook_4", label: "I am okay with something darker.", deltas: { darkness: 0.44, intensity: 0.16, optimism: -0.22 } },
  ]),
  q("t_comfort", "How adventurous are you feeling with this pick?", "today", "core", ["comfort", "novelty"], [
    { id: "t_comfort_1", label: "Do not take too many chances with it.", deltas: { comfort: 0.46, novelty: -0.4 } },
    { id: "t_comfort_2", label: "Keep it mostly safe.", deltas: { comfort: 0.24, novelty: -0.12 } },
    { id: "t_comfort_3", label: "I am open to something different.", deltas: { novelty: 0.2, comfort: 0.06 } },
    { id: "t_comfort_4", label: "Throw me something unexpected.", deltas: { novelty: 0.46, comfort: -0.2, intensity: 0.08 } },
  ]),
  q("t_pacing", "How do you want this movie to feel?", "today", "core", ["energy", "intensity", "depth"], [
    { id: "t_pacing_1", label: "Slow and easy to settle into.", deltas: { mood: 0.24, depth: 0.16, energy: -0.18 } },
    { id: "t_pacing_2", label: "Steady and well-paced.", deltas: { comfort: 0.14, mood: 0.12 } },
    { id: "t_pacing_3", label: "Engaging and always moving.", deltas: { energy: 0.28, intensity: 0.14 } },
    { id: "t_pacing_4", label: "Fast, intense, and nonstop.", deltas: { intensity: 0.44, energy: 0.24, depth: -0.2 } },
  ]),
];

const PERSONALITY_ADAPTIVE_POOL: Question[] = [
  q("pa_endings", "What type of ending usually works for you?", "personality", "adaptive", ["optimism", "darkness", "comfort"], [
    { id: "pa_endings_1", label: "Clear and uplifting.", deltas: { optimism: 0.42, comfort: 0.24, darkness: -0.22 } },
    { id: "pa_endings_2", label: "Bittersweet.", deltas: { mood: 0.24, depth: 0.14 } },
    { id: "pa_endings_3", label: "Open-ended.", deltas: { depth: 0.34, novelty: 0.12, comfort: -0.12 } },
    { id: "pa_endings_4", label: "Dark and unsettling.", deltas: { darkness: 0.46, intensity: 0.14, optimism: -0.3 } },
  ]),
  q("pa_dialogue", "What kind of dialogue usually pulls you in?", "personality", "adaptive", ["depth", "humor", "mood"], [
    { id: "pa_dialogue_1", label: "Clever and funny.", deltas: { humor: 0.34, optimism: 0.12, depth: 0.1 } },
    { id: "pa_dialogue_2", label: "Natural and real.", deltas: { mood: 0.26, depth: 0.16 } },
    { id: "pa_dialogue_3", label: "Thoughtful and reflective.", deltas: { depth: 0.4, mood: 0.2 } },
    { id: "pa_dialogue_4", label: "More visual, less talking.", deltas: { mood: 0.22, novelty: 0.2, humor: -0.1 } },
  ]),
  q("pa_world", "How much world-building do you enjoy?", "personality", "adaptive", ["novelty", "depth", "comfort"], [
    { id: "pa_world_1", label: "Keep it grounded.", deltas: { comfort: 0.24, novelty: -0.24, depth: 0.1 } },
    { id: "pa_world_2", label: "A little imagination.", deltas: { novelty: 0.14, mood: 0.1 } },
    { id: "pa_world_3", label: "Rich fictional worlds.", deltas: { novelty: 0.34, depth: 0.18 } },
    { id: "pa_world_4", label: "Strange, concept-heavy worlds.", deltas: { novelty: 0.5, depth: 0.22, comfort: -0.2 } },
  ]),
  q("pa_tension", "How much tension do you usually want?", "personality", "adaptive", ["intensity", "darkness", "comfort"], [
    { id: "pa_tension_1", label: "Very little.", deltas: { comfort: 0.34, intensity: -0.3, darkness: -0.14 } },
    { id: "pa_tension_2", label: "A little suspense.", deltas: { intensity: 0.1, mood: 0.12 } },
    { id: "pa_tension_3", label: "Strong suspense.", deltas: { intensity: 0.32, darkness: 0.16 } },
    { id: "pa_tension_4", label: "Edge-of-seat pressure.", deltas: { intensity: 0.48, darkness: 0.24, comfort: -0.2 } },
  ]),
  q("pa_visual", "What visual style tends to pull you in?", "personality", "adaptive", ["mood", "novelty", "intensity"], [
    { id: "pa_visual_1", label: "Natural and subtle.", deltas: { comfort: 0.2, novelty: -0.16, mood: 0.16 } },
    { id: "pa_visual_2", label: "Polished and cinematic.", deltas: { mood: 0.3, depth: 0.1 } },
    { id: "pa_visual_3", label: "Stylized and high-energy.", deltas: { mood: 0.24, intensity: 0.24, energy: 0.14 } },
    { id: "pa_visual_4", label: "Experimental and unconventional.", deltas: { novelty: 0.46, mood: 0.22, comfort: -0.12 } },
  ]),
  q("pa_sentiment", "How sentimental are your movie tastes?", "personality", "adaptive", ["comfort", "optimism", "depth"], [
    { id: "pa_sentiment_1", label: "I do not need the movie to get emotional.", deltas: { depth: 0.2, comfort: -0.16, optimism: -0.08 } },
    { id: "pa_sentiment_2", label: "A little heart is nice.", deltas: { comfort: 0.12, mood: 0.1 } },
    { id: "pa_sentiment_3", label: "I like when it gets me emotional.", deltas: { comfort: 0.3, optimism: 0.16 } },
    { id: "pa_sentiment_4", label: "I love a movie that really tugs at me.", deltas: { comfort: 0.44, optimism: 0.22, depth: -0.12 } },
  ]),
];
const TODAY_ADAPTIVE_POOL: Question[] = [
  q("ta_time", "What movie length feels okay to you right now?", "today", "adaptive", ["energy", "depth", "comfort"], [
    { id: "ta_time_1", label: "Short and easy.", deltas: { energy: 0.1, comfort: 0.24, depth: -0.18 } },
    { id: "ta_time_2", label: "A standard-length watch.", deltas: { mood: 0.12 } },
    { id: "ta_time_3", label: "Long and immersive.", deltas: { depth: 0.26, mood: 0.18 } },
    { id: "ta_time_4", label: "I am good with a long one.", deltas: { depth: 0.42, intensity: 0.14, comfort: -0.14 } },
  ]),
  q("ta_headspace", "What kind of movie would help your headspace right now?", "today", "adaptive", ["comfort", "depth", "intensity"], [
    { id: "ta_headspace_1", label: "Something soothing.", deltas: { comfort: 0.42, intensity: -0.26, optimism: 0.12 } },
    { id: "ta_headspace_2", label: "Something engaging, not overwhelming.", deltas: { mood: 0.18, depth: 0.08 } },
    { id: "ta_headspace_3", label: "Something reflective.", deltas: { depth: 0.34, mood: 0.18 } },
    { id: "ta_headspace_4", label: "Something emotionally intense.", deltas: { intensity: 0.4, depth: 0.2, comfort: -0.16 } },
  ]),
  q("ta_shift", "Do you want the movie to meet your mood or pull you somewhere else?", "today", "adaptive", ["optimism", "darkness", "mood"], [
    { id: "ta_shift_1", label: "Pull me upward.", deltas: { optimism: 0.42, darkness: -0.26, humor: 0.12 } },
    { id: "ta_shift_2", label: "Nudge me a little.", deltas: { optimism: 0.24, comfort: 0.14 } },
    { id: "ta_shift_3", label: "Meet me where I am.", deltas: { mood: 0.28 } },
    { id: "ta_shift_4", label: "Take me somewhere darker.", deltas: { darkness: 0.44, optimism: -0.24, intensity: 0.1 } },
  ]),
  q("ta_sensory", "How visually bold do you want this movie to feel?", "today", "adaptive", ["intensity", "mood", "energy"], [
    { id: "ta_sensory_1", label: "Soft and understated.", deltas: { intensity: -0.24, mood: 0.2, comfort: 0.16 } },
    { id: "ta_sensory_2", label: "Stylish but controlled.", deltas: { mood: 0.2 } },
    { id: "ta_sensory_3", label: "Stylish and punchy.", deltas: { intensity: 0.24, energy: 0.12, mood: 0.16 } },
    { id: "ta_sensory_4", label: "Big and immersive.", deltas: { intensity: 0.44, energy: 0.18, comfort: -0.16 } },
  ]),
  q("ta_theme", "How much thematic weight are you up for right now?", "today", "adaptive", ["depth", "comfort", "darkness"], [
    { id: "ta_theme_1", label: "Keep it simple.", deltas: { comfort: 0.26, depth: -0.22 } },
    { id: "ta_theme_2", label: "A little depth is nice.", deltas: { depth: 0.14, comfort: 0.12 } },
    { id: "ta_theme_3", label: "Give me something meaningful.", deltas: { depth: 0.34, mood: 0.14 } },
    { id: "ta_theme_4", label: "Go deep and existential.", deltas: { depth: 0.48, darkness: 0.16, comfort: -0.18 } },
  ]),
  q("ta_discovery", "How far outside your usual lane should this pick go?", "today", "adaptive", ["novelty", "comfort"], [
    { id: "ta_discovery_1", label: "Stay close to what I know.", deltas: { comfort: 0.42, novelty: -0.36 } },
    { id: "ta_discovery_2", label: "Try something nearby.", deltas: { comfort: 0.16, novelty: 0.06 } },
    { id: "ta_discovery_3", label: "Take me somewhere new.", deltas: { novelty: 0.32, comfort: -0.08 } },
    { id: "ta_discovery_4", label: "Throw me something unexpected.", deltas: { novelty: 0.5, comfort: -0.22, intensity: 0.08 } },
  ]),
];

export const QUESTION_BANK: Question[] = [
  ...PERSONALITY_CORE_POOL,
  ...TODAY_CORE_POOL,
  ...PERSONALITY_ADAPTIVE_POOL,
  ...TODAY_ADAPTIVE_POOL,
];

// Backward-compatible default question list; runtime quiz uses buildCoreQuizQuestions().
export const QUESTIONS: Question[] = [...PERSONALITY_CORE_POOL, ...TODAY_CORE_POOL];

function selectCoreQuestions(pool: Question[], count: number, excludeIds?: Set<string>): Question[] {
  const excluded = excludeIds ?? new Set<string>();
  const preferred = shuffle(pool.filter((q) => !excluded.has(q.id)));
  const backup = shuffle(pool.filter((q) => excluded.has(q.id)));
  const available = [...preferred, ...backup];

  const selected: Question[] = [];
  const covered = makeTraitVector(0);

  while (available.length > 0 && selected.length < count) {
    let bestIdx = 0;
    let bestScore = -1;

    for (let i = 0; i < available.length; i++) {
      const cand = available[i];
      const coverage = questionCoverage(cand);
      let newCoverage = 0;
      for (const k of coverage) {
        if (covered[k] === 0) newCoverage += 1;
      }

      const overlapPenalty = excluded.has(cand.id) ? 0.9 : 0;
      const score = newCoverage * 2.9 + coverage.length * 0.2 - overlapPenalty + Math.random() * 0.16;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const [picked] = available.splice(bestIdx, 1);
    selected.push(picked);
    for (const k of questionCoverage(picked)) covered[k] += 1;
  }

  return shuffle(selected);
}

export function buildCoreQuizQuestions(options?: { personalityCount?: number; todayCount?: number; excludeIds?: Iterable<string> }): Question[] {
  const personalityCount = Math.max(2, Math.min(PERSONALITY_CORE_POOL.length, options?.personalityCount ?? DEFAULT_CORE_PER_GROUP));
  const todayCount = Math.max(2, Math.min(TODAY_CORE_POOL.length, options?.todayCount ?? DEFAULT_CORE_PER_GROUP));

  const excludeIds = new Set(options?.excludeIds ?? []);
  const personality = selectCoreQuestions(PERSONALITY_CORE_POOL, personalityCount, excludeIds);
  const today = selectCoreQuestions(TODAY_CORE_POOL, todayCount, excludeIds);

  return [...personality, ...today];
}
function selectAdaptiveQuestions(
  pool: Question[],
  count: number,
  traitNeed: TraitVector,
  askedIds: Set<string>
): Question[] {
  const candidates = pool.filter((q) => !askedIds.has(q.id));
  const selected: Question[] = [];
  const usedTraits = makeTraitVector(0);

  while (candidates.length > 0 && selected.length < count) {
    let bestIdx = 0;
    let bestScore = -1;

    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      const coverage = questionCoverage(cand);
      if (!coverage.length) continue;

      const need = coverage.reduce((sum, k) => sum + traitNeed[k], 0) / coverage.length;
      const novelty = coverage.reduce((sum, k) => sum + 1 / (1 + usedTraits[k]), 0) / coverage.length;
      const score = 0.7 * need + 0.24 * novelty + Math.random() * 0.06;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const [picked] = candidates.splice(bestIdx, 1);
    selected.push(picked);
    for (const k of questionCoverage(picked)) usedTraits[k] += 1;
  }

  return shuffle(selected);
}

export function buildAdaptiveQuizQuestions(
  responses: Responses,
  askedQuestions: Question[],
  options?: { personalityCount?: number; todayCount?: number; excludeIds?: Iterable<string> }
): Question[] {
  const asked = askedQuestions.length ? askedQuestions : QUESTIONS;
  const provisional = answersToTraitContext(responses, asked);

  const askedCoverage = traitCoverageCounts(asked);
  const answeredQuestions = asked.filter((q) => Boolean(responses[q.id]));
  const answeredCoverage = traitCoverageCounts(answeredQuestions);

  const traitNeed = makeTraitVector(0);
  for (const k of TRAIT_KEYS) {
    const conf = provisional.confidence.per_trait[k];
    const ambiguity = 1 - Math.abs(provisional.blended[k] - 0.5) * 2;
    const supportGap = 1 - Math.min(1, answeredCoverage[k] / Math.max(1, askedCoverage[k]));
    traitNeed[k] = clamp01(0.55 * (1 - conf) + 0.3 * ambiguity + 0.15 * supportGap);
  }

  const personalityCount = Math.max(
    2,
    Math.min(PERSONALITY_ADAPTIVE_POOL.length, options?.personalityCount ?? DEFAULT_ADAPTIVE_PER_GROUP)
  );
  const todayCount = Math.max(2, Math.min(TODAY_ADAPTIVE_POOL.length, options?.todayCount ?? DEFAULT_ADAPTIVE_PER_GROUP));

  const baseAskedIds = new Set(asked.map((q) => q.id));
  const strictAskedIds = new Set(baseAskedIds);
  for (const id of options?.excludeIds ?? []) strictAskedIds.add(id);

  let personality = selectAdaptiveQuestions(PERSONALITY_ADAPTIVE_POOL, personalityCount, traitNeed, strictAskedIds);
  let today = selectAdaptiveQuestions(TODAY_ADAPTIVE_POOL, todayCount, traitNeed, strictAskedIds);

  // If recent-history exclusions are too strict, relax them so adaptive phase always appears.
  if (personality.length < personalityCount) {
    const relaxedAsked = new Set(baseAskedIds);
    for (const q of personality) relaxedAsked.add(q.id);
    const topup = selectAdaptiveQuestions(
      PERSONALITY_ADAPTIVE_POOL,
      personalityCount - personality.length,
      traitNeed,
      relaxedAsked
    );
    personality = [...personality, ...topup];
  }

  if (today.length < todayCount) {
    const relaxedAsked = new Set(baseAskedIds);
    for (const q of today) relaxedAsked.add(q.id);
    const topup = selectAdaptiveQuestions(
      TODAY_ADAPTIVE_POOL,
      todayCount - today.length,
      traitNeed,
      relaxedAsked
    );
    today = [...today, ...topup];
  }

  return [...personality.slice(0, personalityCount), ...today.slice(0, todayCount)];
}

function normalizeQuestionSet(questionSet?: Question[]): Question[] {
  const src = questionSet && questionSet.length ? questionSet : QUESTIONS;
  const seen = new Set<string>();
  const out: Question[] = [];
  for (const q of src) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    out.push(q);
  }
  return out;
}

export function answersToTraitContext(responses: Responses, questionSet?: Question[]): TraitContext {
  const questions = normalizeQuestionSet(questionSet);

  const accPers = makeTraitVector(0);
  const accToday = makeTraitVector(0);
  const supportAnswered = makeTraitVector(0);

  let answered = 0;
  let answeredPers = 0;
  let answeredToday = 0;

  for (const q of questions) {
    const cid = responses[q.id];
    if (!cid) continue;

    const selected = q.choices.find((c) => c.id === cid);
    if (!selected) continue;

    answered += 1;
    const isToday = selected.group === "today";
    const bucket = isToday ? accToday : accPers;

    if (isToday) answeredToday += 1;
    else answeredPers += 1;

    for (const k of TRAIT_KEYS) {
      const delta = Number(selected.deltas[k] ?? 0);
      if (!Number.isFinite(delta) || delta === 0) continue;
      bucket[k] += delta;
    }

    for (const k of questionCoverage(q)) supportAnswered[k] += 1;
  }

  const personality = vectorFromAccumulator(accPers, answeredPers);
  const mood = vectorFromAccumulator(accToday, answeredToday);

  const blended = makeTraitVector(0.5);
  for (const k of TRAIT_KEYS) {
    const avgPers = answeredPers ? accPers[k] / answeredPers : 0;
    const avgToday = answeredToday ? accToday[k] / answeredToday : 0;
    const signed = PERSONALITY_WEIGHT * avgPers + TODAY_WEIGHT * avgToday;
    blended[k] = clamp01(0.5 + SCALE * signed);
  }

  const personalityTotal = Math.max(1, questions.filter((q) => q.choices[0]?.group === "personality").length);
  const todayTotal = Math.max(1, questions.filter((q) => q.choices[0]?.group === "today").length);

  const overallRatio = clamp01(answered / Math.max(1, questions.length));
  const personalityRatio = clamp01(answeredPers / personalityTotal);
  const moodRatio = clamp01(answeredToday / todayTotal);

  const overallClarity = vectorClarity(blended);
  const personalityClarity = vectorClarity(personality);
  const moodClarity = vectorClarity(mood);

  const overallConfidence = clamp01(0.35 * overallRatio + 0.65 * overallClarity);
  const personalityConfidence = clamp01(0.4 * personalityRatio + 0.6 * personalityClarity);
  const moodConfidence = clamp01(0.4 * moodRatio + 0.6 * moodClarity);

  const traitSupportTotal = traitCoverageCounts(questions);
  const perTrait = makeTraitVector(0.5);
  for (const k of TRAIT_KEYS) {
    const supportTotal = Math.max(1, traitSupportTotal[k]);
    const supportRatio = clamp01(supportAnswered[k] / supportTotal);
    const clarity = traitClarity(blended[k]);
    perTrait[k] = clamp01(0.08 + 0.22 * overallRatio + 0.3 * supportRatio + 0.4 * clarity);
  }

  return {
    blended,
    blendedArray: TRAIT_KEYS.map((k) => blended[k]),
    personality,
    mood,
    confidence: {
      overall: overallConfidence,
      personality: personalityConfidence,
      mood: moodConfidence,
      per_trait: perTrait,
    },
  };
}

export function answersToTraitVector(responses: Responses, questionSet?: Question[]): number[] {
  return answersToTraitContext(responses, questionSet).blendedArray;
}





