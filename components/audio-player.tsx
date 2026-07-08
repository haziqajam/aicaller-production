"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { PlayIcon, PauseIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toastApiError } from "@/lib/api/errors";

export function AudioPlayer({ getUrl }: { getUrl: () => Promise<string> }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [pos, setPos] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);

  async function play() {
    if (!src) {
      setLoading(true);
      try {
        const url = await getUrl();
        setSrc(url);
        requestAnimationFrame(() => ref.current?.play());
      } catch (err) {
        toastApiError(err, "Couldn't load recording");
      } finally {
        setLoading(false);
      }
    } else {
      ref.current?.play();
    }
  }

  async function handleError() {
    setLoading(true);
    try {
      const url = await getUrl();
      setSrc(url);
      requestAnimationFrame(() => ref.current?.play());
    } catch (err) {
      toastApiError(err, "Couldn't load recording");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    if (!ref.current) return;
    if (playing) {
      ref.current.pause();
    } else {
      play();
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
      {/* Play/Pause toggle */}
      <Button
        size="sm"
        variant="outline"
        className={cn(
          "size-8 shrink-0 rounded-full p-0 transition-colors duration-150",
          playing && "border-primary text-primary"
        )}
        onClick={toggle}
        disabled={loading}
        aria-label={playing ? "Pause" : "Play"}
      >
        {loading ? (
          <span className="size-3 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />
        ) : playing ? (
          <PauseIcon className="size-3.5" aria-hidden />
        ) : (
          <PlayIcon className="size-3.5" aria-hidden />
        )}
      </Button>

      {/* Scrubber */}
      <Slider
        className="flex-1"
        value={[pos]}
        min={0}
        max={duration || 100}
        step={0.1}
        onValueChange={(v) => {
          const val = Array.isArray(v) ? v[0] : v;
          if (ref.current) ref.current.currentTime = val as number;
        }}
        aria-label="Playback position"
      />

      {/* Timecode */}
      <span className="tabular shrink-0 text-xs text-muted-foreground w-20 text-right">
        {formatTime(pos)} / {formatTime(duration)}
      </span>

      {/* Hidden audio element */}
      <audio
        ref={ref}
        src={src ?? undefined}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={handleError}
      />
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
