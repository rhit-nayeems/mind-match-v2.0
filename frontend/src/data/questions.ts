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

export const DEFAULT_CORE_PER_GROUP = 4;
export const DEFAULT_ADAPTIVE_PER_GROUP = 4;

const PERSONALITY_WEIGHT = 0.62;
const TODAY_WEIGHT = 0.38;
const SCALE = 0.42;

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
  q("p_story", "What storytelling usually hooks you?", "personality", "core", ["depth", "energy", "humor"], [
    { id: "p_story_1", label: "Layered character studies", deltas: { depth: 0.44, mood: 0.14, intensity: 0.08 } },
    { id: "p_story_2", label: "Balanced and heartfelt", deltas: { depth: 0.2, comfort: 0.22, optimism: 0.08 } },
    { id: "p_story_3", label: "Straightforward fun", deltas: { humor: 0.3, energy: 0.2, depth: -0.2 } },
    { id: "p_story_4", label: "Pure spectacle", deltas: { energy: 0.36, intensity: 0.28, depth: -0.26 } },
  ]),
  q("p_risk", "How adventurous are your tastes long-term?", "personality", "core", ["novelty", "comfort"], [
    { id: "p_risk_1", label: "Mostly familiar", deltas: { comfort: 0.44, novelty: -0.38 } },
    { id: "p_risk_2", label: "A little experimentation", deltas: { comfort: 0.16, novelty: 0.1 } },
    { id: "p_risk_3", label: "Fresh angles often", deltas: { novelty: 0.34, mood: 0.08 } },
    { id: "p_risk_4", label: "Bold and unusual", deltas: { novelty: 0.5, intensity: 0.1, comfort: -0.28 } },
  ]),
  q("p_tone", "Which tonal lane sounds most like you?", "personality", "core", ["darkness", "optimism", "mood"], [
    { id: "p_tone_1", label: "Hopeful and warm", deltas: { optimism: 0.42, darkness: -0.32, comfort: 0.18 } },
    { id: "p_tone_2", label: "Balanced light/shadow", deltas: { mood: 0.24, depth: 0.1 } },
    { id: "p_tone_3", label: "Melancholic and moody", deltas: { darkness: 0.26, mood: 0.3, optimism: -0.12 } },
    { id: "p_tone_4", label: "Dark and heavy", deltas: { darkness: 0.5, intensity: 0.14, optimism: -0.32 } },
  ]),
  q("p_pace", "How do you feel about pacing?", "personality", "core", ["energy", "intensity", "depth"], [
    { id: "p_pace_1", label: "Slow burn", deltas: { depth: 0.26, mood: 0.2, energy: -0.2 } },
    { id: "p_pace_2", label: "Moderate with depth", deltas: { depth: 0.2, energy: 0.04 } },
    { id: "p_pace_3", label: "Fast and dynamic", deltas: { energy: 0.3, intensity: 0.16, depth: -0.12 } },
    { id: "p_pace_4", label: "Relentless high-stakes", deltas: { intensity: 0.42, energy: 0.24, comfort: -0.16 } },
  ]),
  q("p_humor", "How important is humor in your mix?", "personality", "core", ["humor", "optimism", "darkness"], [
    { id: "p_humor_1", label: "Not essential", deltas: { humor: -0.2, depth: 0.18, darkness: 0.12 } },
    { id: "p_humor_2", label: "A touch is good", deltas: { humor: 0.14, mood: 0.08 } },
    { id: "p_humor_3", label: "Often needed", deltas: { humor: 0.34, optimism: 0.18, darkness: -0.1 } },
    { id: "p_humor_4", label: "Make me laugh hard", deltas: { humor: 0.5, optimism: 0.2, depth: -0.16 } },
  ]),
  q("p_ambiguity", "Do you enjoy morally complex characters?", "personality", "core", ["depth", "darkness", "comfort"], [
    { id: "p_ambiguity_1", label: "Prefer clear heroes", deltas: { comfort: 0.3, depth: -0.2, darkness: -0.16 } },
    { id: "p_ambiguity_2", label: "Some gray area", deltas: { depth: 0.14, mood: 0.1 } },
    { id: "p_ambiguity_3", label: "Complexity is a plus", deltas: { depth: 0.34, darkness: 0.16 } },
    { id: "p_ambiguity_4", label: "Ambiguity is essential", deltas: { depth: 0.48, darkness: 0.2, comfort: -0.18 } },
  ]),
];
const TODAY_CORE_POOL: Question[] = [
  q("t_energy", "What is your energy level for tonight's movie?", "today", "core", ["energy", "intensity", "comfort"], [
    { id: "t_energy_1", label: "Low, I need calm", deltas: { energy: -0.32, comfort: 0.34, intensity: -0.2 } },
    { id: "t_energy_2", label: "Steady and relaxed", deltas: { energy: -0.1, comfort: 0.2, mood: 0.1 } },
    { id: "t_energy_3", label: "Engaged and alert", deltas: { energy: 0.22, intensity: 0.1 } },
    { id: "t_energy_4", label: "Amped up", deltas: { energy: 0.42, intensity: 0.2, comfort: -0.14 } },
  ]),
  q("t_emotion", "How heavy can the emotional tone be right now?", "today", "core", ["intensity", "comfort", "depth"], [
    { id: "t_emotion_1", label: "Keep it light", deltas: { comfort: 0.36, humor: 0.2, intensity: -0.22 } },
    { id: "t_emotion_2", label: "Some emotion is fine", deltas: { mood: 0.2, comfort: 0.1 } },
    { id: "t_emotion_3", label: "I can handle heavy themes", deltas: { depth: 0.24, intensity: 0.24 } },
    { id: "t_emotion_4", label: "I want intense", deltas: { intensity: 0.46, darkness: 0.12, comfort: -0.18 } },
  ]),
  q("t_attention", "How much concentration do you want to spend?", "today", "core", ["depth", "comfort"], [
    { id: "t_attention_1", label: "Minimal effort", deltas: { comfort: 0.34, depth: -0.28, humor: 0.14 } },
    { id: "t_attention_2", label: "Light focus", deltas: { depth: -0.06, comfort: 0.16 } },
    { id: "t_attention_3", label: "Moderate focus", deltas: { depth: 0.2, mood: 0.08 } },
    { id: "t_attention_4", label: "High focus is okay", deltas: { depth: 0.44, intensity: 0.1, comfort: -0.16 } },
  ]),
  q("t_outlook", "Which emotional direction sounds best tonight?", "today", "core", ["optimism", "darkness", "mood"], [
    { id: "t_outlook_1", label: "Uplifting and hopeful", deltas: { optimism: 0.44, darkness: -0.34, comfort: 0.14 } },
    { id: "t_outlook_2", label: "Balanced", deltas: { mood: 0.18 } },
    { id: "t_outlook_3", label: "Moody and reflective", deltas: { darkness: 0.18, mood: 0.26 } },
    { id: "t_outlook_4", label: "Dark and edgy", deltas: { darkness: 0.44, intensity: 0.16, optimism: -0.22 } },
  ]),
  q("t_comfort", "Do you want familiarity or discovery right now?", "today", "core", ["comfort", "novelty"], [
    { id: "t_comfort_1", label: "Very familiar", deltas: { comfort: 0.46, novelty: -0.4 } },
    { id: "t_comfort_2", label: "Mostly familiar", deltas: { comfort: 0.24, novelty: -0.12 } },
    { id: "t_comfort_3", label: "Some novelty", deltas: { novelty: 0.2, comfort: 0.06 } },
    { id: "t_comfort_4", label: "Surprise me", deltas: { novelty: 0.46, comfort: -0.2, intensity: 0.08 } },
  ]),
  q("t_pacing", "What pacing feels best tonight?", "today", "core", ["energy", "intensity", "depth"], [
    { id: "t_pacing_1", label: "Slow and atmospheric", deltas: { mood: 0.24, depth: 0.16, energy: -0.18 } },
    { id: "t_pacing_2", label: "Even and steady", deltas: { comfort: 0.14, mood: 0.12 } },
    { id: "t_pacing_3", label: "Fast-moving", deltas: { energy: 0.28, intensity: 0.14 } },
    { id: "t_pacing_4", label: "Maximum adrenaline", deltas: { intensity: 0.44, energy: 0.24, depth: -0.2 } },
  ]),
];

