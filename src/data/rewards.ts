/**
 * ZenPlant - Traditional Japanese Tokonoma Accoutrements & Gallery Reward System
 * 
 * Accoutrements schema and catalog grounded in Nippon Bonsai Association standards:
 * - Tenpai (添配) Bronze Figurines
 * - Koro (香炉) Incense Burners with rising procedural smoke
 * - Suiseki (水石) Scholar Viewing Stones on hand-carved Daiza
 * - Shitakusa (下草) Accent Plants & Kokedama moss balls
 * - Kakejiku (掛軸) Hanging Scrolls (Enso, Sansui, Meigetsu)
 * - Ishidoro (石灯籠) Miniature Stone Lanterns with inner flame glow
 */

import type { PlantState } from "../sim/types";
import type { BonsaiSchoolReport } from "../sim/bonsaiSchools";

export type TokonomaCategory = "tenpai" | "koro" | "suiseki" | "shitakusa" | "kakejiku" | "ishidoro";
export type SeasonAffinity = "spring" | "summer" | "autumn" | "winter" | "all-season";
export type FormalityGrade = "shin" | "gyo" | "so";
export type ItemRarity = "common" | "fine" | "rare" | "masterpiece" | "national-treasure";

export interface TokonomaAccoutrement {
  id: string;
  name: string;
  kanji: string;
  category: TokonomaCategory;
  rarity: ItemRarity;
  formality: FormalityGrade;
  season: SeasonAffinity;
  scaleRatio: number; // Scale relative to bonsai height
  visualFlowBias: "left" | "right" | "neutral";
  aestheticScoreBonus: number;
  renderProps: {
    primaryColor: string;
    secondaryColor?: string;
    accentColor?: string;
    hasParticleEffect?: boolean;
    particleType?: "smoke" | "glow";
  };
  description: string;
  unlockCondition: string;
  checkUnlocked: (state: PlantState, report?: BonsaiSchoolReport) => boolean;
}

