import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  UploadCloud,
  Sparkles,
  Loader2,
  Wand2,
  Camera,
  ImagePlus,
} from "lucide-react";

const CATEGORIES = [
  "casual",
  "streetwear",
  "formal",
  "athletic",
  "vintage",
  "other",
] as const;

// Base64 inflates payloads by ~33%, so keep the raw file well under the
// server's body limit. Mirrored by a server-side guard in outfitsRouter.
const MAX_IMAGE_MB = 12;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

export default function OutfitUpload() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  // A second input with `capture` opens the camera straight away on a phone.
  // It has to be separate: an input that captures can no longer offer the
  // photo library, and people want both.
  const cameraRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>("image/jpeg");
  const [caption, setCaption] = useState("");
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]>("casual");

  const uploadMutation = trpc.outfits.upload.useMutation({
    onSuccess: () =>
      toast.success("Outfit posted — AI stylist has weighed in!"),
    onError: err => toast.error(`Upload failed: ${err.message.slice(0, 120)}`),
  });

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(
        `That photo is ${(file.size / 1024 / 1024).toFixed(1)}MB — please use one under ${MAX_IMAGE_MB}MB.`
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      setFileBase64(base64);
      setMimeType(file.type);
      setPreview(result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    if (!fileBase64) {
      toast.error("Add a photo of your outfit first");
      return;
    }
    uploadMutation.mutate({
      fileBase64,
      mimeType,
      caption: caption.trim() || undefined,
      category,
    });
  };

  const reset = () => {
    setPreview(null);
    setFileBase64(null);
    setCaption("");
    uploadMutation.reset();
  };

  if (!loading && !isAuthenticated) {
    return (
      <div className="max-w-md mx-auto text-center py-24">
        <UploadCloud className="w-10 h-10 mx-auto text-white/30 mb-4" />
        <h2 className="text-xl font-bold mb-2">Sign in to post an outfit</h2>
        <p className="text-white/50 text-sm mb-6">
          You need an account to upload photos and get AI styling feedback.
        </p>
        <a href={getLoginUrl()}>
          <Button className="bg-gradient-to-r from-fuchsia-500 to-violet-600 border-0">
            Sign in
          </Button>
        </a>
      </div>
    );
  }

  const result = uploadMutation.data;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-1">
        Post Your Outfit
      </h1>
      <p className="text-white/50 text-sm mb-6">
        Upload a photo — our AI stylist will tag it, score it, and suggest
        upgrades.
      </p>

      {result?.post ? (
        <div className="space-y-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {preview && (
              <img
                src={preview}
                alt="Your outfit"
                className="w-full max-h-[420px] object-cover"
              />
            )}
          </div>
          <div className="bg-gradient-to-br from-fuchsia-500/10 to-violet-600/10 border border-fuchsia-500/20 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-fuchsia-300 font-semibold">
              <Wand2 className="w-4 h-4" /> AI Stylist Verdict
            </div>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-black">
                {result.analysis.style_score}
              </span>
              <span className="text-white/50 text-sm">
                / 100 · best for {result.analysis.occasion}
              </span>
            </div>
            <p className="text-sm text-white/80">{result.analysis.feedback}</p>
            {result.analysis.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {result.analysis.tags.map(tag => (
                  <Badge
                    key={tag}
                    className="bg-white/10 border-0 text-white/80"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            {result.analysis.suggestions.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-white/40 mb-1">
                  Level it up
                </p>
                <ul className="text-sm text-white/70 space-y-1 list-disc list-inside">
                  {result.analysis.suggestions.map(s => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => navigate("/outfits")}
              className="flex-1 bg-gradient-to-r from-fuchsia-500 to-violet-600 border-0"
            >
              View in feed
            </Button>
            <Button
              onClick={reset}
              variant="outline"
              className="flex-1 border-white/20 text-white hover:bg-white/10"
            >
              Post another
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div
            onClick={() => fileRef.current?.click()}
            onDrop={e => {
              e.preventDefault();
              handleFile(e.dataTransfer.files?.[0]);
            }}
            onDragOver={e => e.preventDefault()}
            className="border-2 border-dashed border-white/15 rounded-2xl aspect-[4/3] flex items-center justify-center cursor-pointer hover:border-fuchsia-400/50 transition-colors overflow-hidden bg-white/5"
          >
            {preview ? (
              <img
                src={preview}
                alt="Preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-center text-white/40">
                <UploadCloud className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm hidden sm:block">
                  Drag & drop or click to upload a photo
                </p>
                <p className="text-sm sm:hidden">Choose a photo</p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => handleFile(e.target.files?.[0])}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => handleFile(e.target.files?.[0])}
            />
          </div>

          {/* On a phone the camera is the point — most outfits are photographed
              on the spot, not found in a library. */}
          <div className="sm:hidden grid grid-cols-2 gap-2">
            <Button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="bg-gradient-to-r from-fuchsia-500 to-violet-600 border-0"
            >
              <Camera className="w-4 h-4 mr-2" />
              Take a photo
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            >
              <ImagePlus className="w-4 h-4 mr-2" />
              Library
            </Button>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-white/40 mb-2 block">
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors capitalize ${
                    category === c
                      ? "bg-fuchsia-500/20 border-fuchsia-400/50 text-fuchsia-200"
                      : "border-white/10 text-white/50 hover:text-white"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-white/40 mb-2 block">
              Caption (optional)
            </label>
            <Textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Where's this fit headed?"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              maxLength={500}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={uploadMutation.isPending || !fileBase64}
            className="w-full bg-gradient-to-r from-fuchsia-500 to-violet-600 border-0 h-11"
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> AI stylist is
                analysing your fit…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" /> Post & get AI feedback
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
