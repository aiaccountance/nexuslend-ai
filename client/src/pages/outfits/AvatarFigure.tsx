import {
  SKIN_TONES,
  HAIR_COLORS,
  BODY_SHAPES,
  HEIGHTS,
  type AvatarChoice,
} from "./avatar";

/**
 * The figure an outfit is shown on.
 *
 * Drawn rather than generated: the same choices always produce the same
 * figure, it appears instantly, it costs nothing, and a clean flat drawing
 * reads as a deliberate style. A generated body would read as a photograph
 * that went wrong.
 *
 * The garment photos are laid over it in wearing order, each clipped to the
 * part of the body it covers, so what you see is the real clothing on a
 * figure shaped the way you chose.
 */

/** Where each kind of garment sits on the figure, as a fraction of its box. */
const SLOT_BANDS = {
  outerwear: { top: 0.2, height: 0.36 },
  top: { top: 0.21, height: 0.28 },
  dress: { top: 0.21, height: 0.46 },
  bottom: { top: 0.46, height: 0.34 },
  shoes: { top: 0.86, height: 0.12 },
  accessory: { top: 0.14, height: 0.1 },
} as const;

export type FigureGarment = {
  id: number;
  slot: keyof typeof SLOT_BANDS | string;
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
  const skin = SKIN_TONES[choice.skinTone];
  const hair = HAIR_COLORS[choice.hairColor];
  const shape = BODY_SHAPES[choice.bodyShape];
  const scale = HEIGHTS[choice.height];

  // A 100 x 220 figure, centred, scaled by height. Widths come from the shape.
  const cx = 50;
  const shoulder = 21 * shape.shoulder;
  const waist = 16 * shape.waist;
  const hip = 19 * shape.hip;
  const legLength = 78 * scale;
  const torsoTop = 46;
  const torsoBottom = torsoTop + 62 * scale;

  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox="0 0 100 220"
        className="w-full h-full"
        role="img"
        aria-label="Your figure wearing this outfit"
      >
        {/* Soft ground shadow, so the figure sits rather than floats. */}
        <ellipse cx={cx} cy={214} rx={26} ry={4} fill="rgba(0,0,0,0.28)" />

        {/* Legs */}
        <path
          d={`M ${cx - hip} ${torsoBottom}
              L ${cx - hip * 0.55} ${torsoBottom + legLength}
              L ${cx - hip * 0.12} ${torsoBottom + legLength}
              L ${cx - 1} ${torsoBottom + 6}
              L ${cx + 1} ${torsoBottom + 6}
              L ${cx + hip * 0.12} ${torsoBottom + legLength}
              L ${cx + hip * 0.55} ${torsoBottom + legLength}
              L ${cx + hip} ${torsoBottom} Z`}
          fill={skin}
        />

        {/* Torso: shoulders to hips, waist pinched by the chosen shape. */}
        <path
          d={`M ${cx - shoulder} ${torsoTop}
              C ${cx - shoulder} ${torsoTop + 20}, ${cx - waist} ${torsoTop + 22}, ${cx - waist} ${torsoTop + 34}
              C ${cx - waist} ${torsoTop + 48}, ${cx - hip} ${torsoBottom - 12}, ${cx - hip} ${torsoBottom}
              L ${cx + hip} ${torsoBottom}
              C ${cx + hip} ${torsoBottom - 12}, ${cx + waist} ${torsoTop + 48}, ${cx + waist} ${torsoTop + 34}
              C ${cx + waist} ${torsoTop + 22}, ${cx + shoulder} ${torsoTop + 20}, ${cx + shoulder} ${torsoTop} Z`}
          fill={skin}
        />

        {/* Arms */}
        {[-1, 1].map(side => (
          <path
            key={side}
            d={`M ${cx + side * shoulder} ${torsoTop + 2}
                C ${cx + side * (shoulder + 7)} ${torsoTop + 24}, ${cx + side * (shoulder + 6)} ${torsoTop + 46}, ${cx + side * (shoulder + 3)} ${torsoTop + 62}
                L ${cx + side * (shoulder - 2)} ${torsoTop + 61}
                C ${cx + side * (shoulder + 1)} ${torsoTop + 44}, ${cx + side * (shoulder + 2)} ${torsoTop + 24}, ${cx + side * (shoulder - 4)} ${torsoTop + 6} Z`}
            fill={skin}
          />
        ))}

        {/* Neck and head */}
        <rect x={cx - 5} y={torsoTop - 10} width={10} height={12} fill={skin} />
        <ellipse cx={cx} cy={torsoTop - 22} rx={13} ry={15} fill={skin} />

        <Hair
          style={choice.hairStyle}
          color={hair}
          cx={cx}
          cy={torsoTop - 22}
        />
      </svg>

      {/* Real garment photos, layered over the figure in wearing order. */}
      {garments.map(garment => {
        const band =
          SLOT_BANDS[garment.slot as keyof typeof SLOT_BANDS] ?? SLOT_BANDS.top;
        return (
          <img
            key={garment.id}
            src={garment.imageUrl}
            alt={garment.name}
            className="absolute left-1/2 -translate-x-1/2 object-contain pointer-events-none"
            style={{
              top: `${band.top * 100}%`,
              height: `${band.height * 100}%`,
              width: "58%",
              mixBlendMode: "multiply",
            }}
          />
        );
      })}
    </div>
  );
}

