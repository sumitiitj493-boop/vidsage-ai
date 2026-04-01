"use client";

import { useState, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import katex from "katex";
import { Maximize2, Minimize2 } from "lucide-react";

import { useVideoProcessor } from "../hooks/useVideoProcessor";
import { useChat } from "../hooks/useChat";
import { useNotes } from "../hooks/useNotes";
import { normalizeMathMarkdown } from "../lib/utils/markdown";
import { linkifyTimestamps } from "../lib/utils/formatters";

import DashboardHeader from "./dashboard/Header";
import DashboardSidebar from "./dashboard/Sidebar";
import ProgressView from "./dashboard/ProgressView";
import TranscriptView from "./dashboard/TranscriptView";
import NotesView from "./dashboard/NotesView";
import ChatWindow from "./dashboard/ChatWindow";
import LandingView from "./dashboard/LandingView";
import ProcessingLoader from "./dashboard/ProcessingLoader";

export default function Dashboard() {
  const processor = useVideoProcessor();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

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

  const chat = useChat(videoId);
  const notes = useNotes(videoId, videoTitle, processor.activeMode);

  const [chatFullScreen, setChatFullScreen] = useState(false);
  const [fullScreenTutorMode, setFullScreenTutorMode] = useState(false);

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
    return <LandingView processor={processor} fileInputRef={fileInputRef} audioInputRef={audioInputRef} />;
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
            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_380px] gap-6 items-start pt-6 h-full min-h-[75vh]">
              
              <div className="sticky top-6">
                <DashboardSidebar
                  videoId={videoId} videoTitle={videoTitle} source={processor.downloadState.response?.source || "unknown"}
                  inputMode={processor.inputMode} activeMode={processor.activeMode} setActiveMode={processor.setActiveMode}
                  isProcessing={processor.isProcessing} handleForceWhisper={() => processor.processVideo({ forceWhisper: true })}
                  transcriptLength={processor.transcriptText.length} audioJobId={processor.audioJobId} audioStatus={processor.audioStatus}
                />
              </div>

              <div className="flex flex-col rounded-3xl h-full shadow-2xl relative">
                {processor.activeMode === "progress" && (
                  <ProgressView inputMode={processor.inputMode} audioProgress={processor.audioProgress} isAudioDone={processor.isAudioDone} audioStatus={processor.audioStatus} audioElapsed={processor.audioElapsed} audioEstimated={processor.audioEstimated} setActiveMode={processor.setActiveMode} />
                )}
                {processor.activeMode === "transcript" && (
                  <TranscriptView transcriptText={processor.transcriptText} setTranscriptText={processor.setTranscriptText as any} />
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
              </div>

              <div className="sticky top-6 h-[75vh]">
                <ChatWindow
                  title="Sage Assistant" subtitle="AI Copilot" isFullScreen={false} onToggleFullScreen={() => setChatFullScreen(true)}
                  chatHistory={chat.chatHistory} chatIndex={chat.chatIndex} chatQuestion={chat.chatQuestion}
                  setChatQuestion={chat.setChatQuestion} chatLoading={chat.chatLoading} askQuestion={chat.askQuestion}
                  clearChatHistory={chat.clearChatHistory} suggestedQuestions={processor.suggestedQuestions}
                  renderMarkdownAnswer={renderMarkdownAnswer} renderLatexAnswer={renderLatexAnswer} chatContainerRef={chat.chatContainerRef}
                />
              </div>
            </div>
          )}
        </main>
      </div>

      <div className={"fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xl p-4 md:p-8 transition-opacity duration-300 " + (chatFullScreen ? "opacity-100" : "opacity-0 pointer-events-none")}>
        <div className={"flex overflow-hidden rounded-[2rem] bg-slate-900 border border-white/5 shadow-2xl w-full max-w-7xl h-[90vh] transition-transform duration-300 transform " + (chatFullScreen ? "scale-100" : "scale-[0.98]")}>
          
          {fullScreenTutorMode && (
            <div className="w-[45%] border-r border-white/5 p-8 overflow-y-auto bg-slate-950/40">
              <h3 className="text-xl font-bold tracking-tight text-white mb-6 border-b border-white/5 pb-4">Source Material</h3>
              <div className="prose prose-invert max-w-none text-slate-300">
                {processor.transcriptText ? <ReactMarkdown>{processor.transcriptText}</ReactMarkdown> : <p>Empty source.</p>}
              </div>
            </div>
          )}

          <div className={`${fullScreenTutorMode ? "w-[55%]" : "w-full"} p-0`}>
            <ChatWindow
              title="Sage Assistant (Focus Mode)" subtitle="" isFullScreen={true} onToggleFullScreen={() => setChatFullScreen(false)}
              chatHistory={chat.chatHistory} chatIndex={chat.chatIndex} chatQuestion={chat.chatQuestion}
              setChatQuestion={chat.setChatQuestion} chatLoading={chat.chatLoading} askQuestion={chat.askQuestion}
              clearChatHistory={chat.clearChatHistory} suggestedQuestions={processor.suggestedQuestions}
              renderMarkdownAnswer={renderMarkdownAnswer} renderLatexAnswer={renderLatexAnswer} chatContainerRef={chat.chatContainerRef}
              fullScreenTutorMode={fullScreenTutorMode} onToggleTutorMode={() => setFullScreenTutorMode(p => !p)}
            />
          </div>

        </div>
      </div>
    </div>
  );
}