export const TOKONOMA_REWARD_CATALOG: TokonomaAccoutrement[] = [
  // --- KAKEJIKU HANGING SCROLLS ---
  {
    id: "kakejiku_mountain_sansui",
    name: "Distant Mountain Mist (Sansui)",
    kanji: "山水幽玄掛軸",
    category: "kakejiku",
    rarity: "fine",
    formality: "gyo",
    season: "autumn",
    scaleRatio: 0.75,
    visualFlowBias: "right",
    aestheticScoreBonus: 10,
    renderProps: {
      primaryColor: "#e6e0d4",
      secondaryColor: "#52525b",
    },
    description: "Gestaffelte Bergkämme, die im Morgennebel verblassen. Bringt zeitlose Tiefe und Ruhe in den Tokonoma-Raum.",
    unlockCondition: "Kultiviere einen Baum im Shakan-Stil (Geneigter Stamm) oder beginne deine Bonsai-Reise.",
    checkUnlocked: (state, report) => {
      if (!report) return true; // Starter scroll
      return report.scores.shakan.score >= 50 || (state.unlockedRewards?.includes("kakejiku_mountain_sansui") ?? true);
    },
  },
  {
    id: "kakejiku_zen_enso",
    name: "Zen Void Circle (Enso)",
    kanji: "円相掛軸",
    category: "kakejiku",
    rarity: "rare",
    formality: "so",
    season: "all-season",
    scaleRatio: 0.70,
    visualFlowBias: "neutral",
    aestheticScoreBonus: 15,
    renderProps: {
      primaryColor: "#faf8f5",
      secondaryColor: "#18181b",
    },
    description: "Ein in einem einzigen Pinselstrich vollendeter Kreis des Meisters. Symbolisiert Leerheit, Erleuchtung und den Kreislauf allen Seins.",
    unlockCondition: "Schnitze mindestens 2 Totholz-Partien (Jin & Shari) oder erreiche Jin-Shari Score ≥ 60.",
    checkUnlocked: (state, report) => {
      const jinNodes = state.nodes.filter((n) => n.isJin);
      if (jinNodes.length >= 2) return true;
      if (report && report.scores["jin-shari"].score >= 60) return true;
      return false;
    },
  },
  {
    id: "kakejiku_harvest_moon",
    name: "Autumn Full Moon (Meigetsu)",
    kanji: "秋月掛軸",
    category: "kakejiku",
    rarity: "masterpiece",
    formality: "gyo",
    season: "autumn",
    scaleRatio: 0.72,
    visualFlowBias: "left",
    aestheticScoreBonus: 20,
    renderProps: {
      primaryColor: "#0f172a",
      secondaryColor: "#fef08a",
    },
    description: "Ein leuchtender Vollmond aus Blattgold vor tiefblauem Nachthimmel. Weckt die heitere Stille des Tsukimi-Festes.",
    unlockCondition: "Erreiche die Schule Fukinagashi (Windgepeitscht) mit Score ≥ 65.",
    checkUnlocked: (_state, report) => {
      return Boolean(report && report.scores.fukinagashi.score >= 65);
    },
  },

  // --- TENPAI FIGURINES ---
  {
    id: "tenpai_bronze_fisherman",
    name: "Solitary River Fisherman",
    kanji: "釣人銅添配",
    category: "tenpai",
    rarity: "fine",
    formality: "so",
    season: "summer",
    scaleRatio: 0.12,
    visualFlowBias: "left",
    aestheticScoreBonus: 8,
    renderProps: {
      primaryColor: "#4d5b53",
      secondaryColor: "#b45309",
    },
    description: "Handgegossene patinierte Bronze eines Anglers mit zarter Bambusrute. Beschwört die Einsamkeit eines stillen Gebirgsflusses herauf.",
    unlockCondition: "Erreiche den Han-Kengai (Halbkaskade) Stil mit Score ≥ 65.",
    checkUnlocked: (_state, report) => {
      return Boolean(report && report.scores["han-kengai"].score >= 65);
    },
  },
  {
    id: "tenpai_bronze_crane",
    name: "Auspicious Tancho Crane",
    kanji: "丹頂鶴添配",
    category: "tenpai",
    rarity: "rare",
    formality: "shin",
    season: "winter",
    scaleRatio: 0.14,
    visualFlowBias: "neutral",
    aestheticScoreBonus: 14,
    renderProps: {
      primaryColor: "#f4f4f5",
      secondaryColor: "#dc2626",
    },
    description: "Patinierter Mandschurenkranich aus Bronze; Symbol für Langlebigkeit, Treue und anmutige Erhabenheit.",
    unlockCondition: "Meisterklasse: Erziele einen Chokkan- oder Moyogi-Score von ≥ 85 Punkten.",
    checkUnlocked: (_state, report) => {
      if (!report) return false;
      return report.scores.chokkan.score >= 85 || report.scores.moyogi.score >= 85;
    },
  },

  // --- KORO INCENSE BURNERS ---
  {
    id: "koro_celadon_tripod",
    name: "Celadon Tri-Footed Incense Burner",
    kanji: "青磁三足香炉",
    category: "koro",
    rarity: "rare",
    formality: "shin",
    season: "all-season",
    scaleRatio: 0.18,
    visualFlowBias: "neutral",
    aestheticScoreBonus: 15,
    renderProps: {
      primaryColor: "#a7f3d0",
      secondaryColor: "#065f46",
      accentColor: "#fef08a",
      hasParticleEffect: true,
      particleType: "smoke",
    },
    description: "Blassgrünes Seladon-Räuchergefäß auf drei Füßen. Sendet einen sanft aufsteigenden Faden aus Agarholz-Rauch aus.",
    unlockCondition: "Erziele in einer beliebigen klassischen Schule einen Reifegrad von Adept (Score ≥ 70).",
    checkUnlocked: (_state, report) => {
      return Boolean(report && report.dominantScore >= 70);
    },
  },

  // --- SUISEKI VIEWING STONES ---
  {
    id: "suiseki_kamogawa_toyama",
    name: "Kamogawa Distant Mountain Stone",
    kanji: "鴨川遠山石",
    category: "suiseki",
    rarity: "masterpiece",
    formality: "gyo",
    season: "all-season",
    scaleRatio: 0.26,
    visualFlowBias: "right",
    aestheticScoreBonus: 18,
    renderProps: {
      primaryColor: "#27272a",
      secondaryColor: "#78350f", // Kurotan hand-carved Daiza base
    },
    description: "Vom Flusswasser polierter Basaltstein des Kamo-Flusses auf passgenauem Palisander-Daiza. Stellt eine ferne Gebirgskette dar.",
    unlockCondition: "Kultiviere einen literarischen Bunjingi-Baum mit Score ≥ 65.",
    checkUnlocked: (_state, report) => {
      return Boolean(report && report.scores.bunjingi.score >= 65);
    },
  },
  {
    id: "suiseki_furuya_waterfall",
    name: "Furuya Waterfall Stone",
    kanji: "古谷滝石",
    category: "suiseki",
    rarity: "national-treasure",
    formality: "shin",
    season: "summer",
    scaleRatio: 0.28,
    visualFlowBias: "left",
    aestheticScoreBonus: 25,
    renderProps: {
      primaryColor: "#18181b",
      secondaryColor: "#f8fafc", // White cascading quartz vein
      accentColor: "#78350f",
    },
    description: "Seltener Furuya-Stein mit senkrechter schneeweißer Quarzader, die wie ein tosender Wasserfall über schwarzen Fels stürzt.",
    unlockCondition: "Kultiviere eine vollendete Vollkaskade (Kengai) mit Score ≥ 65.",
    checkUnlocked: (_state, report) => {
      return Boolean(report && report.scores.kengai.score >= 65);
    },
  },

  // --- SHITAKUSA ACCENT PLANTS ---
  {
    id: "shitakusa_kokedama_mossball",
    name: "Velvet Moss Sphere (Kokedama)",
    kanji: "深緑苔玉",
    category: "shitakusa",
    rarity: "common",
    formality: "so",
    season: "all-season",
    scaleRatio: 0.16,
    visualFlowBias: "neutral",
    aestheticScoreBonus: 6,
    renderProps: {
      primaryColor: "#15803d",
      secondaryColor: "#3f6212",
      accentColor: "#78350f",
    },
    description: "Mooskugel auf geschwärztem Zedernholzbrettchen. Verströmt feuchte, erdige Frische im Raum.",
    unlockCondition: "Starter-Begleitpflanze oder Pflege mit Moospolstern.",
    checkUnlocked: () => true, // Starter accent
  },
  {
    id: "shitakusa_wild_violet_fern",
    name: "Alpine Fern & Wild Violet",
    kanji: "羊歯・野菫下草",
    category: "shitakusa",
    rarity: "fine",
    formality: "so",
    season: "spring",
    scaleRatio: 0.20,
    visualFlowBias: "right",
    aestheticScoreBonus: 10,
    renderProps: {
      primaryColor: "#166534",
      secondaryColor: "#8b5cf6",
      accentColor: "#52525b",
    },
    description: "Zarte Frauenhaarfarn-Wedel vereint mit violetten Alpenveilchen in einer schlichten Schale aus Nanban-Ton.",
    unlockCondition: "Bringe deinen Bonsai zur Blütezeit (mindestens 1 Blüte am Baum).",
    checkUnlocked: (state) => {
      const flowers = state.nodes.filter((n) => n.type === "flower" && !n.isCut);
      return flowers.length >= 1;
    },
  },

  // --- STONE LANTERNS ---
  {
    id: "ishidoro_yukimi_lantern",
    name: "Yukimi Snow-Viewing Lantern",
    kanji: "雪見石灯籠",
    category: "ishidoro",
    rarity: "rare",
    formality: "gyo",
    season: "winter",
    scaleRatio: 0.24,
    visualFlowBias: "neutral",
    aestheticScoreBonus: 16,
    renderProps: {
      primaryColor: "#71717a",
      secondaryColor: "#fef3c7", // Warm flickering flame light
      accentColor: "#52525b",
      hasParticleEffect: true,
      particleType: "glow",
    },
    description: "Aus Granit gemeißelte Schneebetrachtungs-Laterne mit breitem Schirmdach und Dreibeinfüßen, in der eine warme Flamme brennt.",
    unlockCondition: "Pflege deinen Baum durch die winterliche Kälteperiode (Schritt 180+ im Zyklus).",
    checkUnlocked: (state) => {
      const season = state.step % (state.cycleLength || 250);
      return season >= 180;
    },
  },
];

