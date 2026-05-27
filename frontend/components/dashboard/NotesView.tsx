import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { normalizeMathMarkdown } from "../../lib/utils/markdown";
import { NotesFormat } from "../../lib/types/dashboard";
import { Loader2, Play } from "lucide-react";
import { authFetch, getApiBase } from "../../lib/auth";

interface NotesViewProps {
  videoId: string | undefined | null;
  notesFormat: NotesFormat;
  setNotesFormat: (format: NotesFormat) => void;
  notesLoading: boolean;
  notesNotebook: any;
  notesError: string | null;
  fetchMasterclassNotes: () => void;
  downloadNotesNotebook: () => void;
  downloadNotesHtml: () => void;
  downloadNotesPdfBackend: () => Promise<void>;
  openInOverleaf: () => void;
  downloadNotesLatex: () => void;
  getNotesLatex: () => string;
  printNotesPdf: () => void;
}

export default function NotesView({
  videoId, notesFormat, setNotesFormat, notesLoading, notesNotebook, notesError,
  fetchMasterclassNotes, downloadNotesNotebook, downloadNotesHtml,
  downloadNotesPdfBackend, openInOverleaf, downloadNotesLatex, getNotesLatex,
  printNotesPdf
}: NotesViewProps) {  const [latexCode, setLatexCode] = useState<string>("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);

  useEffect(() => {
    if (notesFormat === "latex" && notesNotebook) {
      setLatexCode(getNotesLatex());
    }
  }, [notesFormat, notesNotebook, getNotesLatex]);

  const handleCompileLatex = async () => {
    if (!latexCode.trim()) return;
    setIsCompiling(true);
    setPdfUrl(null);
    try {
      const res = await authFetch(`${getApiBase()}/api/notes/compile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex_code: latexCode })
      });
      if (!res.ok) {
        let errStr = "Failed to compile.";
        try { const errObj = await res.json(); errStr = errObj.detail || errStr; } catch(e) {}
        throw new Error(errStr);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (e: any) {
      alert("Error compiling locally: " + e.message);
    } finally {
      setIsCompiling(false);
    }
  };
  return (
    <main className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-2xl shadow-xl shadow-black/30">
      <div className="rounded-2xl bg-gradient-to-r from-[#0d1117] via-[#161b22] to-[#1a1f29] border-l-4 border-purple-400 p-6 shadow-lg shadow-purple-500/10 mb-6">
        <h2 className="text-2xl font-semibold text-white">Masterclass Notes</h2>
        <p className="mt-2 text-sm text-purple-200 opacity-80">AI-generated smart notes. Extracted directly from your content.</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-6 text-sm text-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wide">
              Format
              <select
                value={notesFormat}
                onChange={(e) => setNotesFormat(e.target.value as "markdown" | "latex")}
                className="ml-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 focus:outline-none focus:border-purple-400 text-sm normal-case focus:ring-2 focus:ring-purple-400/20"
              >
                <option value="markdown">Markdown</option>
                <option value="latex">LaTeX</option>
              </select>
            </label>
            <button
              type="button"
              onClick={fetchMasterclassNotes}
              disabled={!videoId || notesLoading}
              className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-950 shadow-md shadow-emerald-500/20 transition-all hover:bg-emerald-400 disabled:opacity-50"
            >
              {notesLoading
                ? "Generating..."
                : notesNotebook
                ? "Regenerate"
                : "Generate"}
            </button>
          </div>

          {notesNotebook && (
            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
              <button onClick={downloadNotesNotebook} className="btn-secondary rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/10 hover:border-purple-400/30 transition-all text-slate-300">.ipynb</button>
              <button onClick={downloadNotesHtml} className="btn-secondary rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/10 hover:border-purple-400/30 transition-all text-slate-300">HTML</button>
              <button onClick={downloadNotesPdfBackend} className="btn-secondary rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/10 hover:border-purple-400/30 transition-all text-slate-300">PDF</button>
              <button onClick={downloadNotesLatex} className="btn-secondary rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/10 hover:border-purple-400/30 transition-all text-slate-300">LaTeX</button>
              <button onClick={openInOverleaf} className="btn-secondary rounded-lg bg-[#47a141]/20 border border-[#47a141]/40 text-[#47a141] hover:bg-[#47a141]/30 px-3 py-1.5 text-xs font-medium transition-all">Overleaf</button>
              <button onClick={printNotesPdf} className="btn-secondary rounded-lg bg-white/10 border border-white/20 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 transition-all">Print</button>
              <button
                onClick={() => {
                  const latex = getNotesLatex();
                  if (latex) navigator.clipboard.writeText(latex);
                }}
                className="btn-secondary rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/10 transition-all text-slate-300"
              >
                Copy LaTeX
              </button>
            </div>
          )}
        </div>

        {notesError && (
          <div className="text-sm font-semibold tracking-wide text-red-300 bg-red-500/10 p-4 border-l-4 border-red-500 rounded-md mb-4 shadow-sm shadow-red-500/10">
            Error generating notes: {notesError}
          </div>
        )}

        {notesLoading && (
          <div className="w-full bg-slate-800/50 rounded-full h-1.5 mb-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 bg-gradient-to-r from-purple-600 to-emerald-400 h-1.5 rounded-full shadow-[0_0_10px_purple] transition-all" style={{ animation: 'fillProgress 30s ease-out forwards' }}></div>
            <style>{`
              @keyframes fillProgress {
                0% { width: 0%; }
                20% { width: 45%; }
                50% { width: 75%; }
                80% { width: 88%; }
                100% { width: 95%; }
              }
            `}</style>
          </div>
        )}

        <div className="max-h-[65vh] overflow-y-auto pr-4 custom-scrollbar">
          {notesNotebook ? (
            notesFormat === "latex" ? (
              <div className="flex flex-col lg:flex-row h-[60vh] w-full gap-4 relative">
                {/* LaTeX Code Editor Pane */}
                <div className="flex-1 min-w-[300px] flex flex-col bg-[#1e1e1e] border border-white/10 rounded-xl overflow-hidden shadow-inner">
                  <div className="bg-[#2d2d2d] px-4 py-2 border-b border-black/40 flex justify-between items-center">
                    <span className="text-xs font-mono font-medium text-emerald-400">masterclass.tex</span>
                    <button
                      onClick={handleCompileLatex}
                      disabled={isCompiling}
                      className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition-all disabled:opacity-50"
                    >
                      {isCompiling ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                      {isCompiling ? "Compiling..." : "Compile PDF"}
                    </button>
                  </div>
                  <textarea
                    value={latexCode}
                    onChange={(e) => setLatexCode(e.target.value)}
                    spellCheck={false}
                    className="flex-1 w-full p-4 bg-transparent text-[#d4d4d4] font-mono text-[13px] leading-relaxed resize-none focus:outline-none custom-scrollbar"
                  />
                </div>

                {/* PDF Viewer Pane */}
                <div className="flex-1 min-w-[300px] bg-white/5 border border-white/10 rounded-xl flex items-center justify-center relative overflow-hidden backdrop-blur-sm">
                  {pdfUrl ? (
                    <iframe
                      src={pdfUrl}
                      className="w-full h-full bg-white"
                      title="Compiled LaTeX PDF"
                    />
                  ) : isCompiling ? (
                    <div className="flex flex-col items-center text-slate-300 gap-3 p-6 text-center">
                      <Loader2 size={32} className="animate-spin text-purple-400" />
                      <span className="text-sm font-medium animate-pulse">Running \pdflatex cloud compiler...</span>
                    </div>
                  ) : (
                    <div className="text-center p-6 text-slate-400 border border-dashed border-white/10 rounded-xl m-8">
                      <p className="font-semibold text-lg text-slate-300 mb-1">Live LaTeX Preview</p>
                      <p className="text-sm text-center">Click &quot;Compile PDF&quot; above to generate the final LaTeX document and preview it flawlessly without external apps.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
            <div className="prose prose-invert max-w-none 
                prose-headings:text-purple-400 prose-headings:font-bold 
                prose-h1:border-b prose-h1:border-slate-800 prose-h1:pb-3 prose-h1:text-3xl
                prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-6 prose-h2:border-b prose-h2:border-purple-500/20 prose-h2:pb-2
                prose-h3:text-purple-300 prose-h3:text-xl prose-h3:mt-10 prose-h3:mb-4
                prose-h4:text-emerald-400 prose-h4:text-lg prose-h4:mt-8 prose-h4:mb-3
                prose-a:text-emerald-400 hover:prose-a:text-emerald-300
                prose-strong:text-emerald-400 prose-strong:font-bold
                prose-em:text-violet-300
                prose-blockquote:border-l-4 prose-blockquote:border-l-purple-500 prose-blockquote:bg-purple-500/10 prose-blockquote:px-5 prose-blockquote:py-4 prose-blockquote:rounded-r-xl prose-blockquote:not-italic prose-blockquote:shadow-lg hover:prose-blockquote:bg-purple-500/20 prose-blockquote:transition-all prose-blockquote:text-slate-200 prose-blockquote:my-8
                prose-table:w-full prose-table:overflow-hidden prose-table:rounded-2xl prose-table:shadow-2xl prose-table:border prose-table:border-purple-500/20 prose-table:border-collapse prose-table:my-10 prose-table:bg-slate-900/50 hover:prose-table:border-purple-500/50 hover:prose-table:shadow-purple-500/10 prose-table:transition-all prose-table:duration-500
                prose-th:bg-gradient-to-r prose-th:from-purple-700/90 prose-th:to-purple-500/90 prose-th:p-5 prose-th:text-left prose-th:text-white prose-th:font-extrabold prose-th:tracking-wider prose-th:uppercase prose-th:text-sm prose-th:border prose-th:border-slate-600/60
                prose-td:px-5 prose-td:py-4 prose-td:border prose-td:border-slate-600/50 prose-td:text-slate-200
                prose-tr:even:bg-slate-800/50 prose-tr:odd:bg-transparent
                prose-tr:hover:bg-slate-700/50 prose-tr:transition-colors
                prose-li:marker:text-purple-500 prose-li:my-3 prose-li:text-slate-200
                prose-p:my-5 prose-p:text-slate-200
                prose-code:text-pink-400 prose-code:bg-pink-500/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:font-mono prose-code:text-sm prose-code:font-semibold prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-slate-900 prose-pre:border prose-pre:border-white/10 prose-pre:shadow-lg
                prose-hr:border-slate-800 prose-hr:my-10
                text-slate-200 leading-loose text-[1.05rem] tracking-wide">
              {notesNotebook.cells?.map((cell: any, idx: number) => {
                const cellText = Array.isArray(cell.source) ? cell.source.join("") : String(cell.source);
                const sanitizedCellText = cellText
                  .split("\n")
                  .filter((line: string) => !/^\s*-?\s*Timestamp\s*[:=]/i.test(line))
                  .filter((line: string) => !/^\s*Segment\s*\(.*\)/i.test(line))
                  .join("\n");
                return (
                  <div key={idx} className="notebook-cell bg-slate-950/40 p-1 md:p-3 mb-6 shadow-sm">
                    <ReactMarkdown
                      remarkPlugins={[remarkMath, remarkGfm]}
                      rehypePlugins={[rehypeKatex, rehypeRaw] as any}
                      components={({
                        card: ({node, children, ...props}: any) => (
                          <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/80 border border-slate-700/50 p-6 my-6 rounded-2xl shadow-xl hover:shadow-indigo-500/20 hover:border-indigo-400/30 transition-all duration-300 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&>ul]:m-0 [&>ol]:m-0 [&_li]:my-1" {...props}>
                            {children}
                          </div>
                        ),
                        tip: ({node, children, ...props}: any) => (
                          <div className="bg-violet-950/40 border-l-4 border-violet-500 p-6 my-6 rounded-r-xl shadow-xl hover:shadow-violet-500/10 transition-all duration-300 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&>ul]:m-0 [&>ol]:m-0 [&_li]:my-1" {...props}>
                            <div className="text-violet-300 font-extrabold mb-3 flex items-center gap-2 text-lg">💡 Pro Tip</div>
                            <div className="text-slate-200">{children}</div>
                          </div>
                        ),
                        warning: ({node, children, ...props}: any) => (
                          <div className="bg-red-950/40 border-l-4 border-red-500 p-6 my-6 rounded-r-xl shadow-xl hover:shadow-red-500/10 transition-all duration-300 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&>ul]:m-0 [&>ol]:m-0 [&_li]:my-1" {...props}>
                            <div className="text-red-400 font-extrabold mb-3 flex items-center gap-2 text-lg">⚠️ Warning</div>
                            <div className="text-slate-200">{children}</div>
                          </div>
                        ),
                        important: ({node, children, ...props}: any) => (
                          <div className="bg-emerald-950/40 border-l-4 border-emerald-500 p-6 my-6 rounded-r-xl shadow-xl hover:shadow-emerald-500/10 transition-all duration-300 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&>ul]:m-0 [&>ol]:m-0 [&_li]:my-1" {...props}>
                            <div className="text-emerald-400 font-extrabold mb-3 flex items-center gap-2 text-lg">🎯 Important Concept</div>
                            <div className="text-slate-200">{children}</div>
                          </div>
                        ),
                      } as any)}
                    >
                      {normalizeMathMarkdown(sanitizedCellText, videoId ?? "")}
                    </ReactMarkdown>
                  </div>
                );
              })}
            </div>
            )
          ) : (
            <div className="py-16 text-center text-slate-500 border-2 border-dashed border-white/5 rounded-xl bg-black/10">
              <p className="text-lg font-medium mb-1 text-slate-400">No notes generated yet.</p>
              <p className="text-sm">Click “Generate notes” to start building your interactive Masterclass Jupyter Notebook.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}