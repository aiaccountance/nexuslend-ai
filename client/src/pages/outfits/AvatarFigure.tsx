import { useEffect, useId, useState } from "react";
import {
  SKIN_TONES,
  HAIR_COLORS,
  BODY_SHAPES,
  HEIGHTS,
  type AvatarChoice,
} from "./avatar";
import { cutout } from "./cutout";

/**
 * The figure an outfit is shown on.
 *
 * Drawn rather than generated. The same choices always produce the same
 * figure, it appears the instant you change something, it costs nothing to
 * show, and it never produces the almost-but-not-quite person that generated
 * bodies do. It's the fashion-illustration convention — a croquis — with real
 * proportions, soft shading and no face, because the face is yours and this
 * isn't a photograph of you.
 *
 * The clothes are the person's own photos, cut off their backgrounds and laid
 * over the figure in wearing order, each sized against this figure's actual
 * shoulders and hips rather than a fixed rectangle.
 */

// ─── Proportions, in the figure's own coordinates ────────────────────────────
// Roughly eight heads tall, which is what fashion illustration uses and what
// makes a drawn body read as a body rather than a doll.
const CX = 50;
const HEAD_CY = 25;
const HEAD_RX = 10.4;
const HEAD_RY = 13;
const CHIN_Y = 37.5;
const NECK_Y = 45;
const SHOULDER_Y = 49;
const BUST_Y = 64;
const WAIST_Y = 86;
const HIP_Y = 102;
const CROTCH_Y = 114;
const KNEE_Y = 158;
const ANKLE_Y = 201;
const SOLE_Y = 209;
const VIEW_HEIGHT = 224;

export type GarmentSlot =
  | "outerwear"
  | "top"
  | "dress"
  | "bottom"
  | "shoes"
  | "accessory";

export type FigureGarment = {
  id: number;
  slot: GarmentSlot | string;
  imageUrl: string;
  name: string;
};