const PERSONALITY_ADAPTIVE_POOL: Question[] = [
  q("pa_endings", "Which ending style usually satisfies you most?", "personality", "adaptive", ["optimism", "darkness", "comfort"], [
    { id: "pa_endings_1", label: "Clear, uplifting closure", deltas: { optimism: 0.42, comfort: 0.24, darkness: -0.22 } },
    { id: "pa_endings_2", label: "Bittersweet", deltas: { mood: 0.24, depth: 0.14 } },
    { id: "pa_endings_3", label: "Open-ended", deltas: { depth: 0.34, novelty: 0.12, comfort: -0.12 } },
    { id: "pa_endings_4", label: "Dark and unsettling", deltas: { darkness: 0.46, intensity: 0.14, optimism: -0.3 } },
  ]),
  q("pa_dialogue", "What kind of dialogue draws you in?", "personality", "adaptive", ["depth", "humor", "mood"], [
    { id: "pa_dialogue_1", label: "Sharp and witty", deltas: { humor: 0.34, optimism: 0.12, depth: 0.1 } },
    { id: "pa_dialogue_2", label: "Natural and grounded", deltas: { mood: 0.26, depth: 0.16 } },
    { id: "pa_dialogue_3", label: "Poetic and introspective", deltas: { depth: 0.4, mood: 0.2 } },
    { id: "pa_dialogue_4", label: "Minimal, visual-first", deltas: { mood: 0.22, novelty: 0.2, humor: -0.1 } },
  ]),
  q("pa_world", "How much world-building do you enjoy?", "personality", "adaptive", ["novelty", "depth", "comfort"], [
    { id: "pa_world_1", label: "Keep it realistic", deltas: { comfort: 0.24, novelty: -0.24, depth: 0.1 } },
    { id: "pa_world_2", label: "A few imaginative elements", deltas: { novelty: 0.14, mood: 0.1 } },
    { id: "pa_world_3", label: "Rich fictional worlds", deltas: { novelty: 0.34, depth: 0.18 } },
    { id: "pa_world_4", label: "Strange and concept-heavy", deltas: { novelty: 0.5, depth: 0.22, comfort: -0.2 } },
  ]),
  q("pa_tension", "What level of tension do you prefer?", "personality", "adaptive", ["intensity", "darkness", "comfort"], [
    { id: "pa_tension_1", label: "Very low", deltas: { comfort: 0.34, intensity: -0.3, darkness: -0.14 } },
    { id: "pa_tension_2", label: "Mild suspense", deltas: { intensity: 0.1, mood: 0.12 } },
    { id: "pa_tension_3", label: "Strong suspense", deltas: { intensity: 0.32, darkness: 0.16 } },
    { id: "pa_tension_4", label: "Edge-of-seat", deltas: { intensity: 0.48, darkness: 0.24, comfort: -0.2 } },
  ]),
  q("pa_visual", "Which visual approach attracts you most?", "personality", "adaptive", ["mood", "novelty", "intensity"], [
    { id: "pa_visual_1", label: "Natural and unobtrusive", deltas: { comfort: 0.2, novelty: -0.16, mood: 0.16 } },
    { id: "pa_visual_2", label: "Elegant and cinematic", deltas: { mood: 0.3, depth: 0.1 } },
    { id: "pa_visual_3", label: "Kinetic and stylish", deltas: { mood: 0.24, intensity: 0.24, energy: 0.14 } },
    { id: "pa_visual_4", label: "Experimental", deltas: { novelty: 0.46, mood: 0.22, comfort: -0.12 } },
  ]),
  q("pa_sentiment", "How sentimental are your movie preferences?", "personality", "adaptive", ["comfort", "optimism", "depth"], [
    { id: "pa_sentiment_1", label: "Not sentimental", deltas: { depth: 0.2, comfort: -0.16, optimism: -0.08 } },
    { id: "pa_sentiment_2", label: "A little", deltas: { comfort: 0.12, mood: 0.1 } },
    { id: "pa_sentiment_3", label: "Quite sentimental", deltas: { comfort: 0.3, optimism: 0.16 } },
    { id: "pa_sentiment_4", label: "Very sentimental", deltas: { comfort: 0.44, optimism: 0.22, depth: -0.12 } },
  ]),
];
const TODAY_ADAPTIVE_POOL: Question[] = [
  q("ta_time", "How much time do you want to invest tonight?", "today", "adaptive", ["energy", "depth", "comfort"], [
    { id: "ta_time_1", label: "Short and easy", deltas: { energy: 0.1, comfort: 0.24, depth: -0.18 } },
    { id: "ta_time_2", label: "Standard length", deltas: { mood: 0.12 } },
    { id: "ta_time_3", label: "Long and immersive", deltas: { depth: 0.26, mood: 0.18 } },
    { id: "ta_time_4", label: "Epic commitment", deltas: { depth: 0.42, intensity: 0.14, comfort: -0.14 } },
  ]),
  q("ta_headspace", "What does your headspace need right now?", "today", "adaptive", ["comfort", "depth", "intensity"], [
    { id: "ta_headspace_1", label: "Relief and softness", deltas: { comfort: 0.42, intensity: -0.26, optimism: 0.12 } },
    { id: "ta_headspace_2", label: "Steady engagement", deltas: { mood: 0.18, depth: 0.08 } },
    { id: "ta_headspace_3", label: "Introspection", deltas: { depth: 0.34, mood: 0.18 } },
    { id: "ta_headspace_4", label: "Emotional release", deltas: { intensity: 0.4, depth: 0.2, comfort: -0.16 } },
  ]),
  q("ta_shift", "Should this movie change your mood or match it?", "today", "adaptive", ["optimism", "darkness", "mood"], [
    { id: "ta_shift_1", label: "Lift me up", deltas: { optimism: 0.42, darkness: -0.26, humor: 0.12 } },
    { id: "ta_shift_2", label: "Gently improve it", deltas: { optimism: 0.24, comfort: 0.14 } },
    { id: "ta_shift_3", label: "Match my vibe", deltas: { mood: 0.28 } },
    { id: "ta_shift_4", label: "Lean into darkness", deltas: { darkness: 0.44, optimism: -0.24, intensity: 0.1 } },
  ]),
  q("ta_sensory", "How sensory-intense should it feel tonight?", "today", "adaptive", ["intensity", "mood", "energy"], [
    { id: "ta_sensory_1", label: "Soft and subtle", deltas: { intensity: -0.24, mood: 0.2, comfort: 0.16 } },
    { id: "ta_sensory_2", label: "Moderate style", deltas: { mood: 0.2 } },
    { id: "ta_sensory_3", label: "Stylish and punchy", deltas: { intensity: 0.24, energy: 0.12, mood: 0.16 } },
    { id: "ta_sensory_4", label: "Overwhelmingly cinematic", deltas: { intensity: 0.44, energy: 0.18, comfort: -0.16 } },
  ]),
  q("ta_theme", "How complex should themes be tonight?", "today", "adaptive", ["depth", "comfort", "darkness"], [
    { id: "ta_theme_1", label: "Keep themes simple", deltas: { comfort: 0.26, depth: -0.22 } },
    { id: "ta_theme_2", label: "Some depth", deltas: { depth: 0.14, comfort: 0.12 } },
    { id: "ta_theme_3", label: "Substantial themes", deltas: { depth: 0.34, mood: 0.14 } },
    { id: "ta_theme_4", label: "Existential/heavy", deltas: { depth: 0.48, darkness: 0.16, comfort: -0.18 } },
  ]),
  q("ta_discovery", "How much novelty do you want tonight specifically?", "today", "adaptive", ["novelty", "comfort"], [
    { id: "ta_discovery_1", label: "Almost none", deltas: { comfort: 0.42, novelty: -0.36 } },
    { id: "ta_discovery_2", label: "A little", deltas: { comfort: 0.16, novelty: 0.06 } },
    { id: "ta_discovery_3", label: "Quite a bit", deltas: { novelty: 0.32, comfort: -0.08 } },
    { id: "ta_discovery_4", label: "Maximum novelty", deltas: { novelty: 0.5, comfort: -0.22, intensity: 0.08 } },
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

function selectCoreQuestions(pool: Question[], count: number): Question[] {
  const available = shuffle(pool);
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

      const score = newCoverage * 2.6 + coverage.length * 0.2 + Math.random() * 0.12;
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

export function buildCoreQuizQuestions(options?: { personalityCount?: number; todayCount?: number }): Question[] {
  const personalityCount = Math.max(2, Math.min(PERSONALITY_CORE_POOL.length, options?.personalityCount ?? DEFAULT_CORE_PER_GROUP));
  const todayCount = Math.max(2, Math.min(TODAY_CORE_POOL.length, options?.todayCount ?? DEFAULT_CORE_PER_GROUP));

  const personality = selectCoreQuestions(PERSONALITY_CORE_POOL, personalityCount);
  const today = selectCoreQuestions(TODAY_CORE_POOL, todayCount);

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
      const score = 0.72 * need + 0.25 * novelty + Math.random() * 0.03;

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
  options?: { personalityCount?: number; todayCount?: number }
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

  const askedIds = new Set(asked.map((q) => q.id));
  const personality = selectAdaptiveQuestions(PERSONALITY_ADAPTIVE_POOL, personalityCount, traitNeed, askedIds);
  const today = selectAdaptiveQuestions(TODAY_ADAPTIVE_POOL, todayCount, traitNeed, askedIds);

  return [...personality, ...today];
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

  const traitSupportTotal = traitCoverageCounts(questions);
  const perTrait = makeTraitVector(0.5);
  for (const k of TRAIT_KEYS) {
    const supportTotal = Math.max(1, traitSupportTotal[k]);
    const supportRatio = clamp01(supportAnswered[k] / supportTotal);
    perTrait[k] = clamp01(0.18 + 0.42 * overallRatio + 0.4 * supportRatio);
  }

  return {
    blended,
    blendedArray: TRAIT_KEYS.map((k) => blended[k]),
    personality,
    mood,
    confidence: {
      overall: overallRatio,
      personality: personalityRatio,
      mood: moodRatio,
      per_trait: perTrait,
    },
  };
}

export function answersToTraitVector(responses: Responses, questionSet?: Question[]): number[] {
  return answersToTraitContext(responses, questionSet).blendedArray;
}

