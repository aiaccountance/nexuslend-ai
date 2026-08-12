/**
 * The look-up tables behind the drawn figure.
 *
 * Kept apart from the drawing itself so the palette and proportions can be
 * re-tuned without touching the component, and so the same values are
 * available to any preview that needs them.
 */

export const SKIN_TONES = {
  porcelain: "#f6ded2",
  fair: "#f0cdb4",
  light: "#e5b492",
  medium: "#cf9c73",
  tan: "#b57c50",
  bronze: "#96603a",
  deep: "#6f4529",
  rich: "#4a2d1a",
} as const;

export const HAIR_COLORS = {
  black: "#1c1a1c",
  brown: "#4a3428",
  blonde: "#c9a063",
  auburn: "#7a3b22",
  red: "#a63d1f",
  grey: "#9a9a9c",
  dyed: "#b0479b",
} as const;

/**
 * Body shape as multipliers on a base figure: how wide the shoulders, waist
 * and hips are relative to each other. Proportions rather than absolute sizes,
 * so height can scale the whole figure independently.
 */
export const BODY_SHAPES = {
  slim: { shoulder: 0.86, waist: 0.74, hip: 0.84 },
  straight: { shoulder: 1.0, waist: 0.92, hip: 0.97 },
  athletic: { shoulder: 1.14, waist: 0.86, hip: 0.96 },
  curvy: { shoulder: 1.0, waist: 0.84, hip: 1.18 },
  full: { shoulder: 1.12, waist: 1.14, hip: 1.16 },
} as const;

/** Height changes the torso and leg length, not the width. */
export const HEIGHTS = {
  petite: 0.93,
  average: 1.0,
  tall: 1.07,
} as const;

export type SkinTone = keyof typeof SKIN_TONES;
export type HairColor = keyof typeof HAIR_COLORS;
export type BodyShape = keyof typeof BODY_SHAPES;
export type Height = keyof typeof HEIGHTS;
export type HairStyle =
  | "none"
  | "short"
  | "medium"
  | "long"
  | "curly"
  | "afro"
  | "bun";

export type AvatarChoice = {
  skinTone: SkinTone;
  bodyShape: BodyShape;
  height: Height;
  hairStyle: HairStyle;
  hairColor: HairColor;
};

export const DEFAULT_AVATAR: AvatarChoice = {
  skinTone: "medium",
  bodyShape: "straight",
  height: "average",
  hairStyle: "short",
  hairColor: "brown",
};

/** Human labels, so the picker never shows a raw key. */
export const LABELS = {
  skinTone: {
    porcelain: "Porcelain",
    fair: "Fair",
    light: "Light",
    medium: "Medium",
    tan: "Tan",
    bronze: "Bronze",
    deep: "Deep",
    rich: "Rich",
  },
  bodyShape: {
    slim: "Slim",
    straight: "Straight",
    athletic: "Athletic",
    curvy: "Curvy",
    full: "Full",
  },
  height: { petite: "Petite", average: "Average", tall: "Tall" },
  hairStyle: {
    none: "None",
    short: "Short",
    medium: "Mid-length",
    long: "Long",
    curly: "Curly",
    afro: "Afro",
    bun: "Bun",
  },
  hairColor: {
    black: "Black",
    brown: "Brown",
    blonde: "Blonde",
    auburn: "Auburn",
    red: "Red",
    grey: "Grey",
    dyed: "Dyed",
  },
} as const;