export function AvatarFigure({
  choice,
  garments = [],
  className = "",
}: {
  choice: AvatarChoice;
  garments?: FigureGarment[];
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const skin = SKIN_TONES[choice.skinTone];
  const hair = HAIR_COLORS[choice.hairColor];
  const shape = BODY_SHAPES[choice.bodyShape];
  const tall = HEIGHTS[choice.height];
  const cutouts = useCutouts(garments);
  // Anything still showing its original photo kept its backdrop; say so rather
  // than leaving someone wondering why one piece is a grey rectangle.
  const stubborn = garments
    .filter(g => cutouts[g.id] === g.imageUrl)
    .map(g => g.name);

  // Height lengthens everything below the shoulders and leaves the head alone,
  // which is how people actually differ in height.
  const y = (at: number) =>
    at <= SHOULDER_Y ? at : SHOULDER_Y + (at - SHOULDER_Y) * tall;

  const shoulder = 18 * shape.shoulder;
  const waist = 12.6 * shape.waist;
  const hip = 16.2 * shape.hip;
  const neck = 4.4;

  const bustY = y(BUST_Y);
  const waistY = y(WAIST_Y);
  const hipY = y(HIP_Y);
  const crotchY = y(CROTCH_Y);
  const kneeY = y(KNEE_Y);
  const ankleY = y(ANKLE_Y);
  const soleY = y(SOLE_Y);

  const thigh = hip * 0.5;
  const knee = hip * 0.31;
  const ankle = hip * 0.17;
  const legOffset = hip * 0.46;

  const skinFill = `url(#skin-${uid})`;

  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox={`0 0 100 ${VIEW_HEIGHT}`}
        className="w-full h-full"
        role="img"
        aria-label="Your figure wearing this outfit"
      >
        <defs>
          {/* Light from the front left, so the figure reads as rounded. */}
          <linearGradient id={`skin-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={shade(skin, 0.1)} />
            <stop offset="42%" stopColor={skin} />
            <stop offset="100%" stopColor={shade(skin, -0.2)} />
          </linearGradient>
          <linearGradient id={`hair-${uid}`} x1="0" y1="0" x2="1" y2="0.4">
            <stop offset="0%" stopColor={shade(hair, 0.22)} />
            <stop offset="55%" stopColor={hair} />
            <stop offset="100%" stopColor={shade(hair, -0.25)} />
          </linearGradient>
          <radialGradient id={`ground-${uid}`}>
            <stop offset="0%" stopColor="rgba(0,0,0,0.32)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>

        {/* The floor, so the figure stands rather than floats. */}
        <ellipse
          cx={CX}
          cy={soleY + 4}
          rx={hip * 1.7}
          ry={5}
          fill={`url(#ground-${uid})`}
        />

        {/* Legs, drawn first so the torso overlaps them at the hip. */}
        {[-1, 1].map(side => {
          const c = CX + side * legOffset;
          return (
            <g key={side}>
              <path
                d={`M ${c - thigh} ${hipY - 6}
                    C ${c - thigh} ${kneeY - 34}, ${c - knee - 1.5} ${kneeY - 15}, ${c - knee} ${kneeY}
                    C ${c - knee} ${kneeY + 24}, ${c - ankle - 1.5} ${ankleY - 15}, ${c - ankle} ${ankleY}
                    L ${c + ankle} ${ankleY}
                    C ${c + ankle + 1.5} ${ankleY - 15}, ${c + knee} ${kneeY + 24}, ${c + knee} ${kneeY}
                    C ${c + knee + 1.5} ${kneeY - 15}, ${c + thigh * 0.82} ${kneeY - 34}, ${c + thigh * 0.6} ${hipY - 6} Z`}
                fill={skinFill}
              />
              {/* Foot */}
              <path
                d={`M ${c - ankle} ${ankleY - 1}
                    L ${c + ankle} ${ankleY - 1}
                    C ${c + ankle + 1} ${soleY - 3}, ${c + ankle * 1.6} ${soleY}, ${c + ankle * 1.9} ${soleY}
                    L ${c - ankle * 1.1} ${soleY}
                    C ${c - ankle * 1.2} ${soleY - 3}, ${c - ankle} ${ankleY + 3}, ${c - ankle} ${ankleY - 1} Z`}
                fill={skinFill}
              />
            </g>
          );
        })}

        {/* Arms, hanging just clear of the body. */}
        {[-1, 1].map(side => {
          const shoulderX = CX + side * (shoulder - 1.5);
          const elbowX = CX + side * (shoulder + 2.5);
          const wristX = CX + side * (shoulder + 2);
          return (
            <g key={side}>
              <path
                d={`M ${shoulderX} ${y(SHOULDER_Y) + 2}
                    Q ${CX + side * (shoulder + 3.5)} ${bustY + 4}, ${elbowX} ${waistY + 1}`}
                stroke={skinFill}
                strokeWidth={7.6}
                strokeLinecap="round"
                fill="none"
              />
              <path
                d={`M ${elbowX} ${waistY + 1}
                    Q ${CX + side * (shoulder + 3)} ${hipY - 6}, ${wristX} ${hipY + 8}`}
                stroke={skinFill}
                strokeWidth={5.8}
                strokeLinecap="round"
                fill="none"
              />
              <ellipse
                cx={wristX}
                cy={hipY + 13}
                rx={3.1}
                ry={4.4}
                fill={skinFill}
              />
            </g>
          );
        })}

        {/* Torso: shoulders sloping into the neck, waist and hips from the
            shape they picked. */}
        <path
          d={`M ${CX - shoulder} ${y(SHOULDER_Y)}
              Q ${CX - shoulder * 0.6} ${y(SHOULDER_Y) - 4.5}, ${CX - neck} ${y(NECK_Y)}
              L ${CX + neck} ${y(NECK_Y)}
              Q ${CX + shoulder * 0.6} ${y(SHOULDER_Y) - 4.5}, ${CX + shoulder} ${y(SHOULDER_Y)}
              C ${CX + shoulder + 0.5} ${bustY}, ${CX + waist + 1.5} ${waistY - 11}, ${CX + waist} ${waistY}
              C ${CX + waist - 0.5} ${waistY + 8}, ${CX + hip} ${hipY - 9}, ${CX + hip} ${hipY}
              C ${CX + hip} ${crotchY - 5}, ${CX + hip * 0.6} ${crotchY}, ${CX} ${crotchY}
              C ${CX - hip * 0.6} ${crotchY}, ${CX - hip} ${crotchY - 5}, ${CX - hip} ${hipY}
              C ${CX - hip} ${hipY - 9}, ${CX - waist + 0.5} ${waistY + 8}, ${CX - waist} ${waistY}
              C ${CX - waist - 1.5} ${waistY - 11}, ${CX - shoulder - 0.5} ${bustY}, ${CX - shoulder} ${y(SHOULDER_Y)} Z`}
          fill={skinFill}
        />

        {/* Collarbone — one soft line is the difference between a torso and a
            slab. */}
        <path
          d={`M ${CX - shoulder * 0.62} ${y(SHOULDER_Y) + 2.5}
              Q ${CX} ${y(SHOULDER_Y) + 6}, ${CX + shoulder * 0.62} ${y(SHOULDER_Y) + 2.5}`}
          stroke={shade(skin, -0.24)}
          strokeWidth={0.7}
          strokeLinecap="round"
          fill="none"
          opacity={0.55}
        />

        {/* Neck, and the shadow the chin casts on it. */}
        <path
          d={`M ${CX - neck} ${y(NECK_Y) + 1} L ${CX - neck + 0.4} ${CHIN_Y - 2}
              L ${CX + neck - 0.4} ${CHIN_Y - 2} L ${CX + neck} ${y(NECK_Y) + 1} Z`}
          fill={skinFill}
        />
        <ellipse
          cx={CX}
          cy={CHIN_Y}
          rx={neck}
          ry={2.6}
          fill={shade(skin, -0.26)}
          opacity={0.5}
        />

        {/* Ears, then the head: a jaw that tapers, not a circle. */}
        <ellipse cx={CX - HEAD_RX} cy={HEAD_CY + 1} rx={1.9} ry={2.8} fill={skinFill} />
        <ellipse cx={CX + HEAD_RX} cy={HEAD_CY + 1} rx={1.9} ry={2.8} fill={skinFill} />
        <path
          d={`M ${CX - HEAD_RX} ${HEAD_CY - 1}
              C ${CX - HEAD_RX} ${HEAD_CY - HEAD_RY - 2.5}, ${CX + HEAD_RX} ${HEAD_CY - HEAD_RY - 2.5}, ${CX + HEAD_RX} ${HEAD_CY - 1}
              C ${CX + HEAD_RX} ${HEAD_CY + HEAD_RY * 0.6}, ${CX + HEAD_RX * 0.6} ${CHIN_Y}, ${CX} ${CHIN_Y}
              C ${CX - HEAD_RX * 0.6} ${CHIN_Y}, ${CX - HEAD_RX} ${HEAD_CY + HEAD_RY * 0.6}, ${CX - HEAD_RX} ${HEAD_CY - 1} Z`}
          fill={skinFill}
        />

        <Hair style={choice.hairStyle} fill={`url(#hair-${uid})`} />

        {/* The clothes, over the figure, in the order they'd be put on. */}
        {garments.map(garment => {
          const box = placement(garment.slot, {
            shoulder,
            waist,
            hip,
            shoulderY: y(SHOULDER_Y),
            neckY: y(NECK_Y),
            waistY,
            hipY,
            crotchY,
            kneeY,
            ankleY,
            soleY,
          });
          return (
            <image
              key={garment.id}
              href={cutouts[garment.id] ?? garment.imageUrl}
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              preserveAspectRatio={`xMidY${box.anchor} meet`}
            >
              <title>{garment.name}</title>
            </image>
          );
        })}
      </svg>

      {stubborn.length > 0 && (
        <p className="text-[11px] text-neutral-500 mt-2 leading-snug">
          {stubborn.join(" and ")}{" "}
          {stubborn.length > 1 ? "were" : "was"} photographed on something too
          close in colour to lift away. A plain surface that contrasts with the
          garment shows up best here.
        </p>
      )}
    </div>
  );
}

// ─── Where each garment sits on this particular figure ───────────────────────

type Frame = {
  shoulder: number;
  waist: number;
  hip: number;
  shoulderY: number;
  neckY: number;
  waistY: number;
  hipY: number;
  crotchY: number;
  kneeY: number;
  ankleY: number;
  soleY: number;
};

/**
 * A box for the garment to sit inside, measured off the figure rather than
 * fixed, so a curvy figure gets a wider skirt and a tall one a longer one. The
 * photo keeps its own proportions inside the box.
 */
function placement(slot: string, f: Frame) {
  // "Min" hangs the garment from the top of its box — a jumper starts at the
  // shoulders and stops wherever it stops. "Max" stands it on the bottom,
  // which is what shoes do. Centring instead would float everything.
  const box = (
    halfWidth: number,
    top: number,
    bottom: number,
    anchor: "Min" | "Max" = "Min"
  ) => ({
    x: CX - halfWidth,
    y: top,
    width: halfWidth * 2,
    height: Math.max(bottom - top, 1),
    anchor,
  });

  switch (slot) {
    case "outerwear":
      return box(f.shoulder * 1.5, f.shoulderY - 2, f.hipY + 14);
    case "dress":
      return box(Math.max(f.shoulder, f.hip) * 1.34, f.shoulderY - 1, f.kneeY);
    case "bottom":
      return box(f.hip * 1.22, f.waistY - 4, f.ankleY + 2);
    case "shoes":
      return box(f.hip * 0.95, f.ankleY - 12, f.soleY + 4, "Max");
    case "accessory":
      return box(f.shoulder * 0.8, f.neckY - 6, f.shoulderY + 18);
    case "top":
    default:
      return box(f.shoulder * 1.34, f.shoulderY - 1, f.waistY + 10);
  }
}

// ─── Hair ────────────────────────────────────────────────────────────────────

function Hair({
  style,
  fill,
}: {
  style: AvatarChoice["hairStyle"];
  fill: string;
}) {
  const cx = CX;
  const cy = HEAD_CY;
  const rx = HEAD_RX;
  const ry = HEAD_RY;

  /** The cap that sits on top of the skull, shared by most styles. */
  const cap = (
    <path
      d={`M ${cx - rx - 0.6} ${cy + 1}
          C ${cx - rx - 0.8} ${cy - ry - 4}, ${cx + rx + 0.8} ${cy - ry - 4}, ${cx + rx + 0.6} ${cy + 1}
          C ${cx + rx * 0.5} ${cy - 5.5}, ${cx - rx * 0.5} ${cy - 5.5}, ${cx - rx - 0.6} ${cy + 1} Z`}
      fill={fill}
    />
  );

  switch (style) {
    case "none":
      return null;
    case "short":
      return cap;
    case "medium":
      return (
        <>
          {cap}
          <path
            d={`M ${cx - rx - 0.6} ${cy - 2} q -1.6 12 0.6 19 l 5 0 q -3.4 -8 -2.6 -17 Z`}
            fill={fill}
          />
          <path
            d={`M ${cx + rx + 0.6} ${cy - 2} q 1.6 12 -0.6 19 l -5 0 q 3.4 -8 2.6 -17 Z`}
            fill={fill}
          />
        </>
      );
    case "long":
      return (
        <>
          {cap}
          <path
            d={`M ${cx - rx - 0.6} ${cy - 3} q -3.4 24 -0.6 40 l 7 1.5 q -4.4 -20 -3 -39 Z`}
            fill={fill}
          />
          <path
            d={`M ${cx + rx + 0.6} ${cy - 3} q 3.4 24 0.6 40 l -7 1.5 q 4.4 -20 3 -39 Z`}
            fill={fill}
          />
        </>
      );
    case "curly":
      return (
        <>
          {[-8.5, -3, 3, 8.5].map((dx, i) => (
            <circle
              key={i}
              cx={cx + dx}
              cy={cy - 10 + (i % 2) * 2.6}
              r={5.4}
              fill={fill}
            />
          ))}
          <circle cx={cx - rx - 1} cy={cy - 1} r={4.6} fill={fill} />
          <circle cx={cx + rx + 1} cy={cy - 1} r={4.6} fill={fill} />
          <circle cx={cx - rx - 1.5} cy={cy + 6} r={3.6} fill={fill} />
          <circle cx={cx + rx + 1.5} cy={cy + 6} r={3.6} fill={fill} />
        </>
      );
    case "afro":
      return (
        <>
          <circle cx={cx} cy={cy - 4} r={17.5} fill={fill} />
          <circle cx={cx - 12} cy={cy + 4} r={7} fill={fill} />
          <circle cx={cx + 12} cy={cy + 4} r={7} fill={fill} />
        </>
      );
    case "bun":
      return (
        <>
          {cap}
          <ellipse cx={cx} cy={cy - ry - 3.5} rx={6.4} ry={5.6} fill={fill} />
        </>
      );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Lighten (positive) or darken (negative) a hex colour. */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (channel: number) =>
    Math.round(
      amount >= 0
        ? channel + (255 - channel) * amount
        : channel * (1 + amount)
    );
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * Background-free versions of the garment photos, filled in as each one is
 * ready. Until then the original photo is shown, so nothing ever waits on a
 * blank space.
 */
function useCutouts(garments: FigureGarment[]) {
  const [urls, setUrls] = useState<Record<number, string>>({});
  const key = garments.map(g => `${g.id}:${g.imageUrl}`).join("|");

  useEffect(() => {
    let live = true;
    for (const garment of garments) {
      cutout(garment.imageUrl).then(url => {
        if (live) {
          setUrls(prev =>
            prev[garment.id] === url ? prev : { ...prev, [garment.id]: url }
          );
        }
      });
    }
    return () => {
      live = false;
    };
    // `key` captures every garment that matters; the array identity does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
}
