import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { OutfitViews } from "./OutfitViews";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Shirt,
  UploadCloud,
  Loader2,
  Wand2,
  Trash2,
  Sparkles,
  Send,
  Check,
  UserRound,
  Shapes,
} from "lucide-react";

// `label` names the drawer when filtering the closet; `one` names a single
// piece, for "adding as a top" rather than "adding as tops".
const SLOTS = [
  { value: "top", label: "Tops", one: "Top" },
  { value: "bottom", label: "Bottoms", one: "Bottom" },
  { value: "dress", label: "Dresses", one: "Dress" },
  { value: "outerwear", label: "Outerwear", one: "Coat" },
  { value: "shoes", label: "Shoes", one: "Shoes" },
  { value: "accessory", label: "Accessories", one: "Accessory" },
] as const;

const CATEGORIES = [
  "casual",
  "streetwear",
  "formal",
  "athletic",
  "vintage",
  "other",
] as const;

const MAX_IMAGE_MB = 12;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

type Tab = "closet" | "build" | "saved" | "me";

export default function Wardrobe() {
  const { isAuthenticated, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("closet");

  if (!loading && !isAuthenticated) {
    return (
      <div className="max-w-md mx-auto text-center py-24">
        <Shirt className="w-10 h-10 mx-auto text-white/30 mb-4" />
        <h2 className="text-xl font-bold mb-2">
          Sign in to build your wardrobe
        </h2>
        <p className="text-white/50 text-sm mb-6">
          Upload your clothes once, then let the AI stylist put outfits together
          for you.
        </p>
        <a href={getLoginUrl()}>
          <Button className="bg-gradient-to-r from-fuchsia-500 to-violet-600 border-0">
            Sign in
          </Button>
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Shirt className="w-6 h-6 text-fuchsia-400" />
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
          My Wardrobe
        </h1>
      </div>
      <p className="text-white/50 text-sm mb-6">
        Add your clothes, then let the AI stylist build outfits from what you
        actually own.
      </p>

      <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1 w-fit mb-6">
        {(
          [
            ["closet", "My Closet"],
            ["build", "Build an Outfit"],
            ["saved", "Saved Outfits"],
            ["me", "Your Photo"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === value
                ? "bg-fuchsia-500/20 text-fuchsia-200"
                : "text-white/50 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "closet" && <Closet />}
      {tab === "build" && <Builder />}
      {tab === "saved" && <SavedOutfits />}
      {tab === "me" && <ModelPhoto />}
    </div>
  );
}

// ─── Closet ───────────────────────────────────────────────────────────────────
function Closet() {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [slotFilter, setSlotFilter] = useState<string | undefined>();
  const [addAs, setAddAs] = useState<string | undefined>();

  const itemsQuery = trpc.wardrobe.listItems.useQuery({
    slot: slotFilter as (typeof SLOTS)[number]["value"] | undefined,
  });

  const addMutation = trpc.wardrobe.addItem.useMutation({
    onSuccess: res => {
      toast.success(`Added "${res.item?.name}" to your wardrobe`);
      utils.wardrobe.listItems.invalidate();
    },
    onError: err => toast.error(err.message.slice(0, 140)),
  });

  const deleteMutation = trpc.wardrobe.deleteItem.useMutation({
    onSuccess: () => utils.wardrobe.listItems.invalidate(),
    onError: err => toast.error(err.message.slice(0, 140)),
  });

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} isn't an image`);
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`${file.name} is over ${MAX_IMAGE_MB}MB`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        addMutation.mutate({
          fileBase64: result.split(",")[1] ?? "",
          mimeType: file.type,
          // Only sent when the person picked one; otherwise the classifier
          // decides.
          slot: addAs as (typeof SLOTS)[number]["value"] | undefined,
        });
      };
      reader.readAsDataURL(file);
    });
  };

  return (
    <div>
      {/* Naming the kind of item up front matters: when the classifier is
          unavailable everything would otherwise land in one slot, and an
          outfit needs a top and a bottom before it can be built at all. */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-white/40">Adding as</span>
        <button
          onClick={() => setAddAs(undefined)}
          aria-pressed={!addAs}
          className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
            !addAs
              ? "bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-400/40"
              : "bg-white/5 text-white/60 border border-white/10 hover:text-white"
          }`}
        >
          Let AI decide
        </button>
        {SLOTS.map(s => (
          <button
            key={s.value}
            onClick={() => setAddAs(s.value)}
            aria-pressed={addAs === s.value}
            className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
              addAs === s.value
                ? "bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-400/40"
                : "bg-white/5 text-white/60 border border-white/10 hover:text-white"
            }`}
          >
            {s.one}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <Button
          onClick={() => fileRef.current?.click()}
          disabled={addMutation.isPending}
          className="bg-gradient-to-r from-fuchsia-500 to-violet-600 border-0"
        >
          {addMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Cataloguing…
            </>
          ) : (
            <>
              <UploadCloud className="w-4 h-4 mr-2" /> Add clothes
            </>
          )}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />

        <button
          onClick={() => setSlotFilter(undefined)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            !slotFilter
              ? "bg-fuchsia-500/20 border-fuchsia-400/50 text-fuchsia-200"
              : "border-white/10 text-white/50 hover:text-white"
          }`}
        >
          All
        </button>
        {SLOTS.map(s => (
          <button
            key={s.value}
            onClick={() => setSlotFilter(s.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              slotFilter === s.value
                ? "bg-fuchsia-500/20 border-fuchsia-400/50 text-fuchsia-200"
                : "border-white/10 text-white/50 hover:text-white"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {itemsQuery.isLoading && (
        <div className="flex justify-center py-20 text-white/40">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      {itemsQuery.data?.length === 0 && (
        <div className="text-center py-20 text-white/40">
          <Shirt className="w-10 h-10 mx-auto mb-3" />
          <p className="text-sm">
            Your wardrobe is empty. Add a few pieces and the stylist can get to
            work.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {itemsQuery.data?.map(item => (
          <div
            key={item.id}
            className="group relative bg-white/5 border border-white/10 rounded-xl overflow-hidden"
          >
            <img
              src={item.cleanImageUrl ?? item.imageUrl}
              alt={item.name}
              className="w-full aspect-square object-cover"
              loading="lazy"
            />
            <button
              onClick={() => deleteMutation.mutate({ id: item.id })}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white/70 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
              aria-label={`Remove ${item.name}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <div className="p-2.5">
              <p className="text-sm font-medium truncate">{item.name}</p>
              <p className="text-[11px] text-white/40 capitalize">
                {item.slot}
                {item.colour ? ` · ${item.colour}` : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Builder (AI suggestions + manual picking) ────────────────────────────────
function Builder() {
  const utils = trpc.useUtils();
  const [occasion, setOccasion] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [manualName, setManualName] = useState("");
  const [savedIdx, setSavedIdx] = useState<Set<number>>(new Set());

  const itemsQuery = trpc.wardrobe.listItems.useQuery({});
  const suggestMutation = trpc.wardrobe.suggestOutfits.useMutation({
    onSuccess: res => {
      setSavedIdx(new Set());
      if (res.reason) toast(res.reason);
    },
    onError: err => toast.error(err.message.slice(0, 140)),
  });

  const saveMutation = trpc.wardrobe.saveOutfit.useMutation({
    onSuccess: () => {
      toast.success("Outfit saved");
      utils.wardrobe.listOutfits.invalidate();
    },
    onError: err => toast.error(err.message.slice(0, 140)),
  });

  const toggle = (id: number) =>
    setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  const saveManual = () => {
    if (picked.length < 2) {
      toast.error("Pick at least two pieces");
      return;
    }
    saveMutation.mutate(
      {
        name: manualName.trim() || "My outfit",
        itemIds: picked,
        occasion: occasion.trim() || undefined,
        source: "manual",
      },
      {
        onSuccess: () => {
          setPicked([]);
          setManualName("");
        },
      }
    );
  };

  return (
    <div className="space-y-8">
      {/* AI suggestions */}
      <section className="bg-gradient-to-br from-fuchsia-500/10 to-violet-600/10 border border-fuchsia-500/20 rounded-2xl p-5">
        <div className="flex items-center gap-2 text-fuchsia-300 font-semibold mb-3">
          <Wand2 className="w-4 h-4" /> Let the stylist build it
        </div>
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            value={occasion}
            onChange={e => setOccasion(e.target.value)}
            placeholder="What's the occasion? (optional)"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30"
          />
          <Button
            onClick={() =>
              suggestMutation.mutate({
                occasion: occasion.trim() || undefined,
                count: 3,
              })
            }
            disabled={suggestMutation.isPending}
            className="bg-gradient-to-r from-fuchsia-500 to-violet-600 border-0"
          >
            {suggestMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Styling…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" /> Suggest outfits
              </>
            )}
          </Button>
        </div>

        {suggestMutation.data?.suggestions.map((s, i) => (
          <div
            key={i}
            className="bg-black/20 border border-white/10 rounded-xl p-4 mb-3"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h3 className="font-bold">{s.name}</h3>
                {s.occasion && (
                  <p className="text-xs text-white/50">{s.occasion}</p>
                )}
              </div>
              <Badge className="bg-fuchsia-500/80 border-0 text-white shrink-0">
                {s.score}
              </Badge>
            </div>
            <div className="flex gap-2 mb-3 flex-wrap">
              {s.items.map(item => (
                <div key={item.id} className="w-16">
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-16 h-16 rounded-lg object-cover border border-white/10"
                  />
                  <p className="text-[10px] text-white/50 truncate mt-1">
                    {item.name}
                  </p>
                </div>
              ))}
            </div>
            {s.rationale && (
              <p className="text-sm text-white/70 mb-3">{s.rationale}</p>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={savedIdx.has(i) || saveMutation.isPending}
              onClick={() =>
                saveMutation.mutate(
                  {
                    name: s.name,
                    itemIds: s.item_ids,
                    occasion: s.occasion || undefined,
                    aiRationale: s.rationale || undefined,
                    aiScore: s.score,
                    source: "ai",
                  },
                  { onSuccess: () => setSavedIdx(p => new Set(p).add(i)) }
                )
              }
              className="border-white/20 text-white hover:bg-white/10"
            >
              {savedIdx.has(i) ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1.5" /> Saved
                </>
              ) : (
                "Save this outfit"
              )}
            </Button>
          </div>
        ))}
      </section>

      {/* Manual picker */}
      <section>
        <h2 className="font-bold mb-1">Or put one together yourself</h2>
        <p className="text-white/40 text-sm mb-4">
          Tap pieces to combine them.
        </p>

        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-2 mb-4">
          {itemsQuery.data?.map(item => {
            const on = picked.includes(item.id);
            return (
              <button
                key={item.id}
                onClick={() => toggle(item.id)}
                className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                  on
                    ? "border-fuchsia-400 scale-[1.03]"
                    : "border-transparent hover:border-white/20"
                }`}
              >
                <img
                  src={item.cleanImageUrl ?? item.imageUrl}
                  alt={item.name}
                  className="w-full aspect-square object-cover"
                />
                {on && (
                  <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-fuchsia-500 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {picked.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={manualName}
              onChange={e => setManualName(e.target.value)}
              placeholder="Name this outfit"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30"
            />
            <Button
              onClick={saveManual}
              disabled={saveMutation.isPending}
              className="bg-gradient-to-r from-fuchsia-500 to-violet-600 border-0"
            >
              Save outfit ({picked.length})
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Saved outfits ────────────────────────────────────────────────────────────
function SavedOutfits() {
  const utils = trpc.useUtils();
  const outfitsQuery = trpc.wardrobe.listOutfits.useQuery();
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]>("casual");

  const postMutation = trpc.wardrobe.postToFeed.useMutation({
    onSuccess: () => {
      toast.success("Posted to the feed — it can now be rated and battled");
      utils.wardrobe.listOutfits.invalidate();
      utils.outfits.feed.invalidate();
    },
    onError: err => toast.error(err.message.slice(0, 140)),
  });

  const deleteMutation = trpc.wardrobe.deleteOutfit.useMutation({
    onSuccess: () => utils.wardrobe.listOutfits.invalidate(),
  });

  const modelQuery = trpc.wardrobe.model.get.useQuery();
  const [renderingId, setRenderingId] = useState<number | null>(null);

  const renderMutation = trpc.wardrobe.renderOutfit.useMutation({
    onSuccess: () => {
      toast.success("Here's how it looks");
      utils.wardrobe.listOutfits.invalidate();
    },
    onError: err => toast.error(err.message.slice(0, 160)),
    onSettled: () => setRenderingId(null),
  });

  const seeItOn = (outfitId: number, style: "mannequin" | "personal") => {
    setRenderingId(outfitId);
    renderMutation.mutate({ outfitId, style });
  };

  if (outfitsQuery.isLoading) {
    return (
      <div className="flex justify-center py-20 text-white/40">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!outfitsQuery.data?.length) {
    return (
      <div className="text-center py-20 text-white/40">
        <p className="text-sm">
          No saved outfits yet — build one on the previous tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-white/40">
        <span>Post as:</span>
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-2.5 py-1 rounded-full border capitalize transition-colors ${
              category === c
                ? "bg-fuchsia-500/20 border-fuchsia-400/50 text-fuchsia-200"
                : "border-white/10 hover:text-white"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {outfitsQuery.data.map(outfit => (
        <div
          key={outfit.id}
          className="bg-white/5 border border-white/10 rounded-xl p-4"
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="font-bold">{outfit.name}</h3>
              <p className="text-xs text-white/40">
                {outfit.occasion || "Any occasion"}
                {outfit.source === "ai" && " · styled by AI"}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {outfit.postedPostId ? (
                <Badge className="bg-white/10 border-0 text-white/60">
                  In the feed
                </Badge>
              ) : (
                <Button
                  size="sm"
                  onClick={() =>
                    postMutation.mutate({ outfitId: outfit.id, category })
                  }
                  disabled={postMutation.isPending}
                  className="bg-gradient-to-r from-fuchsia-500 to-violet-600 border-0"
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" /> Enter competition
                </Button>
              )}
              <button
                onClick={() => deleteMutation.mutate({ id: outfit.id })}
                className="p-1.5 text-white/40 hover:text-red-400 transition-colors"
                aria-label={`Delete ${outfit.name}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <OutfitViews outfitId={outfit.id} garments={outfit.items} />
          {outfit.aiRationale && (
            <p className="text-sm text-white/60 mt-3">{outfit.aiRationale}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── The user's own photo, used to render outfits on them ─────────────────────
function ModelPhoto() {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmed, setConfirmed] = useState(false);

  const modelQuery = trpc.wardrobe.model.get.useQuery();

  const uploadMutation = trpc.wardrobe.model.upload.useMutation({
    onSuccess: () => {
      toast.success("Photo saved — you can now see outfits on you");
      utils.wardrobe.model.get.invalidate();
    },
    onError: err => toast.error(err.message.slice(0, 160)),
  });

  const deleteMutation = trpc.wardrobe.model.delete.useMutation({
    onSuccess: () => {
      toast.success("Photo removed");
      setConfirmed(false);
      utils.wardrobe.model.get.invalidate();
    },
  });

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(`That photo is over ${MAX_IMAGE_MB}MB`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      uploadMutation.mutate({
        fileBase64: (reader.result as string).split(",")[1] ?? "",
        mimeType: file.type,
        isPhotoOfMe: true,
      });
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-xl">
      <h2 className="font-bold mb-1">Your photo</h2>
      <p className="text-white/50 text-sm mb-5">
        Add one full-length photo of yourself and the stylist can show outfits
        on you instead of a mannequin. Only you can see it, and you can remove
        it at any time.
      </p>

      {modelQuery.data ? (
        <div className="flex items-start gap-4">
          <img
            src={modelQuery.data.imageUrl}
            alt="Your photo"
            className="w-40 rounded-xl border border-white/10 object-cover"
          />
          <div>
            <p className="text-sm text-white/70 mb-3">
              Outfits can now be rendered on you from the Saved Outfits tab.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                className="border-white/20 text-white hover:bg-white/10"
              >
                Replace
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="border-white/20 text-white/70 hover:bg-white/10 hover:text-red-400"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="flex items-start gap-2.5 text-sm text-white/70 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              className="mt-1 accent-fuchsia-500"
            />
            <span>
              This is a photo of me. I understand it will be used to generate
              pictures of me wearing these clothes.
            </span>
          </label>

          <Button
            onClick={() => fileRef.current?.click()}
            disabled={!confirmed || uploadMutation.isPending}
            className="bg-gradient-to-r from-fuchsia-500 to-violet-600 border-0"
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading…
              </>
            ) : (
              <>
                <UserRound className="w-4 h-4 mr-2" /> Choose photo
              </>
            )}
          </Button>

          <p className="text-xs text-white/35">
            Please only upload a photo of yourself — not of anyone else.
          </p>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
