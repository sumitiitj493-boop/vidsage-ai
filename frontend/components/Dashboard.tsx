"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import katex from "katex";
import { Maximize2, Minimize2, MessageSquare, X, Bot } from "lucide-react";

import { useVideoProcessor } from "../hooks/useVideoProcessor";
import { useChat } from "../hooks/useChat";
import { useNotes } from "../hooks/useNotes";
import { normalizeMathMarkdown } from "../lib/utils/markdown";
import { linkifyTimestamps } from "../lib/utils/formatters";

import DashboardHeader from "./dashboard/Header";
import DashboardSidebar from "./dashboard/Sidebar";
import ProgressView from "./dashboard/ProgressView";
import TranscriptView from "./dashboard/TranscriptView";
import LandingView from "./dashboard/LandingView";
import ProcessingLoader from "./dashboard/ProcessingLoader";
import HistoryModal from "./dashboard/HistoryModal";
import { ensureAuthSession, logout } from "../lib/auth";

const NotesView = dynamic(() => import("./dashboard/NotesView"), {
  ssr: false,
  loading: () => <div className="p-6 text-sm text-slate-400">Loading notes workspace...</div>,
});

const ChatWindow = dynamic(() => import("./dashboard/ChatWindow"), {
  ssr: false,
  loading: () => <div className="p-6 text-sm text-slate-400">Loading assistant...</div>,
});

const MindMapView = dynamic(() => import("./dashboard/MindMapView"), {
  ssr: false,
  loading: () => <div className="p-6 text-sm text-slate-400">Loading mind map tools...</div>,
});

const SummaryView = dynamic(() => import("./dashboard/SummaryView"), {
  ssr: false,
  loading: () => <div className="p-6 text-sm text-slate-400">Loading summary engine...</div>,
});