function Hair({
  style,
  color,
  cx,
  cy,
}: {
  style: AvatarChoice["hairStyle"];
  color: string;
  cx: number;
  cy: number;
}) {
  switch (style) {
    case "none":
      return null;
    case "short":
      return (
        <path
          d={`M ${cx - 13} ${cy - 2} A 13 15 0 0 1 ${cx + 13} ${cy - 2} L ${cx + 12} ${cy - 6} A 12 11 0 0 0 ${cx - 12} ${cy - 6} Z`}
          fill={color}
        />
      );
    case "medium":
      return (
        <>
          <path
            d={`M ${cx - 13} ${cy - 1} A 13 15 0 0 1 ${cx + 13} ${cy - 1} Z`}
            fill={color}
          />
          <path
            d={`M ${cx - 13} ${cy - 2} q -2 14 1 20 l 4 0 q -3 -8 -1 -18 Z`}
            fill={color}
          />
          <path
            d={`M ${cx + 13} ${cy - 2} q 2 14 -1 20 l -4 0 q 3 -8 1 -18 Z`}
            fill={color}
          />
        </>
      );
    case "long":
      return (
        <>
          <path
            d={`M ${cx - 13} ${cy - 1} A 13 15 0 0 1 ${cx + 13} ${cy - 1} Z`}
            fill={color}
          />
          <path
            d={`M ${cx - 13} ${cy - 3} q -4 26 0 40 l 6 0 q -4 -20 -2 -38 Z`}
            fill={color}
          />
          <path
            d={`M ${cx + 13} ${cy - 3} q 4 26 0 40 l -6 0 q 4 -20 2 -38 Z`}
            fill={color}
          />
        </>
      );
    case "curly":
      return (
        <>
          {[-9, -3, 3, 9].map((dx, i) => (
            <circle
              key={i}
              cx={cx + dx}
              cy={cy - 11 + (i % 2) * 3}
              r={5.5}
              fill={color}
            />
          ))}
          <circle cx={cx - 13} cy={cy - 3} r={4.5} fill={color} />
          <circle cx={cx + 13} cy={cy - 3} r={4.5} fill={color} />
        </>
      );
    case "afro":
      return <circle cx={cx} cy={cy - 6} r={19} fill={color} />;
    case "bun":
      return (
        <>
          <path
            d={`M ${cx - 13} ${cy - 1} A 13 15 0 0 1 ${cx + 13} ${cy - 1} Z`}
            fill={color}
          />
          <circle cx={cx} cy={cy - 20} r={7} fill={color} />
        </>
      );
  }
}
