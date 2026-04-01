import { Upload, Loader2, CheckCircle2 } from "lucide-react";
import { formatTime } from "../../lib/utils/formatters";
import { InputMode } from "../../lib/types/dashboard";

interface ProgressViewProps {
  inputMode: InputMode;
  audioProgress: number | null;
  isAudioDone: boolean;
  audioStatus: string | null;
  audioElapsed: number | null;
  audioEstimated: number | null;
  setActiveMode: (m: "notes") => void;
}

export default function ProgressView({
  inputMode, audioProgress, isAudioDone, audioStatus,
  audioElapsed, audioEstimated, setActiveMode
}: ProgressViewProps) {
  const steps = [
    "uploading",
    "queued",
    "preprocessing",
    "transcribing",
    "cleaning",
    "indexing",
  ];

  return (
    <main className="rounded-2xl border border-white/10 bg-slate-900/50 p-8 backdrop-blur-2xl shadow-xl shadow-black/30">
      <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
        <h2 className="text-2xl font-bold text-white tracking-tight">Audio Progress</h2>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/60 p-8 text-sm text-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-base font-medium text-white">
            <div className="p-2 bg-emerald-500/20 rounded-lg">
                <Upload className="h-5 w-5 text-emerald-400" />
            </div>
            {inputMode === "audio" ? "Audio Upload Status" : "Processing Status"}
          </div>
          <div className="text-2xl font-bold text-amber-400">
            {audioProgress != null ? `${audioProgress.toFixed(0)}%` : "—"}
          </div>
        </div>

        <div className="mt-6 h-4 w-full overflow-hidden rounded-full bg-slate-900 shadow-inner">
          <div
            className={
              "h-full rounded-full transition-all duration-500 ease-out " +
              (isAudioDone ? "bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]" : "shimmer bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600 bg-[length:200%_100%]")
            }
            style={{ width: `${audioProgress ?? 0}%` }}
          />
        </div>

        <div className="mt-8 space-y-6">
          <div className="flex items-center justify-between text-sm text-slate-200 bg-black/20 p-4 rounded-xl border border-white/5">
            <div className="flex items-baseline gap-3">
              <span className="text-sm font-medium text-slate-400">Current Phase:</span>
              <span className="text-lg font-bold capitalize text-white tracking-wide">
                {audioStatus || "Waiting..."}
              </span>
            </div>
            {isAudioDone && (
              <span className="rounded-full bg-emerald-500/20 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-500/50">
                Complete
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {steps.map((step) => {
              const currentIndex = steps.indexOf(audioStatus || "");
              const stepIndex = steps.indexOf(step);
              const isDone = isAudioDone || stepIndex < currentIndex;
              const isActive = !isAudioDone && stepIndex === currentIndex;

              return (
                <div
                  key={step}
                  className={
                    "flex items-center gap-3 rounded-xl border px-4 py-3 backdrop-blur-sm transition-all " +
                    (isActive
                      ? "border-amber-500/50 bg-amber-500/10 text-amber-200 shadow-lg shadow-amber-500/10"
                      : isDone
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-white/5 bg-white/5 text-slate-500")
                  }
                >
                  <div className="flex items-center justify-center h-6 w-6">
                    {isActive ? (
                      <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
                    ) : isDone ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <div className="h-2.5 w-2.5 rounded-full bg-slate-600/50" />
                    )}
                  </div>
                  <span className="font-medium capitalize text-sm">{step}</span>
                </div>
              );
            })}
          </div>

          {isAudioDone ? (
            <div className="mt-8 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-8 text-center shadow-lg shadow-emerald-500/10">
              <div className="flex items-center justify-center gap-3 text-lg font-bold text-emerald-300 mb-6">
                <CheckCircle2 className="h-6 w-6" />
                <span>Analysis Complete! Your insights are ready.</span>
              </div>

              <button
                onClick={() => setActiveMode("notes")}
                className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-8 py-3 text-base font-bold text-slate-950 shadow-xl shadow-emerald-500/30 hover:bg-emerald-400 transform hover:-translate-y-0.5 transition-all"
              >
                Go to Masterclass Notes
              </button>
            </div>
          ) : (
            audioElapsed != null &&
            audioEstimated != null && (
              <div className="flex justify-between items-center bg-black/20 p-4 rounded-xl border border-white/5 font-mono text-sm tracking-wide">
                <div className="flex items-center gap-3">
                  <span className="text-slate-500 uppercase text-xs">Elapsed:</span>
                  <span className="text-amber-200/80">{formatTime(audioElapsed)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-500 uppercase text-xs">ETA:</span>
                  <span className="text-emerald-200/80">{formatTime(audioEstimated)}</span>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </main>
  );
}