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
  helper: string;
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

// The blended profile stays anchored in long-term taste. "Today" answers can steer the request
// without fully overriding the personality signal.
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
  helper: string,
  group: QuizGroup,
  stage: QuestionStage,
  focus: TraitKey[],
  choices: Array<{ id: string; label: string; deltas: Partial<Record<TraitKey, number>> }>
): Question {
  return {
    id,
    text,
    helper,
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
  q("p_story", "What gets you hooked in the first 10 minutes?", "What kind of opening makes you think, okay, I'm in?", "personality", "core", ["depth", "energy", "humor"], [
    { id: "p_story_1", label: "Characters I immediately care about", deltas: { depth: 0.44, mood: 0.14, intensity: 0.08 } },
    { id: "p_story_2", label: "A heartfelt, balanced story", deltas: { depth: 0.2, comfort: 0.22, optimism: 0.08 } },
    { id: "p_story_3", label: "Something fun and easy to follow", deltas: { humor: 0.3, energy: 0.2, depth: -0.2 } },
    { id: "p_story_4", label: "Epic visuals and spectacle", deltas: { energy: 0.36, intensity: 0.28, depth: -0.26 } },
  ]),
  q("p_risk", "How much do you enjoy discovering new kinds of movies?", "Thinking about your overall taste, not just right now.", "personality", "core", ["novelty", "comfort"], [
    { id: "p_risk_1", label: "I mostly stick with movies I already know I'll like", deltas: { comfort: 0.44, novelty: -0.38 } },
    { id: "p_risk_2", label: "I try something new once in a while", deltas: { comfort: 0.16, novelty: 0.1 } },
    { id: "p_risk_3", label: "I enjoy exploring different kinds of movies", deltas: { novelty: 0.34, mood: 0.08 } },
    { id: "p_risk_4", label: "I love discovering unusual or unexpected films", deltas: { novelty: 0.5, intensity: 0.1, comfort: -0.28 } },
  ]),
  q("p_tone", "What tone do you usually enjoy most?", "Thinking about your favorite movies overall, what emotional vibe do they tend to have?", "personality", "core", ["darkness", "optimism", "mood"], [
    { id: "p_tone_1", label: "Warm and hopeful", deltas: { optimism: 0.42, darkness: -0.32, comfort: 0.18 } },
    { id: "p_tone_2", label: "A balanced mix of light and serious", deltas: { mood: 0.24, depth: 0.1 } },
    { id: "p_tone_3", label: "Moody and introspective", deltas: { darkness: 0.26, mood: 0.3, optimism: -0.12 } },
    { id: "p_tone_4", label: "Dark and emotionally heavy", deltas: { darkness: 0.5, intensity: 0.14, optimism: -0.32 } },
  ]),
  q("p_pace", "How much time do you like a story to take?", "Some movies unfold slowly, while others move quickly from moment to moment.", "personality", "core", ["energy", "intensity", "depth"], [
    { id: "p_pace_1", label: "Slow and deliberate", deltas: { depth: 0.26, mood: 0.2, energy: -0.2 } },
    { id: "p_pace_2", label: "Balanced and steady", deltas: { depth: 0.2, energy: 0.04 } },
    { id: "p_pace_3", label: "Quick and energetic", deltas: { energy: 0.3, intensity: 0.16, depth: -0.12 } },
    { id: "p_pace_4", label: "Intense from the start", deltas: { intensity: 0.42, energy: 0.24, comfort: -0.16 } },
  ]),
  q("p_humor", "How much humor do you usually want in a movie?", "Not every film needs to be funny - but does yours?", "personality", "core", ["humor", "optimism", "darkness"], [
    { id: "p_humor_1", label: "Not really my thing", deltas: { humor: -0.2, depth: 0.18, darkness: 0.12 } },
    { id: "p_humor_2", label: "A little is enough", deltas: { humor: 0.14, mood: 0.08 } },
    { id: "p_humor_3", label: "A good amount of humor", deltas: { humor: 0.34, optimism: 0.18, darkness: -0.1 } },
    { id: "p_humor_4", label: "I want something genuinely funny", deltas: { humor: 0.5, optimism: 0.2, depth: -0.16 } },
  ]),
  q("p_ambiguity", "How do you feel about morally complex characters?", "Some stories clearly separate heroes and villains, while others blur the lines.", "personality", "core", ["depth", "darkness", "comfort"], [
    { id: "p_ambiguity_1", label: "I prefer a clear good vs. bad story", deltas: { comfort: 0.3, depth: -0.2, darkness: -0.16 } },
    { id: "p_ambiguity_2", label: "Some gray areas are interesting", deltas: { depth: 0.14, mood: 0.1 } },
    { id: "p_ambiguity_3", label: "Moral complexity makes the story better", deltas: { depth: 0.34, darkness: 0.16 } },
    { id: "p_ambiguity_4", label: "I enjoy fully ambiguous characters", deltas: { depth: 0.48, darkness: 0.2, comfort: -0.18 } },
  ]),
];
const TODAY_CORE_POOL: Question[] = [
  q("t_energy", "What kind of movie fits your energy right now?", "Think about the kind of watch that would feel comfortable right now.", "today", "core", ["energy", "intensity", "comfort"], [
    { id: "t_energy_1", label: "Something calm and low-pressure", deltas: { energy: -0.32, comfort: 0.34, intensity: -0.2 } },
    { id: "t_energy_2", label: "Something easy to settle into", deltas: { energy: -0.1, comfort: 0.2, mood: 0.1 } },
    { id: "t_energy_3", label: "Something that keeps me engaged", deltas: { energy: 0.22, intensity: 0.1 } },
    { id: "t_energy_4", label: "Something fast and exciting", deltas: { energy: 0.42, intensity: 0.2, comfort: -0.14 } },
  ]),
  q("t_emotion", "How emotionally heavy should this movie be?", "Are you in the mood for something light, or something more intense?", "today", "core", ["intensity", "comfort", "depth"], [
    { id: "t_emotion_1", label: "Keep it light", deltas: { comfort: 0.36, humor: 0.2, intensity: -0.22 } },
    { id: "t_emotion_2", label: "A little emotional weight is fine", deltas: { mood: 0.2, comfort: 0.1 } },
    { id: "t_emotion_3", label: "I'm okay with heavier themes", deltas: { depth: 0.24, intensity: 0.24 } },
    { id: "t_emotion_4", label: "Give me something intense", deltas: { intensity: 0.46, darkness: 0.12, comfort: -0.18 } },
  ]),
  q("t_attention", "How focused do you want to be while watching?", "Some movies work well in the background, others demand your attention.", "today", "core", ["depth", "comfort"], [
    { id: "t_attention_1", label: "I want something I can half-watch", deltas: { comfort: 0.34, depth: -0.28, humor: 0.14 } },
    { id: "t_attention_2", label: "Light attention is fine", deltas: { depth: -0.06, comfort: 0.16 } },
    { id: "t_attention_3", label: "I can stay pretty focused", deltas: { depth: 0.2, mood: 0.08 } },
    { id: "t_attention_4", label: "I'm ready to really lock in", deltas: { depth: 0.44, intensity: 0.1, comfort: -0.16 } },
  ]),
  q("t_outlook", "What kind of emotional effect do you want from this movie?", "Where do you want the movie to leave you feeling afterward?", "today", "core", ["optimism", "darkness", "mood"], [
    { id: "t_outlook_1", label: "Cheer me up", deltas: { optimism: 0.44, darkness: -0.34, comfort: 0.14 } },
    { id: "t_outlook_2", label: "Keep me level", deltas: { mood: 0.18 } },
    { id: "t_outlook_3", label: "Thoughtful, like something lingered", deltas: { darkness: 0.18, mood: 0.26 } },
    { id: "t_outlook_4", label: "Wrecked - in a good way", deltas: { darkness: 0.44, intensity: 0.16, optimism: -0.22 } },
  ]),
  q("t_comfort", "How close to your usual taste should this pick be?", "Do you want something familiar, or something further outside your usual picks?", "today", "core", ["comfort", "novelty"], [
    { id: "t_comfort_1", label: "Very close to what I usually watch", deltas: { comfort: 0.46, novelty: -0.4 } },
    { id: "t_comfort_2", label: "Mostly familiar", deltas: { comfort: 0.24, novelty: -0.12 } },
    { id: "t_comfort_3", label: "A bit outside my usual taste", deltas: { novelty: 0.2, comfort: 0.06 } },
    { id: "t_comfort_4", label: "Something very different from my usual picks", deltas: { novelty: 0.46, comfort: -0.2, intensity: 0.08 } },
  ]),
  q("t_pacing", "How much momentum do you want right now?", "Do you want something relaxed, or something that keeps pushing forward?", "today", "core", ["energy", "intensity", "depth"], [
    { id: "t_pacing_1", label: "Slow and atmospheric", deltas: { mood: 0.24, depth: 0.16, energy: -0.18 } },
    { id: "t_pacing_2", label: "Steady and well-paced", deltas: { comfort: 0.14, mood: 0.12 } },
    { id: "t_pacing_3", label: "Fast and energetic", deltas: { energy: 0.28, intensity: 0.14 } },
    { id: "t_pacing_4", label: "Relentless and intense", deltas: { intensity: 0.44, energy: 0.24, depth: -0.2 } },
  ]),
];

const PERSONALITY_ADAPTIVE_POOL: Question[] = [
  q("pa_endings", "What kind of ending usually works best for you?", "Different movies leave different kinds of final impressions.", "personality", "adaptive", ["optimism", "darkness", "comfort"], [
    { id: "pa_endings_1", label: "Clear and uplifting", deltas: { optimism: 0.42, comfort: 0.24, darkness: -0.22 } },
    { id: "pa_endings_2", label: "Bittersweet", deltas: { mood: 0.24, depth: 0.14 } },
    { id: "pa_endings_3", label: "Open-ended", deltas: { depth: 0.34, novelty: 0.12, comfort: -0.12 } },
    { id: "pa_endings_4", label: "Dark and unsettling", deltas: { darkness: 0.46, intensity: 0.14, optimism: -0.3 } },
  ]),
  q("pa_dialogue", "What kind of dialogue usually pulls you in?", "Some films rely heavily on conversation, others more on visuals.", "personality", "adaptive", ["depth", "humor", "mood"], [
    { id: "pa_dialogue_1", label: "Clever and funny", deltas: { humor: 0.34, optimism: 0.12, depth: 0.1 } },
    { id: "pa_dialogue_2", label: "Natural and realistic", deltas: { mood: 0.26, depth: 0.16 } },
    { id: "pa_dialogue_3", label: "Thoughtful and reflective", deltas: { depth: 0.4, mood: 0.2 } },
    { id: "pa_dialogue_4", label: "More visual, less dialogue", deltas: { mood: 0.22, novelty: 0.2, humor: -0.1 } },
  ]),
  q("pa_world", "How imaginative do you like a movie's setting to be?", "Some stories stay close to the real world, while others create entirely new ones.", "personality", "adaptive", ["novelty", "depth", "comfort"], [
    { id: "pa_world_1", label: "Keep it grounded in the real world", deltas: { comfort: 0.24, novelty: -0.24, depth: 0.1 } },
    { id: "pa_world_2", label: "A touch of imagination is nice", deltas: { novelty: 0.14, mood: 0.1 } },
    { id: "pa_world_3", label: "Rich fictional settings", deltas: { novelty: 0.34, depth: 0.18 } },
    { id: "pa_world_4", label: "Strange or concept-heavy worlds", deltas: { novelty: 0.5, depth: 0.22, comfort: -0.2 } },
  ]),
  q("pa_tension", "How much tension do you usually want in a movie?", "Some stories build constant suspense, others stay relaxed.", "personality", "adaptive", ["intensity", "darkness", "comfort"], [
    { id: "pa_tension_1", label: "Very little", deltas: { comfort: 0.34, intensity: -0.3, darkness: -0.14 } },
    { id: "pa_tension_2", label: "A little suspense", deltas: { intensity: 0.1, mood: 0.12 } },
    { id: "pa_tension_3", label: "Strong suspense", deltas: { intensity: 0.32, darkness: 0.16 } },
    { id: "pa_tension_4", label: "Edge-of-your-seat tension", deltas: { intensity: 0.48, darkness: 0.24, comfort: -0.2 } },
  ]),
  q("pa_visual", "What visual style tends to pull you in?", "How important is cinematography or visual style to your experience?", "personality", "adaptive", ["mood", "novelty", "intensity"], [
    { id: "pa_visual_1", label: "Natural and understated", deltas: { comfort: 0.2, novelty: -0.16, mood: 0.16 } },
    { id: "pa_visual_2", label: "Polished and cinematic", deltas: { mood: 0.3, depth: 0.1 } },
    { id: "pa_visual_3", label: "Stylized and energetic", deltas: { mood: 0.24, intensity: 0.24, energy: 0.14 } },
    { id: "pa_visual_4", label: "Experimental and unconventional", deltas: { novelty: 0.46, mood: 0.22, comfort: -0.12 } },
  ]),
  q("pa_sentiment", "How sentimental are your movie tastes?", "Some films aim to move you emotionally, others keep more distance.", "personality", "adaptive", ["comfort", "optimism", "depth"], [
    { id: "pa_sentiment_1", label: "I don't need the movie to get emotional", deltas: { depth: 0.2, comfort: -0.16, optimism: -0.08 } },
    { id: "pa_sentiment_2", label: "A little heart is nice", deltas: { comfort: 0.12, mood: 0.1 } },
    { id: "pa_sentiment_3", label: "I like when a movie moves me", deltas: { comfort: 0.3, optimism: 0.16 } },
    { id: "pa_sentiment_4", label: "I enjoy movies that hit me emotionally", deltas: { comfort: 0.44, optimism: 0.22, depth: -0.12 } },
  ]),
];
const TODAY_ADAPTIVE_POOL: Question[] = [
  q("ta_time", "What movie length feels okay to you right now?", "Think about how much time and attention you want to give.", "today", "adaptive", ["energy", "depth", "comfort"], [
    { id: "ta_time_1", label: "Short and easy", deltas: { energy: 0.1, comfort: 0.24, depth: -0.18 } },
    { id: "ta_time_2", label: "A standard-length movie", deltas: { mood: 0.12 } },
    { id: "ta_time_3", label: "Long and immersive", deltas: { depth: 0.26, mood: 0.18 } },
    { id: "ta_time_4", label: "I'm good with a long one", deltas: { depth: 0.42, intensity: 0.14, comfort: -0.14 } },
  ]),
  q("ta_headspace", "What kind of movie would fit your headspace right now?", "Sometimes you want something calming, other times something intense.", "today", "adaptive", ["comfort", "depth", "intensity"], [
    { id: "ta_headspace_1", label: "Something soothing", deltas: { comfort: 0.42, intensity: -0.26, optimism: 0.12 } },
    { id: "ta_headspace_2", label: "Something engaging but not overwhelming", deltas: { mood: 0.18, depth: 0.08 } },
    { id: "ta_headspace_3", label: "Something reflective", deltas: { depth: 0.34, mood: 0.18 } },
    { id: "ta_headspace_4", label: "Something emotionally intense", deltas: { intensity: 0.4, depth: 0.2, comfort: -0.16 } },
  ]),
  q("ta_shift", "Do you want the movie to match your mood or shift it?", "Some movies meet your mood, others take you somewhere different.", "today", "adaptive", ["optimism", "darkness", "mood"], [
    { id: "ta_shift_1", label: "Lift my mood", deltas: { optimism: 0.42, darkness: -0.26, humor: 0.12 } },
    { id: "ta_shift_2", label: "Nudge it a little", deltas: { optimism: 0.24, comfort: 0.14 } },
    { id: "ta_shift_3", label: "Match where I am", deltas: { mood: 0.28 } },
    { id: "ta_shift_4", label: "Take me somewhere darker", deltas: { darkness: 0.44, optimism: -0.24, intensity: 0.1 } },
  ]),
  q("ta_sensory", "How visually bold should the movie feel?", "Some films are subtle, others are visually striking.", "today", "adaptive", ["intensity", "mood", "energy"], [
    { id: "ta_sensory_1", label: "Soft and understated", deltas: { intensity: -0.24, mood: 0.2, comfort: 0.16 } },
    { id: "ta_sensory_2", label: "Stylish but controlled", deltas: { mood: 0.2 } },
    { id: "ta_sensory_3", label: "Stylish and punchy", deltas: { intensity: 0.24, energy: 0.12, mood: 0.16 } },
    { id: "ta_sensory_4", label: "Big and immersive", deltas: { intensity: 0.44, energy: 0.18, comfort: -0.16 } },
  ]),
  q("ta_theme", "How much thematic depth are you up for right now?", "Are you in the mood for something simple or something deeper?", "today", "adaptive", ["depth", "comfort", "darkness"], [
    { id: "ta_theme_1", label: "Keep it simple", deltas: { comfort: 0.26, depth: -0.22 } },
    { id: "ta_theme_2", label: "A little depth is nice", deltas: { depth: 0.14, comfort: 0.12 } },
    { id: "ta_theme_3", label: "Something meaningful", deltas: { depth: 0.34, mood: 0.14 } },
    { id: "ta_theme_4", label: "Go deep and existential", deltas: { depth: 0.48, darkness: 0.16, comfort: -0.18 } },
  ]),
  q("ta_discovery", "How far outside your usual taste should this pick go?", "Should it stay close to what you normally watch or explore something new?", "today", "adaptive", ["novelty", "comfort"], [
    { id: "ta_discovery_1", label: "Stay close to what I know", deltas: { comfort: 0.42, novelty: -0.36 } },
    { id: "ta_discovery_2", label: "Try something nearby", deltas: { comfort: 0.16, novelty: 0.06 } },
    { id: "ta_discovery_3", label: "Take me somewhere new", deltas: { novelty: 0.32, comfort: -0.08 } },
    { id: "ta_discovery_4", label: "I have no idea - you decide", deltas: { novelty: 0.5, comfort: -0.22, intensity: 0.08 } },
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

// Core selection tries to cover the full trait space early so the adaptive phase can spend its
// smaller budget clarifying weak signals instead of discovering basic coverage gaps.
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

  // Adaptive follow-ups target traits that are still noisy: low confidence, ambiguous midpoint
  // values, or traits supported by too few answered questions so far.
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

  // Confidence is a heuristic signal-quality score, not a calibrated probability. The backend uses
  // it to tune blend weights and exploration pressure.
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

