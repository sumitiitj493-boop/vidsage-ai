import { useState } from "react";
import { X, Trash2, MessageSquare, Clock, Bookmark, BookmarkCheck } from "lucide-react";
import Image from "next/image";
import { ChatSession } from "../../lib/types/dashboard";

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  onSelectSession: (session: ChatSession) => void;
  onDeleteSession: (sessionId: string) => void;
  onSaveSession?: (sessionId: string) => void;
}

const isYouTubeId = (id: string) => /^[a-zA-Z0-9_-]{11}$/.test(id);

export default function HistoryModal({ isOpen, onClose, sessions, onSelectSession, onDeleteSession, onSaveSession }: HistoryModalProps) {
  const [activeTab, setActiveTab] = useState<"recent" | "saved">("recent");

  if (!isOpen) return null;
  
  // Sort all sessions by updatedAt descending
  const sortedSessions = Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt);

  const savedSessions = sortedSessions.filter((s) => s.saved);
  const recentSessions = sortedSessions.slice(0, 15); // Show more recent ones

  const visibleSessions = activeTab === "saved" ? savedSessions : recentSessions;

  // Grouping by video title/ID is good for organizing multiple sessions of the same video
  // However, we must ensure we don't hide sessions.
  const groups: Record<string, ChatSession[]> = {};
  visibleSessions.forEach((s) => {
    const key = s.id || s.title || "Untitled";
    groups[key] = groups[key] || [];
    groups[key].push(s);
  });

  Object.keys(groups).forEach((k) => groups[k].sort((a, b) => b.updatedAt - a.updatedAt));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-end bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300">
      <div className="h-full w-full max-w-md bg-slate-900 border-l border-white/10 shadow-2xl flex flex-col transform transition-transform duration-300 ease-out translate-x-0">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" />
            Chat History
          </h2>
          <div className="flex items-center gap-2 rounded-full bg-slate-950/60 p-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("recent")}
              className={`px-3 py-1 rounded-full transition-colors ${activeTab === "recent" ? "bg-amber-500 text-slate-950" : "text-slate-300 hover:text-white"}`}
            >
              Recent
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("saved")}
              className={`px-3 py-1 rounded-full transition-colors ${activeTab === "saved" ? "bg-amber-500 text-slate-950" : "text-slate-300 hover:text-white"}`}
            >
              Saved
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 custom-scrollbar">
          {visibleSessions.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-slate-500">
              {activeTab === "saved" ? "No saved sessions yet." : "No recent chat sessions found."}
            </div>
          ) : (
            Object.keys(groups).map((title) => {
              const list = groups[title];
              const latest = list[0];
              const ytThumbnail = isYouTubeId(latest.id) ? `https://img.youtube.com/vi/${latest.id}/mqdefault.jpg` : null;

              return (
                <div key={title} className="group relative bg-slate-950/40 border border-white/5 rounded-xl p-4 hover:border-amber-500/30 hover:bg-slate-950 transition-all flex flex-col gap-3">
                  <div className="flex gap-3 items-start">
                    {ytThumbnail && (
                      <div className="relative w-28 aspect-video rounded-lg overflow-hidden bg-slate-800 flex-shrink-0">
                        <Image src={ytThumbnail} alt="Thumbnail" fill sizes="112px" unoptimized className="object-cover" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-slate-200 line-clamp-2 leading-tight">{title}</h3>
                      <div className="mt-2 text-xs text-slate-500 flex items-center gap-3">
                        <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{latest.messages.length}</span>
                        <span>{list.length} session{list.length > 1 ? 's' : ''}</span>
                        <span className="text-[10px] ml-auto">{new Date(latest.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 mt-1">
                    {onSaveSession && (
                      <button
                        type="button"
                        onClick={() => onSaveSession(latest.id)}
                        className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-md font-semibold transition-colors ${latest.saved ? 'bg-slate-800 text-amber-500 hover:bg-slate-700' : 'bg-amber-500 text-slate-950 hover:brightness-95'}`}
                      >
                        {latest.saved ? <><BookmarkCheck className="w-3 h-3" /> Saved</> : <><Bookmark className="w-3 h-3" /> Save</>}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onSelectSession(latest)}
                      className="px-3 py-1.5 text-xs rounded-md bg-transparent border border-white/10 hover:border-amber-500/30 text-white"
                    >
                      Open Video
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSession(latest.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg"
                      title="Delete all sessions for this video"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}