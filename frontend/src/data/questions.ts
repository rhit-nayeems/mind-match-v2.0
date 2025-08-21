// frontend/src/data/questions.ts
export const TRAIT_KEYS = [
  "darkness", "energy", "mood", "depth", "optimism",
  "novelty", "comfort", "intensity", "humor"
] as const;
export type TraitKey = typeof TRAIT_KEYS[number];

export type Choice = { id: string; label: string; group: "personality" | "today" };
export type Question = { id: string; text: string; choices: Choice[] };

// 16 QUESTIONS (8 personality + 8 today)
// Removed: "Do you like romance in stories?" and "Do you enjoy thrill-seeking or fast-paced action?"
export const QUESTIONS: Question[] = [
  // Personality (8)
  { id: "q1", text: "Do you enjoy deep conversations or light banter?", choices: [
    { id: "deep",  label: "Deep",  group: "personality" },
    { id: "light", label: "Light", group: "personality" },
  ]},
  { id: "q2", text: "Do you prefer routine or spontaneity?", choices: [
    { id: "routine",     label: "Routine",     group: "personality" },
    { id: "spontaneity", label: "Spontaneity", group: "personality" },
  ]},
  { id: "q3", text: "Are you more of a realist or a dreamer?", choices: [
    { id: "realist", label: "Realist", group: "personality" },
    { id: "dreamer", label: "Dreamer", group: "personality" },
  ]},
  { id: "q4", text: "Do you like solving puzzles?", choices: [
    { id: "puzzles_yes", label: "Yes", group: "personality" },
    { id: "puzzles_no",  label: "No",  group: "personality" },
  ]},
  { id: "q5", text: "Do you enjoy nostalgic stories?", choices: [
    { id: "nostalgia_yes", label: "Yes", group: "personality" },
    { id: "nostalgia_no",  label: "No",  group: "personality" },
  ]},
  { id: "q7", text: "Are you fascinated by darker themes or dystopias?", choices: [
    { id: "dark_yes", label: "Yes", group: "personality" },
    { id: "dark_no",  label: "No",  group: "personality" },
  ]},
  { id: "q8", text: "Do you find it hard to stay emotionally detached during movies?", choices: [
    { id: "detach_yes", label: "Yes", group: "personality" },
    { id: "detach_no",  label: "No",  group: "personality" },
  ]},
  { id: "q10", text: "Do you enjoy morally ambiguous or complex characters?", choices: [
    { id: "ambiguity_yes", label: "Yes", group: "personality" },
    { id: "ambiguity_no",  label: "No",  group: "personality" },
  ]},

  // Today (8)
  { id: "t1", text: "Today, are you in the mood for something calm or high-energy?", choices: [
    { id: "today_calm",  label: "Calm",        group: "today" },
    { id: "today_high",  label: "High-energy", group: "today" },
  ]},
  { id: "t2", text: "Today, do you feel like something light-hearted or serious?", choices: [
    { id: "today_light",   label: "Light-hearted", group: "today" },
    { id: "today_serious", label: "Serious",       group: "today" },
  ]},
  { id: "t3", text: "Tonight, do you want something familiar or something new?", choices: [
    { id: "today_familiar", label: "Familiar / Comforting", group: "today" },
    { id: "today_new",      label: "New / Surprising",      group: "today" },
  ]},
  { id: "t4", text: "How’s your outlook today?", choices: [
    { id: "today_hopeful", label: "Hopeful",    group: "today" },
    { id: "today_bleak",   label: "Dark/Bleak", group: "today" },
  ]},
  { id: "t5", text: "How much mental bandwidth do you have tonight?", choices: [
    { id: "today_complex", label: "I can handle complex plots", group: "today" },
    { id: "today_simple",  label: "Keep it simple",             group: "today" },
  ]},
  { id: "t6", text: "Do you want something emotionally heavy or gentle?", choices: [
    { id: "today_heavy",  label: "Heavy / Cathartic", group: "today" },
    { id: "today_gentle", label: "Gentle / Soothing", group: "today" },
  ]},
  { id: "t7", text: "Pacing tonight?", choices: [
    { id: "today_slow", label: "Slow-burn", group: "today" },
    { id: "today_fast", label: "Quick hits", group: "today" },
  ]},
  { id: "t8", text: "Do you want escapism or something thought-provoking?", choices: [
    { id: "today_escape", label: "Escapism / Cozy",    group: "today" },
    { id: "today_think",  label: "Thought-provoking",  group: "today" },
  ]},
];

