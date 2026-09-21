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
    unlockCondition: "Starter-Hängerolle: Der zeitlose Begleiter für jeden neu gepflanzten Bonsai.",
    checkUnlocked: () => true, // Default starter scroll
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
    unlockCondition: "Meistere den Jin & Shari Stil mit Score ≥ 72, schnitze mindestens 3 Totholzpartien bei intakter Lebensader und mindestens 7 Astsegmenten.",
    checkUnlocked: (state, report) => {
      if (!report) return false;
      const stems = state.nodes.filter((n) => !n.isCut && (n.type === "stem" || n.type === "meristem"));
      const jinCount = state.nodes.filter((n) => (n.isJin || n.isBroken) && !n.isCut).length;
      return (
        report.scores["jin-shari"].score >= 72 &&
        jinCount >= 3 &&
        report.metrics.hasContinuousLifeline &&
        stems.length >= 7
      );
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
    unlockCondition: "Erreiche die Schule Fukinagashi (Windgepeitscht) mit Score ≥ 78, mindestens 7 Astsegmenten und über 78% Windflucht der Krone.",
    checkUnlocked: (_state, report) => {
      if (!report) return false;
      return (
        report.scores.fukinagashi.score >= 78 &&
        report.metrics.windwardRatio >= 0.78 &&
        report.metrics.stemCount >= 7 &&
        (Math.abs(report.metrics.leanAngleDeg) >= 15 || report.metrics.apexOffsetRatio >= 0.20)
      );
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
    unlockCondition: "Meistere die Halbkaskade (Han-Kengai) mit Score ≥ 74, mindestens 6 Astsegmenten und weitausladender Krone (Breite ≥ 80% der Höhe).",
    checkUnlocked: (_state, report) => {
      if (!report) return false;
      return (
        report.scores["han-kengai"].score >= 74 &&
        report.metrics.stemCount >= 6 &&
        report.metrics.width >= report.metrics.height * 0.80
      );
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
    unlockCondition: "Höchste Kokufu-ten Ehrung: Chokkan oder Moyogi mit Score ≥ 88, mindestens 10 Astsegmenten, Stammverjüngung ≥ 1.5 und 0 Fehlerästen.",
    checkUnlocked: (_state, report) => {
      if (!report) return false;
      const chokkanScore = report.scores.chokkan.score;
      const moyogiScore = report.scores.moyogi.score;
      const bestScore = Math.max(chokkanScore, moyogiScore);
      return (
        bestScore >= 88 &&
        report.metrics.stemCount >= 10 &&
        report.metrics.trunkTaper >= 1.5 &&
        report.metrics.faultCount === 0
      );
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
    unlockCondition: "Erziele in einer klassischen Schule den Meister-Grad (Score ≥ 82), mindestens 8 Astsegmente und makellose Astarchitektur ohne Fehleräste (0 Imi-eda).",
    checkUnlocked: (_state, report) => {
      if (!report) return false;
      return (
        report.dominantScore >= 82 &&
        report.metrics.stemCount >= 8 &&
        report.metrics.faultCount === 0
      );
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
    unlockCondition: "Forme einen reifen Literatenbonsai (Bunjingi) mit Score ≥ 76, Schlankheit ≥ 15:1, mindestens 6 Astsegmenten und kargem Unterstamm (≥ 65% kahl).",
    checkUnlocked: (_state, report) => {
      if (!report) return false;
      return (
        report.scores.bunjingi.score >= 76 &&
        report.metrics.slendernessRatio >= 15 &&
        report.metrics.bareTrunkFraction >= 0.65 &&
        report.metrics.stemCount >= 6
      );
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
    unlockCondition: "Vollende eine dramatische Kengai-Vollkaskade mit Score ≥ 80, mindestens 8 Astsegmenten und Kaskadenfall > 45px unter den Topfrand.",
    checkUnlocked: (_state, report) => {
      if (!report) return false;
      return (
        report.scores.kengai.score >= 80 &&
        report.metrics.lowestStemY > 45 &&
        report.metrics.stemCount >= 8 &&
        report.metrics.apexY < report.metrics.rootY
      );
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
    unlockCondition: "Starter-Begleitpflanze: Traditionelle Kokedama-Mooskugel für ein harmonisches Tokonoma-Arrangement.",
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
    unlockCondition: "Bringe deinen Bonsai im Frühling zur vollen Blüte (mindestens 3 reife Blüten im Frühlingszyklus, Baumalter ≥ 35).",
    checkUnlocked: (state) => {
      if ((state.step || 0) < 35) return false;
      const cycle = state.cycleLength || 250;
      const seasonStep = state.step % cycle;
      const isSpring = seasonStep <= 65 || seasonStep >= 235;
      if (!isSpring) return false;
      const matureFlowers = state.nodes.filter(
        (n) => n.type === "flower" && !n.isCut && (n.growthProgress ?? 1.0) >= 0.75
      );
      return matureFlowers.length >= 3;
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
    unlockCondition: "Pflege einen reifen Bonsai (mindestens 6 Astsegmente) durch die frostige Winterperiode (Schritt 180+ im Jahreszyklus bei intakter Bodenfeuchte).",
    checkUnlocked: (state) => {
      const stems = state.nodes.filter((n) => !n.isCut && (n.type === "stem" || n.type === "meristem"));
      if (stems.length < 6) return false;
      if ((state.step || 0) < 180) return false;
      const seasonStep = state.step % (state.cycleLength || 250);
      const isWinter = seasonStep >= 180 && seasonStep <= 245;
      const moistureOk = (state.soilMoisture ?? 0.5) >= 0.25;
      return isWinter && moistureOk;
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
