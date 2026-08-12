import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { cutout } from "./cutout";
import { Button } from "@/components/ui/button";
import { Loader2, Layers, User, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import { AvatarFigure, type FigureGarment } from "./AvatarFigure";
import {
  SKIN_TONES,
  HAIR_COLORS,
  LABELS,
  DEFAULT_AVATAR,
  type AvatarChoice,
} from "./avatar";

/** Wearing order, so a coat sits over a shirt rather than under it. */
const LAYER_ORDER = [
  "accessory",
  "outerwear",
  "top",
  "dress",
  "bottom",
  "shoes",
] as const;

function inWearingOrder(garments: FigureGarment[]) {
  return [...garments].sort(
    (a, b) =>
      LAYER_ORDER.indexOf(a.slot as (typeof LAYER_ORDER)[number]) -
      LAYER_ORDER.indexOf(b.slot as (typeof LAYER_ORDER)[number])
  );
}

const TABS = [
  { value: "flat", label: "Flat lay", icon: Layers },
  { value: "figure", label: "On a body", icon: User },
  { value: "notes", label: "How to wear", icon: Sparkles },
] as const;

export function OutfitViews({
  outfitId,
  garments,
}: {
  outfitId: number;
  garments: FigureGarment[];
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("flat");
  const ordered = inWearingOrder(garments);

  return (
    <div>
      <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1 mb-4 w-fit">
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            aria-pressed={tab === t.value}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === t.value
                ? "bg-fuchsia-500/20 text-fuchsia-200"
                : "text-white/50 hover:text-white"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "flat" && <FlatLay garments={ordered} />}
      {tab === "figure" && <OnABody garments={ordered} />}
      {tab === "notes" && <StyleNotes outfitId={outfitId} />}
    </div>
  );
}

/**
 * The person's own photos, laid out in the order they'd be worn — a shop's
 * flat lay. Nothing is generated: the only change is that whatever the clothes
 * were photographed on is lifted away, so the layers sit on one clean surface
 * instead of three different bedspreads.
 */
function FlatLay({ garments }: { garments: FigureGarment[] }) {
  return (
    <div className="bg-gradient-to-b from-[#faf8f6] to-[#ece7e1] rounded-2xl p-6">
      <div className="flex flex-col items-center gap-2">
        {garments.map(garment => (
          <figure key={garment.id} className="w-full max-w-[240px] text-center">
            <CutoutImage
              src={garment.imageUrl}
              alt={garment.name}
              className="w-full h-auto object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.13)]"
            />
            <figcaption className="text-[11px] text-neutral-500 mt-1 capitalize">
              {garment.slot} · {garment.name}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

/** A garment photo with its backdrop lifted off, falling back to the original. */
function CutoutImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [resolved, setResolved] = useState(src);

  useEffect(() => {
    let live = true;
    setResolved(src);
    cutout(src).then(result => {
      if (live) setResolved(result.url);
    });
    return () => {
      live = false;
    };
  }, [src]);

  return <img src={resolved} alt={alt} className={className} loading="lazy" />;
}

/** The drawn figure, plus the controls that shape it. */
function OnABody({ garments }: { garments: FigureGarment[] }) {
  const utils = trpc.useUtils();
  const avatarQuery = trpc.wardrobe.avatar.get.useQuery();
  const saveAvatar = trpc.wardrobe.avatar.save.useMutation({
    onSuccess: () => {
      utils.wardrobe.avatar.get.invalidate();
      toast.success("Saved your figure");
    },
    onError: err => toast.error(err.message.slice(0, 120)),
  });

  const saved = avatarQuery.data;
  const [draft, setDraft] = useState<AvatarChoice | null>(null);
  const choice: AvatarChoice =
    draft ??
    (saved
      ? {
          skinTone: saved.skinTone,
          bodyShape: saved.bodyShape,
          height: saved.height,
          hairStyle: saved.hairStyle,
          hairColor: saved.hairColor,
        }
      : DEFAULT_AVATAR);

  const dirty = draft !== null;

  function set<K extends keyof AvatarChoice>(key: K, value: AvatarChoice[K]) {
    setDraft({ ...choice, [key]: value });
  }

  if (avatarQuery.isLoading) {
    return (
      <div className="flex justify-center py-16 text-white/40">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-[minmax(0,260px)_1fr] gap-6">
      <div className="bg-gradient-to-b from-[#f7f4f1] to-[#e9e4df] rounded-2xl p-4">
        <AvatarFigure
          choice={choice}
          garments={garments}
          className="w-full aspect-[100/220]"
        />
      </div>

      <div className="space-y-5">
        <Swatches
          label="Skin tone"
          options={Object.keys(SKIN_TONES) as (keyof typeof SKIN_TONES)[]}
          value={choice.skinTone}
          colorOf={key => SKIN_TONES[key]}
          labelOf={key => LABELS.skinTone[key]}
          onPick={value => set("skinTone", value)}
        />
        <Chips
          label="Body shape"
          options={Object.keys(LABELS.bodyShape) as AvatarChoice["bodyShape"][]}
          value={choice.bodyShape}
          labelOf={key => LABELS.bodyShape[key]}
          onPick={value => set("bodyShape", value)}
        />
        <Chips
          label="Height"
          options={Object.keys(LABELS.height) as AvatarChoice["height"][]}
          value={choice.height}
          labelOf={key => LABELS.height[key]}
          onPick={value => set("height", value)}
        />
        <Chips
          label="Hair"
          options={Object.keys(LABELS.hairStyle) as AvatarChoice["hairStyle"][]}
          value={choice.hairStyle}
          labelOf={key => LABELS.hairStyle[key]}
          onPick={value => set("hairStyle", value)}
        />
        {choice.hairStyle !== "none" && (
          <Swatches
            label="Hair colour"
            options={Object.keys(HAIR_COLORS) as (keyof typeof HAIR_COLORS)[]}
            value={choice.hairColor}
            colorOf={key => HAIR_COLORS[key]}
            labelOf={key => LABELS.hairColor[key]}
            onPick={value => set("hairColor", value)}
          />
        )}

        <Button
          onClick={() => saveAvatar.mutate(choice)}
          disabled={!dirty || saveAvatar.isPending}
          className="bg-gradient-to-r from-fuchsia-500 to-violet-600 border-0"
        >
          {saveAvatar.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Check className="w-4 h-4 mr-2" />
          )}
          {dirty ? "Save my figure" : "Saved"}
        </Button>
      </div>
    </div>
  );
}

function Swatches<T extends string>({
  label,
  options,
  value,
  colorOf,
  labelOf,
  onPick,
}: {
  label: string;
  options: T[];
  value: T;
  colorOf: (key: T) => string;
  labelOf: (key: T) => string;
  onPick: (key: T) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map(option => (
          <button
            key={option}
            onClick={() => onPick(option)}
            title={labelOf(option)}
            aria-label={labelOf(option)}
            aria-pressed={value === option}
            className={`w-8 h-8 rounded-full border-2 transition-transform ${
              value === option
                ? "border-fuchsia-400 scale-110"
                : "border-white/15 hover:border-white/40"
            }`}
            style={{ backgroundColor: colorOf(option) }}
          />
        ))}
      </div>
    </div>
  );
}

function Chips<T extends string>({
  label,
  options,
  value,
  labelOf,
  onPick,
}: {
  label: string;
  options: T[];
  value: T;
  labelOf: (key: T) => string;
  onPick: (key: T) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(option => (
          <button
            key={option}
            onClick={() => onPick(option)}
            aria-pressed={value === option}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              value === option
                ? "bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-400/40"
                : "bg-white/5 text-white/60 border border-white/10 hover:text-white"
            }`}
          >
            {labelOf(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

function StyleNotes({ outfitId }: { outfitId: number }) {
  const notesQuery = trpc.wardrobe.styleNotes.useQuery({ outfitId });

  if (notesQuery.isLoading) {
    return (
      <div className="flex justify-center py-16 text-white/40">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (!notesQuery.data) {
    return (
      <p className="text-white/40 text-sm py-8">
        Styling notes are unavailable right now — the other two views still
        work.
      </p>
    );
  }

  const notes = notesQuery.data;
  return (
    <div className="space-y-5 max-w-2xl">
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-fuchsia-300/70 mb-2">
          How to wear it
        </h4>
        <p className="text-sm text-white/80 leading-relaxed">
          {notes.how_to_wear}
        </p>
      </section>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-fuchsia-300/70 mb-2">
          Where it works
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {notes.occasions.map(occasion => (
            <span
              key={occasion}
              className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-white/70 border border-white/10"
            >
              {occasion}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-fuchsia-300/70 mb-2">
          Finishing touch
        </h4>
        <p className="text-sm text-white/80">{notes.finishing_touch}</p>
      </section>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">
          Maybe not for
        </h4>
        <p className="text-sm text-white/50">{notes.avoid}</p>
      </section>
    </div>
  );
}
