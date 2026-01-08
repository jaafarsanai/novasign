export type ChannelGradient = { from: string; to: string };

const GRADIENTS: ChannelGradient[] = [
  { from: "#7C3AED", to: "#3B82F6" }, // violet -> blue
  { from: "#F97316", to: "#EF4444" }, // orange -> red
  { from: "#06B6D4", to: "#3B82F6" }, // cyan -> blue
  { from: "#22C55E", to: "#16A34A" }, // green -> green (still possible, but not always)
  { from: "#EC4899", to: "#8B5CF6" }, // pink -> violet
  { from: "#F59E0B", to: "#F97316" }, // amber -> orange
];

function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function channelGradient(seed: string): ChannelGradient {
  const idx = hashString(seed || "default") % GRADIENTS.length;
  return GRADIENTS[idx];
}

export function gradientStyle(seed: string) {
  const g = channelGradient(seed);
  return { background: `linear-gradient(135deg, ${g.from}, ${g.to})` };
}