export default function Dashboard() {
  const router = useRouter();
  
  // Call ALL hooks unconditionally at top level - NEVER inside conditionals
  const processor = useVideoProcessor();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [chatFullScreen, setChatFullScreen] = useState(false);
  const [fullScreenTutorMode, setFullScreenTutorMode] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Extract standardized videoId to pass to other hooks
  const videoId = useMemo(() => {
    return (
      processor.downloadState.response?.video_id ||
      processor.downloadState.response?.pdf_id ||
      processor.downloadState.response?.job_id
    );
  }, [processor.downloadState.response]);

  const videoTitle = useMemo(() => {
    return (
      processor.downloadState.response?.video_title ||
      processor.downloadState.response?.title ||
      ""
    );
  }, [processor.downloadState.response]);

  const chat = useChat(videoId, videoTitle);
  const notes = useNotes(videoId, videoTitle, processor.activeMode);

  // Check auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      const hasToken = await ensureAuthSession();
      if (!hasToken) {
        router.replace("/login");
      } else {
        setIsAuthorized(true);
      }
      setIsAuthChecked(true);
    };

    void checkAuth();
  }, [router]);

  const handleLogout = async () => {
    await logout();
    localStorage.removeItem("vidsage_returning_user");
    router.replace("/login");
  };

  // Don't render UI until auth check is complete
  if (!isAuthChecked) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-300 text-center">
          <div className="w-10 h-10 border-2 border-slate-600 border-t-amber-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p>Verifying authentication...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  const renderMarkdownAnswer = (text: string) => (
    <div className="prose prose-invert max-w-none whitespace-pre-wrap leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:text-blue-100 font-semibold underline decoration-blue-500/30 underline-offset-4">
              {children}
            </a>
          ),
        }}
      >
        {normalizeMathMarkdown(text, videoId)}
      </ReactMarkdown>
    </div>
  );

  const renderLatexAnswer = (latex: string) => {
    let html = "";
    try {
      html = katex.renderToString(latex, { throwOnError: false, displayMode: true });
    } catch (e) {
      html = `<pre className="text-sm text-red-300">LaTeX render error:\n${String(e)}</pre>`;
    }
    return <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
  };

  if (processor.stage === "empty") {
    return (
      <>
        <LandingView processor={processor} fileInputRef={fileInputRef} audioInputRef={audioInputRef} />
        <HistoryModal 
          isOpen={isHistoryOpen} 
          onClose={() => setIsHistoryOpen(false)}
          sessions={Object.values(chat.allSessions)}
          onSelectSession={(session) => {
            setIsHistoryOpen(false);
            // Load the video metadata
            processor.loadSession(session.videoId || session.id, session.title);
            // Restore the session messages
            chat.restoreSession(session);
            setIsChatOpen(true);
          }}
          onDeleteSession={chat.deleteSessionHistory}
          onSaveSession={chat.toggleSaveSession}
        />
      </>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden text-white font-sans bg-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-amber-500/10 blur-[100px] animate-blob mix-blend-screen" />
        <div className="absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full bg-emerald-500/10 blur-[100px] animate-blob mix-blend-screen" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative z-10 flex flex-col h-screen">
        {processor.stage === "processing" && (
          <div className="h-1 w-full bg-amber-500/20 absolute top-0 z-50">
            <div className="h-full w-1/3 animate-pulse bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
          </div>
        )}

        <DashboardHeader
          videoUrl={processor.videoUrl} setVideoUrl={processor.setVideoUrl}
          inputMode={processor.inputMode} setInputMode={processor.setInputMode}
          pdfFile={processor.pdfFile} setPdfFile={processor.setPdfFile}
          audioFile={processor.audioFile} setAudioFile={processor.setAudioFile}
          stage={processor.stage} handleProcessVideo={processor.processVideo}
          resetSession={processor.resetSession}
          fileInputRef={{ current: null } as any} audioInputRef={{ current: null } as any}
          onOpenHistory={() => setIsHistoryOpen(true)}
          onLogout={handleLogout}
        />

        <main className="flex-1 overflow-y-auto px-6 pb-10 custom-scrollbar">
          {processor.stage === "processing" && (
            <div className="mt-24 flex flex-col items-center justify-center animate-fade-in w-full max-w-3xl mx-auto">
              <ProcessingLoader 
                  inputMode={processor.inputMode} 
                  audioJobId={processor.audioJobId} 
                  audioProgress={processor.audioProgress} 
                  audioStatus={processor.audioStatus} 
                  audioElapsed={processor.audioElapsed} 
                  audioEstimated={processor.audioEstimated} 
              />
            </div>
          )}

          {processor.stage === "ready" && (
            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start pt-6 h-full min-h-[75vh]">
              
              <div className="sticky top-6">
                <DashboardSidebar
                  videoId={videoId} videoTitle={videoTitle} source={processor.downloadState.response?.source || "unknown"}
                  inputMode={processor.inputMode} activeMode={processor.activeMode} setActiveMode={processor.setActiveMode}
                  isProcessing={processor.isProcessing} handleForceWhisper={() => processor.processVideo({ forceWhisper: true })}
                  transcriptLength={processor.transcriptText.length} audioJobId={processor.audioJobId} audioStatus={processor.audioStatus}
                  isSaved={chat.sessionId ? !!chat.allSessions[chat.sessionId]?.saved : false}
                  onToggleSave={() => { if (chat.sessionId) chat.toggleSaveSession(chat.sessionId); }}
                />
              </div>

              <div className="flex flex-col rounded-3xl h-full shadow-2xl relative overflow-hidden bg-slate-900/40 border border-white/5">
                {processor.activeMode === "progress" && (
                  <ProgressView inputMode={processor.inputMode} audioProgress={processor.audioProgress} isAudioDone={processor.isAudioDone} audioStatus={processor.audioStatus} audioElapsed={processor.audioElapsed} audioEstimated={processor.audioEstimated} setActiveMode={processor.setActiveMode} />
                )}
                {processor.activeMode === "transcript" && (
                  <TranscriptView 
                    transcriptText={processor.transcriptText} 
                    setTranscriptText={processor.setTranscriptText as any} 
                    inputMode={processor.inputMode} 
                    pdfFile={processor.pdfFile}
                  />
                )}
                {processor.activeMode === "notes" && (
                  <NotesView
                    videoId={videoId} notesFormat={notes.notesFormat} setNotesFormat={notes.setNotesFormat}
                    notesLoading={notes.notesLoading} notesNotebook={notes.notesNotebook} notesError={notes.notesError}
                    fetchMasterclassNotes={notes.fetchMasterclassNotes} downloadNotesNotebook={notes.downloadNotesNotebook}
                    downloadNotesHtml={notes.downloadNotesHtml} downloadNotesPdfBackend={notes.downloadNotesPdfBackend}
                    openInOverleaf={notes.openInOverleaf} downloadNotesLatex={notes.downloadNotesLatex} getNotesLatex={notes.getNotesLatex as any} printNotesPdf={notes.printNotesPdf}
                  />
                )}
                {processor.activeMode === "mindmap" && (
                  <MindMapView videoId={videoId!} />
                )}
                {processor.activeMode === "summary" && (
                  <SummaryView videoId={videoId!} />
                )}

                {/* Integrated Chat Panel Overlay */}
                <div
                  className={`absolute inset-0 z-40 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    isChatOpen 
                      ? "opacity-100 translate-y-0" 
                      : "opacity-0 translate-y-8 pointer-events-none"
                  }`}
                >
                  <div className="h-full w-full bg-slate-950/95 backdrop-blur-xl flex flex-col pt-2 pr-2">
                    <ChatWindow
                      title="Sage Assistant" subtitle="AI Copilot" isFullScreen={false} onToggleFullScreen={() => setChatFullScreen(true)}
                      chatHistory={chat.chatHistory} chatIndex={chat.chatIndex} chatQuestion={chat.chatQuestion}
                      setChatQuestion={chat.setChatQuestion} chatLoading={chat.chatLoading} askQuestion={chat.askQuestion}
                      clearChatHistory={chat.clearChatHistory} suggestedQuestions={processor.suggestedQuestions}
                      renderMarkdownAnswer={renderMarkdownAnswer} renderLatexAnswer={renderLatexAnswer} chatContainerRef={chat.chatContainerRef}
                      chatLanguage={chat.chatLanguage} setChatLanguage={chat.setChatLanguage}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Floating Chat Button */}
      {processor.stage === "ready" && (
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`fixed bottom-8 right-8 z-[60] flex h-16 w-16 items-center justify-center rounded-full shadow-2xl transition-all duration-300 transform hover:scale-105 ${
            isChatOpen
              ? "bg-slate-800 text-white rotate-90 border border-white/10"
              : "bg-emerald-500 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)]"
          }`}
          aria-label="Toggle AI Assistant"
          title="Open Sage AI Assistant"
        >
          {isChatOpen ? <X className="h-6 w-6 -rotate-90 transition-transform" /> : <Bot className="h-8 w-8" />}
        </button>
      )}

      <div className={"fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-xl p-4 md:p-8 transition-opacity duration-300 " + (chatFullScreen ? "opacity-100" : "opacity-0 pointer-events-none")}>
        <div className={"flex overflow-hidden rounded-[2rem] bg-slate-900 border border-white/5 shadow-2xl w-full max-w-7xl h-[90vh] transition-transform duration-300 transform " + (chatFullScreen ? "scale-100" : "scale-[0.98]")}>
          
          {fullScreenTutorMode && processor.inputMode !== 'pdf' && (
            <div className="w-[45%] border-r border-white/5 p-8 overflow-y-auto bg-slate-950/40">
              <h3 className="text-xl font-bold tracking-tight text-white mb-6 border-b border-white/5 pb-4">Source Material</h3>
              <div className="prose prose-invert max-w-none text-slate-300">
                {processor.transcriptText ? <ReactMarkdown>{processor.transcriptText}</ReactMarkdown> : <p>Empty source.</p>}
              </div>
            </div>
          )}

          <div className={`${fullScreenTutorMode && processor.inputMode !== 'pdf' ? "w-[55%]" : "w-full"} p-0`}>
            <ChatWindow
              title="Sage Assistant (Focus Mode)" subtitle="" isFullScreen={true} onToggleFullScreen={() => setChatFullScreen(false)}
              chatHistory={chat.chatHistory} chatIndex={chat.chatIndex} chatQuestion={chat.chatQuestion}
              setChatQuestion={chat.setChatQuestion} chatLoading={chat.chatLoading} askQuestion={chat.askQuestion}
              clearChatHistory={chat.clearChatHistory} suggestedQuestions={processor.suggestedQuestions}
              renderMarkdownAnswer={renderMarkdownAnswer} renderLatexAnswer={renderLatexAnswer} chatContainerRef={chat.chatContainerRef}
              fullScreenTutorMode={fullScreenTutorMode} onToggleTutorMode={processor.inputMode === 'pdf' ? undefined : () => setFullScreenTutorMode(p => !p)}
              chatLanguage={chat.chatLanguage} setChatLanguage={chat.setChatLanguage}
            />
          </div>

        </div>
      </div>

      <HistoryModal 
        isOpen={isHistoryOpen} 
        onClose={() => setIsHistoryOpen(false)}
        sessions={Object.values(chat.allSessions)}
        onSelectSession={(session) => {
          setIsHistoryOpen(false);
          // Load the video metadata
          processor.loadSession(session.videoId || session.id, session.title);
          // Restore the session messages
          chat.restoreSession(session);
          setIsChatOpen(true);
        }}
        onDeleteSession={chat.deleteSessionHistory}
        onSaveSession={chat.toggleSaveSession}
      />
    </div>
  );
}
