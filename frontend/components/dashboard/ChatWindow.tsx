import { ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { ChatMessage } from "../../lib/types/dashboard";

interface ChatWindowProps {
  title: string;
  subtitle: string;
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
  chatHistory: ChatMessage[];
  chatIndex: number;
  chatQuestion: string;
  setChatQuestion: (q: string) => void;
  chatLoading: boolean;
  askQuestion: (q: string) => void;
  clearChatHistory: () => void;
  suggestedQuestions: string[];
  renderMarkdownAnswer: (text: string) => ReactNode;
  renderLatexAnswer: (text: string) => ReactNode;
  chatContainerRef: React.RefObject<HTMLDivElement>;
  chatLanguage: string;
  setChatLanguage: (lang: string) => void;
  fullScreenTutorMode?: boolean;
  onToggleTutorMode?: () => void;
}

export default function ChatWindow({
  title, subtitle, isFullScreen, onToggleFullScreen, chatHistory, chatIndex,
  chatQuestion, setChatQuestion, chatLoading, askQuestion,
  clearChatHistory, suggestedQuestions, renderMarkdownAnswer, renderLatexAnswer,
  chatContainerRef, chatLanguage, setChatLanguage, fullScreenTutorMode, onToggleTutorMode
}: ChatWindowProps) {

  return (
    <div className={`flex flex-col h-full ${!isFullScreen ? "rounded-2xl border border-white/10 bg-slate-800/50 p-5 backdrop-blur-2xl shadow-xl shadow-black/30" : "bg-slate-950/80 px-6 py-4"}`}>
      <div className={`flex items-center justify-between gap-3 ${isFullScreen ? "border-b border-white/10 pb-4" : ""}`}>
        <div>
          <h3 className="text-sm font-bold text-white tracking-wide uppercase">{title}</h3>
          <span className="text-xs text-amber-400 font-medium">{subtitle}</span>
        </div>

        <div className="flex items-center gap-2">
          {isFullScreen && onToggleTutorMode && (
            <button
              type="button"
              onClick={onToggleTutorMode}
              className={
                "flex h-8 items-center gap-2 rounded-full px-3 text-xs font-semibold transition-all " +
                (fullScreenTutorMode
                  ? "bg-emerald-500 text-slate-950 shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                  : "bg-white/5 border border-white/10 text-slate-200 hover:bg-white/15")
              }
              title="Toggle transcript view"
            >
              <span>Tutor Mode</span>
              <span className="text-[10px] opacity-80">{fullScreenTutorMode ? "ON" : "OFF"}</span>
            </button>
          )}
          
          <select
            value={chatLanguage}
            onChange={(e) => setChatLanguage(e.target.value)}
            className="h-8 rounded-full bg-slate-800/80 border border-white/10 text-slate-200 text-xs px-3 focus:outline-none focus:border-amber-500/50"
            title="Chat Language"
          >
            <option value="auto">Auto-Detect</option>
            <option value="english">English</option>
            <option value="hindi">Hindi (Devanagari)</option>
            <option value="hinglish">Hinglish</option>
          </select>

          <button
            type="button"
            onClick={onToggleFullScreen}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 border border-white/10 text-slate-200 hover:bg-white/15 transition-colors"
            title={isFullScreen ? "Exit full screen" : "Expand chat"}
          >
            {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className={`flex flex-1 flex-col overflow-hidden ${isFullScreen ? "pt-4" : "mt-4"}`}>
        <div ref={chatContainerRef} className="flex-1 space-y-5 overflow-y-auto pr-2 custom-scrollbar pb-4">
          {chatHistory.slice(0, chatIndex + 1).map((entry, idx) => (
            <div key={idx} className="space-y-3 animate-fade-in">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-emerald-500/20 p-4 text-sm text-slate-100 shadow-sm border border-emerald-500/10">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80 mb-2">You</div>
                  <div className="whitespace-pre-wrap leading-relaxed">{entry.question}</div>
                </div>
              </div>
              <div className="flex justify-start">
                <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-slate-900 border border-white/5 p-5 text-sm text-slate-200 shadow-xl shadow-black/20">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-500/80 mb-3 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    Sage AI
                  </div>
                  <div className="leading-relaxed text-[14.5px]">
                    {entry.format === "latex" ? renderLatexAnswer(entry.answer) : renderMarkdownAnswer(entry.answer)}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {chatHistory.length === 0 && (
             <div className="flex h-full items-center justify-center">
                 <div className="text-center bg-black/10 border border-white/5 p-6 rounded-2xl">
                     <p className="text-sm font-semibold text-slate-300">No messages yet.</p>
                     <p className="text-xs text-slate-500 mt-2">Ask a question to begin a learning session.</p>
                 </div>
             </div>
          )}
        </div>

        <div className="mt-4 shrink-0 border-t border-white/5 pt-4">
          {suggestedQuestions.length > 0 && (
            <div className="mb-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Suggested Ideas</div>
              <div className="flex flex-wrap gap-2">
                {suggestedQuestions.slice(0, 6).map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setChatQuestion(q);
                      askQuestion(q);
                    }}
                    className="rounded-full border border-purple-500/20 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-200 hover:bg-purple-500/20 hover:border-purple-500/30 transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 bg-slate-950/60 p-1.5 rounded-2xl border border-white/10 focus-within:border-amber-500/50 focus-within:ring-1 focus-within:ring-amber-500/50 transition-all">
              <input
                value={chatQuestion}
                onChange={(e) => setChatQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !chatLoading) {
                    e.preventDefault();
                    askQuestion(chatQuestion);
                  }
                }}
                placeholder="Ask the Sage..."
                className="flex-1 bg-transparent px-4 py-2.5 text-sm text-white focus:outline-none placeholder:text-slate-600"
              />
              <button
                onClick={() => askQuestion(chatQuestion)}
                disabled={!chatQuestion.trim() || chatLoading}
                className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold tracking-wide text-slate-950 hover:bg-emerald-400 disabled:opacity-30 disabled:hover:bg-emerald-500 transition-colors shadow-md shadow-emerald-500/20"
              >
                {chatLoading ? "Thinking..." : "Send"}
              </button>
            </div>

            <div className="flex flex-wrap gap-2 justify-between px-1">
              <button
                type="button"
                onClick={clearChatHistory}
                className="text-xs font-semibold text-rose-400/80 hover:text-rose-400 transition-colors uppercase tracking-wider"
              >
                Clear History
              </button>

              <button
                type="button"
                onClick={() => {
                  const last = chatHistory[chatHistory.length - 1];
                  if (last) askQuestion(last.question);
                }}
                disabled={chatHistory.length === 0 || chatLoading}
                className="text-xs font-semibold text-slate-400 hover:text-slate-300 disabled:opacity-30 transition-colors uppercase tracking-wider"
              >
                Regenerate Last
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}