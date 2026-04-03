import { X, Trash2, MessageSquare, Clock } from "lucide-react";
import { ChatSession } from "../../lib/types/dashboard";

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  onSelectSession: (session: ChatSession) => void;
  onDeleteSession: (sessionId: string) => void;
}

export default function HistoryModal({ isOpen, onClose, sessions, onSelectSession, onDeleteSession }: HistoryModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-end bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300">
      <div className="h-full w-full max-w-md bg-slate-900 border-l border-white/10 shadow-2xl flex flex-col transform transition-transform duration-300 ease-out translate-x-0">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" />
            Chat History
          </h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 custom-scrollbar">
          {sessions.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-slate-500">
              No previous chat sessions found.
            </div>
          ) : (
            sessions.sort((a, b) => b.updatedAt - a.updatedAt).map((session) => (
              <div 
                key={session.id}
                className="group relative bg-slate-950/40 border border-white/5 rounded-xl p-4 hover:border-amber-500/30 hover:bg-slate-950 flex flex-col gap-2 cursor-pointer transition-all"
                onClick={() => onSelectSession(session)}
              >
                <div className="flex justify-between items-start gap-2">
                  <h3 className="font-medium text-slate-200 line-clamp-2 pr-8">{session.title || "Untitled Session"}</h3>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                    className="absolute top-3 right-3 p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete session check"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    {session.messages.length} messages
                  </span>
                  <span>{new Date(session.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}