export const DEFAULT_UNLOCKED_REWARDS = [
  "kakejiku_mountain_sansui",
  "shitakusa_kokedama_mossball",
];

const STORAGE_KEY_UNLOCKED = "zenplant_unlocked_rewards_v1";
const STORAGE_KEY_ACTIVE = "zenplant_active_accoutrements_v1";

export function loadRewardsFromStorage(): {
  unlockedIds: string[];
  active: { scrollId?: string; accentId?: string };
} {
  try {
    const rawUnlocked = localStorage.getItem(STORAGE_KEY_UNLOCKED);
    const rawActive = localStorage.getItem(STORAGE_KEY_ACTIVE);

    const unlockedIds: string[] = rawUnlocked ? JSON.parse(rawUnlocked) : [...DEFAULT_UNLOCKED_REWARDS];
    // Ensure defaults are present
    for (const d of DEFAULT_UNLOCKED_REWARDS) {
      if (!unlockedIds.includes(d)) unlockedIds.push(d);
    }

    const active = rawActive
      ? JSON.parse(rawActive)
      : { scrollId: "kakejiku_mountain_sansui", accentId: "shitakusa_kokedama_mossball" };

    return { unlockedIds, active };
  } catch {
    return {
      unlockedIds: [...DEFAULT_UNLOCKED_REWARDS],
      active: { scrollId: "kakejiku_mountain_sansui", accentId: "shitakusa_kokedama_mossball" },
    };
  }
}

