import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, CircleDashed, FileSearch, Sparkles, Youtube, Layers } from "lucide-react";
import { InputMode } from "../../lib/types/dashboard";

interface ProcessingLoaderProps {
  inputMode: InputMode;
  isWhisperActive?: boolean;
  audioJobId: string | null;
  audioProgress: number | null;
  audioStatus: string | null;
  audioElapsed: number | null;
  audioEstimated: number | null;
}

export default function ProcessingLoader({
  inputMode, isWhisperActive, audioJobId, audioProgress, audioStatus, audioElapsed, audioEstimated
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

  // --- Real-time Interactive Simulator for Whisper (Takes longer) ---
  if (isWhisperActive) {
    const s = elapsedMs / 1000;
    // Whisper progress estimate is roughly ~60 seconds to ~120 seconds.
    // Let's cap the visual bar to 95% until it completes.
    const fakePercent = Math.min(95, Math.floor((s / 90) * 100));

    const steps = [
      { label: "Downloading high-quality audio...", start: 0, done: s > 3.0 },
      { label: "Loading AI Transcription model into GPU...", start: 3.0, done: s > 10.0 },
      { label: "Transcribing audio (this may take 1-3 minutes)...", start: 10.0, done: false },
    ];

    return (
      <div className="w-full bg-slate-900/60 backdrop-blur-2xl border border-white/5 rounded-[2rem] p-8 md:p-12 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-32 -right-32 h-[300px] w-[300px] rounded-full bg-purple-500/10 blur-[80px] animate-pulse" />
        <div className="absolute -bottom-32 -left-32 h-[300px] w-[300px] rounded-full bg-pink-500/10 blur-[80px] animate-pulse" style={{ animationDelay: "1s" }} />

        <h2 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-pink-300 to-purple-300 bg-[length:200%_auto] animate-[gradientMove_3s_linear_infinite] mb-2 flex flex-col md:flex-row items-start md:items-center gap-3">
          Running AI Whisper Model
        </h2>
        <p className="text-slate-400 text-sm font-medium mb-10">Deploying our state-of-the-art neural networks to generate an accurate transcript.</p>
        
        <div className="flex flex-col gap-4 mb-10 relative z-10 min-h-[160px]">
          {steps.map((step, i) => {
            if (s < step.start) return null;
            let Icon = CircleDashed;
            let iconProps: any = { className: "text-slate-600 animate-[spin_3s_linear_infinite]", size: 20 };
            
            if (step.done) {
              Icon = CheckCircle2;
              iconProps = { className: "text-purple-500", size: 20 };
            }

            return (
              <div key={i} className="flex items-start gap-4 transition-all duration-500 animate-fade-in-up">
                <div className="mt-0.5"><Icon {...iconProps} /></div>
                <p className={`text-[0.95rem] ${step.done ? 'text-slate-300' : 'text-white font-medium'} leading-snug`}>
                  {step.label}
                </p>
              </div>
            );
          })}
        </div>
        
        <div className="relative z-10">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-300">Status: <span className="font-semibold text-white">Transcribing</span></span>
            <span className="text-purple-400 font-mono text-lg">~{fakePercent}%</span>
          </div>
          <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden border border-white/5 relative">
            <div 
              className="absolute h-full bg-gradient-to-r from-purple-500 via-pink-400 to-purple-500 transition-all duration-[2000ms] ease-out"
              style={{ width: `${fakePercent}%`, backgroundSize: '200% 100%', animation: 'gradientMove 2s infinite linear' }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-2 font-mono">
            <span>Elapsed: {Math.round(s)}s</span>
            <span>Est. Total: ~90s - 120s</span>
          </div>
        </div>
      </div>
    );
  }

  // --- Real-time Interactive Simulator for YouTube & PDF (No Job ID) ---
  const s = elapsedMs / 1000;
  let steps: {label: string, start: number, done: boolean, forceDone: boolean, error?: boolean, isSub?: boolean}[] = [];
  
  if (inputMode === "youtube") {
    steps = [
      { label: "Extracting YouTube metadata URL...", start: 0, done: s > 1.5, forceDone: false },
      { label: "Fetching and analyzing video transcripts...", start: 1.5, done: s > 3.0, forceDone: false },
      { label: "Validating content and organizing topics...", start: 3.0, done: s > 5.0, forceDone: false },
    ];

    if (s > 5.0) {
      steps.push({ label: "Structuring semantic knowledge graph...", start: 5.0, done: s > 8.0, forceDone: false });
    }
    if (s > 8.0) {
      steps.push({ label: "Finalizing context mapping. Please wait...", start: 8.0, done: false, forceDone: false });
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
      
      {/* Indeterminate Progress Bar */}
      <div className="relative z-10">
        <div className="flex justify-between text-[11px] text-slate-400 mb-2 font-mono uppercase tracking-wider">
          <span>System Operation Active</span>
          <span className="text-emerald-400 font-bold animate-pulse">Processing...</span>
        </div>
        <div className="w-full h-2 bg-slate-800/80 rounded-full overflow-hidden border border-white/5 mb-3 relative">
          <div 
            className="absolute top-0 bottom-0 w-1/2 bg-gradient-to-r from-transparent via-emerald-500 to-transparent rounded-full opacity-80"
            style={{ animation: 'indeterminateSlide 2s infinite ease-in-out' }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500 font-mono">
          <span>Elapsed Time: {Math.round(s)}s</span>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes indeterminateSlide {
          0% { left: -50%; }
          100% { left: 100%; }
        }
      `}} />
    </div>
  );
}
