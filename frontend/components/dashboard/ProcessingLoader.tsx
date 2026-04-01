import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, CircleDashed, FileSearch, Sparkles, Youtube, Layers } from "lucide-react";
import { InputMode } from "../../lib/types/dashboard";

interface ProcessingLoaderProps {
  inputMode: InputMode;
  audioJobId: string | null;
  audioProgress: number | null;
  audioStatus: string | null;
  audioElapsed: number | null;
  audioEstimated: number | null;
}

export default function ProcessingLoader({
  inputMode, audioJobId, audioProgress, audioStatus, audioElapsed, audioEstimated
}: ProcessingLoaderProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 150);
    return () => clearInterval(timer);
  }, []);

  // For real backend audio jobs
  if (audioJobId || inputMode === "audio") {
    const percent = audioProgress || 0;
    const formattedElapsed = audioElapsed ? Math.round(audioElapsed) : 0;
    const formattedEstimated = audioEstimated ? Math.round(audioEstimated) : "?";
    
    return (
      <div className="w-full bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-6 tracking-wide flex items-center gap-3">
          <Loader2 className="animate-spin text-amber-500" size={24} />
          Processing Audio Tasks
        </h2>
        
        <div className="mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-300 capitalize">Status: <span className="font-semibold text-white">{audioStatus || "Connecting..."}</span></span>
            <span className="text-amber-400 font-mono text-lg">{percent}%</span>
          </div>
          <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden border border-white/5">
            <div 
              className="h-full bg-gradient-to-r from-amber-500 via-emerald-400 to-amber-500 transition-all duration-300 ease-out"
              style={{ width: `${percent}%`, backgroundSize: '200% 100%', animation: 'gradientMove 2s infinite linear' }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-2 font-mono">
            <span>Elapsed: {formattedElapsed}s</span>
            <span>Est. Total: {formattedEstimated}s</span>
          </div>
        </div>
        
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes gradientMove {
            0% { background-position: 0% 50%; }
            100% { background-position: -200% 50%; }
          }
        `}} />
      </div>
    );
  }

  // --- Real-time Interactive Simulator for YouTube & PDF (No Job ID) ---
  const s = elapsedMs / 1000;
  let steps: {label: string, start: number, done: boolean, forceDone: boolean, error?: boolean, isSub?: boolean}[] = [];
  
  if (inputMode === "youtube") {
    steps = [
      { label: "Extracting YouTube metadata URL...", start: 0, done: s > 1.5, forceDone: false },
      { label: "Checking availability of manual YouTube transcript...", start: 1.5, done: s > 2.8, forceDone: false },
      { label: "Validating transcript topic consistency (AI Check)...", start: 2.8, done: s > 4.5, forceDone: false },
    ];
    
    // If it takes longer than 4.5s, we definitively know it's falling back to Whisper!
    if (s > 4.5) {
      steps.push({ label: "Transcription unavailable or failed validation.", start: 4.5, done: true, forceDone: true, error: true });
      steps.push({ label: "Falling back to Whisper AI. Downloading stream...", start: 5.5, done: s > 8.0, forceDone: false });
      if (s > 8.0) {
        steps.push({ label: "Running Whisper AI (Local GPU/CPU processing).", start: 8.0, done: false, forceDone: false });
        steps.push({ label: "This step takes roughly 30-60 seconds depending on length...", start: 9.5, done: false, forceDone: false, isSub: true });
      }
    }
  } else {
    // PDF Mode
    steps = [
      { label: "Uploading document securely...", start: 0, done: s > 1.5, forceDone: false },
      { label: "Extracting text using OCR and layout parsing...", start: 1.5, done: s > 3.0, forceDone: false },
      { label: "Validating content and analyzing knowledge topology...", start: 3.0, done: false, forceDone: false },
    ];
    if (s > 5.0) {
      steps.push({ label: "Processing knowledge graph features...", start: 5.0, done: false, forceDone: false });
    }
  }

  // Calculate synthetic progress percentage
  // YouTube normal: completes around 3-4s. 
  // YouTube Whisper: takes 45s.
  // We'll push progress quickly to 40%, then slowly crawl up to 98% if we hit Whisper time.
  let progress = 0;
  if (inputMode === "youtube") {
    if (s < 4.5) {
      progress = Math.min((s / 4.5) * 60, 60); // fast to 60%
    } else {
      progress = 60 + Math.min(((s - 4.5) / 45) * 38, 38); // slow crawl to 98% over 45s
    }
  } else {
    progress = Math.min((s / 10) * 95, 98); 
  }

  // Update estimated time every 5%
  const quantizedProgress = Math.max(1, Math.floor(progress / 5) * 5);
  let estLeft = 0;
  if (quantizedProgress > 0 && quantizedProgress < 100) {
    // If it's a Youtube Whisper crawl, use a realistic total estimate so it doesn't jump wildly
    if (inputMode === "youtube" && s > 4.5) {
      const fixedTotal = 55; // Roughly 55s average wait for Whisper fallback
      estLeft = Math.max(0, fixedTotal - s);
    } else {
      estLeft = (s / quantizedProgress) * (100 - quantizedProgress);
    }
  }
  
  const formattedElapsed = Math.round(s);
  const formattedEstLeft = Math.round(estLeft);

  return (
    <div className="w-full bg-slate-900/60 backdrop-blur-2xl border border-white/5 rounded-[2rem] p-8 md:p-12 shadow-2xl relative overflow-hidden">
      {/* Decorative BG */}
      <div className="absolute -top-32 -right-32 h-[300px] w-[300px] rounded-full bg-amber-500/10 blur-[80px] animate-pulse" />
      <div className="absolute -bottom-32 -left-32 h-[300px] w-[300px] rounded-full bg-emerald-500/10 blur-[80px] animate-pulse" style={{ animationDelay: "1s" }} />

      <h2 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-amber-300 to-emerald-300 bg-[length:200%_auto] animate-[gradientMove_3s_linear_infinite] mb-2">
        Extracting the Wisdom...
      </h2>
      <p className="text-slate-400 text-sm font-medium mb-10">Agents are mapping your content context into an interactive learning engine.</p>
      
      {/* Dynamic Action Steps */}
      <div className="flex flex-col gap-4 mb-10 relative z-10 min-h-[220px]">
        {steps.map((step, i) => {
          if (s < step.start) return null;
          
          let Icon = CircleDashed;
          let iconProps = { className: "text-slate-600 animate-[spin_3s_linear_infinite]", size: 20 };
          
          if (step.done || step.forceDone) {
            Icon = CheckCircle2;
            iconProps = { className: "text-emerald-500", size: 20 };
            if (step.error) {
              iconProps = { className: "text-amber-500", size: 20 };
            }
          }

          return (
            <div key={i} className={`flex items-start gap-4 transition-all duration-500 ${step.isSub ? 'ml-9 opacity-70' : 'opacity-100'} animate-fade-in-up`}>
              <div className="mt-0.5"><Icon {...iconProps} /></div>
              <p className={`text-[0.95rem] ${step.error ? 'text-amber-300/90 font-medium' : step.done ? 'text-slate-300' : 'text-white font-medium'} leading-snug`}>
                {step.label}
              </p>
            </div>
          );
        })}
      </div>
      
      {/* Progress Bar */}
      <div className="relative z-10">
        <div className="flex justify-between text-[11px] text-slate-400 mb-2 font-mono uppercase tracking-wider">
          <span>System Operation Active</span>
          <span className="text-emerald-400 font-bold">{Math.floor(progress)}%</span>
        </div>
        <div className="w-full h-2 bg-slate-800/80 rounded-full overflow-hidden border border-white/5 mb-3">
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500 font-mono">
          <span>Elapsed: {formattedElapsed}s</span>
          <span>Est. Left: {formattedEstLeft > 0 ? `${formattedEstLeft}s` : 'Finishing...'}</span>
        </div>
      </div>

    </div>
  );
}