export function saveRewardsToStorage(
  unlockedIds: string[],
  active: { scrollId?: string; accentId?: string }
): void {
  try {
    localStorage.setItem(STORAGE_KEY_UNLOCKED, JSON.stringify(unlockedIds));
    localStorage.setItem(STORAGE_KEY_ACTIVE, JSON.stringify(active));
  } catch {
    // Storage access might be restricted in some environments
  }
}

/**
 * Check if the current plant state unlocks any new rewards.
 * Returns an array of newly unlocked accoutrements.
 */
export function checkNewUnlocks(
  state: PlantState,
  report?: BonsaiSchoolReport
): TokonomaAccoutrement[] {
  const currentUnlocked = new Set(state.unlockedRewards || DEFAULT_UNLOCKED_REWARDS);
  const newlyUnlocked: TokonomaAccoutrement[] = [];

  for (const item of TOKONOMA_REWARD_CATALOG) {
    if (currentUnlocked.has(item.id)) continue;
    if (item.checkUnlocked(state, report)) {
      currentUnlocked.add(item.id);
      newlyUnlocked.push(item);
    }
  }

  if (newlyUnlocked.length > 0) {
    state.unlockedRewards = Array.from(currentUnlocked);
    const active = state.activeAccoutrements || {
      scrollId: "kakejiku_mountain_sansui",
      accentId: "shitakusa_kokedama_mossball",
    };
    saveRewardsToStorage(state.unlockedRewards, active);
  }

  return newlyUnlocked;
}