type Weights = Partial<Record<TraitKey, number>>;
const W: Record<string, Weights> = {
  // personality
  deep: { depth: +0.6, humor: -0.2 },
  light: { depth: -0.2, humor: +0.6 },
  routine: { novelty: -0.5, comfort: +0.4 },
  spontaneity: { novelty: +0.5, energy: +0.3 },
  realist: { optimism: -0.3, depth: +0.2 },
  dreamer: { optimism: +0.4, mood: +0.2 },
  puzzles_yes: { depth: +0.4, intensity: +0.2 },
  puzzles_no: { depth: -0.1 },
  nostalgia_yes: { comfort: +0.5, mood: +0.2 },
  nostalgia_no: { comfort: -0.2, novelty: +0.2 },
  dark_yes: { darkness: +0.6, depth: +0.2, comfort: -0.2 },
  dark_no: { darkness: -0.4, comfort: +0.2 },
  detach_yes: { intensity: +0.4, depth: +0.2 },
  detach_no: { intensity: -0.2 },
  ambiguity_yes: { depth: +0.4, darkness: +0.2, comfort: -0.2 },
  ambiguity_no: { depth: -0.2, darkness: -0.2, comfort: +0.2 },

  // today
  today_calm: { energy: -0.4, comfort: +0.3 },
  today_high: { energy: +0.6, intensity: +0.2 },
  today_light: { humor: +0.5, darkness: -0.2 },
  today_serious: { depth: +0.4, darkness: +0.3 },
  today_familiar: { comfort: +0.5, novelty: -0.4 },
  today_new: { novelty: +0.6, comfort: -0.2 },
  today_hopeful: { optimism: +0.6, darkness: -0.2 },
  today_bleak: { darkness: +0.5, optimism: -0.2 },
  today_complex: { depth: +0.5, intensity: +0.1, comfort: -0.2 },
  today_simple: { comfort: +0.4, depth: -0.3 },
  today_heavy: { depth: +0.5, darkness: +0.3, comfort: -0.3 },
  today_gentle: { comfort: +0.5, humor: +0.2, darkness: -0.3 },
  today_slow: { depth: +0.3, intensity: -0.3, energy: -0.2 },
  today_fast: { energy: +0.4, intensity: +0.3, depth: -0.2 },
  today_escape: { comfort: +0.5, humor: +0.2, depth: -0.3, novelty: -0.2 },
  today_think: { depth: +0.5, novelty: +0.2, comfort: -0.2 },
};

export type Responses = Record<string, string>;

const PERSONALITY_WEIGHT = 0.6;
const TODAY_WEIGHT = 0.4;
const SCALE = 0.5;

export function answersToTraitVector(responses: Responses): number[] {
  const init = Object.fromEntries(TRAIT_KEYS.map(k => [k, 0])) as Record<TraitKey, number>;
  const accPers = { ...init };
  const accToday = { ...init };

  let nPers = 0, nToday = 0;

  for (const q of QUESTIONS) {
    const cid = responses[q.id];
    if (!cid) continue;
    const w = W[cid] || {};
    const isToday = q.choices.find(c => c.id === cid)?.group === "today";
    if (isToday) nToday++; else nPers++;
    const bucket = isToday ? accToday : accPers;
    (Object.keys(w) as TraitKey[]).forEach(k => { bucket[k] += w[k]!; });
  }

  const avg = (x: number, n: number) => (n ? x / n : 0);
  return TRAIT_KEYS.map(k => {
    const signed = PERSONALITY_WEIGHT * avg(accPers[k], nPers) + TODAY_WEIGHT * avg(accToday[k], nToday);
    const v = 0.5 + SCALE * signed;
    return Math.max(0, Math.min(1, v));
  });
}
