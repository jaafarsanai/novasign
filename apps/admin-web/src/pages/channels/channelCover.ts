// admin-web/src/pages/channels/channelCover.ts

const LS_PREFIX = "novasign:channelCoverSeed:";

export function persistChannelCoverSeed(channelId: string, seed: string) {
  try {
    window.localStorage.setItem(`${LS_PREFIX}${channelId}`, seed);
  } catch {
    // ignore (private mode / disabled storage)
  }
}

export function getChannelCoverSeed(channelId: string) {
  try {
    return window.localStorage.getItem(`${LS_PREFIX}${channelId}`) || channelId;
  } catch {
    return channelId;
  }
}

function hashToInt(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

/** Stable gradient from any seed (channel id OR stored cover seed). */
export function coverFromSeed(seed: string) {
  const palette: Array<[string, string]> = [
    ["#f97316", "#ef4444"],
    ["#0ea5e9", "#6366f1"],
    ["#22c55e", "#14b8a6"],
    ["#a855f7", "#3b82f6"],
    ["#f59e0b", "#f97316"],
    ["#10b981", "#0ea5e9"],
    ["#ef4444", "#f43f5e"],
    ["#6366f1", "#a855f7"],
  ];
  const idx = hashToInt(seed) % palette.length;
  const [a, b] = palette[idx];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

