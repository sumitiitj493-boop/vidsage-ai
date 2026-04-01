import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { normalizeMathMarkdown } from "../../lib/utils/markdown";
import { NotesFormat } from "../../lib/types/dashboard";

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
}: NotesViewProps) {
  return (
    <main className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-2xl shadow-xl shadow-black/30">
      <div className="rounded-2xl bg-gradient-to-r from-[#0d1117] via-[#161b22] to-[#1a1f29] border-l-4 border-purple-400 p-6 shadow-lg shadow-purple-500/10 mb-6">
        <h2 className="text-2xl font-semibold text-white">🚀 Masterclass Notes</h2>
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

        <div className="max-h-[65vh] overflow-y-auto pr-4 custom-scrollbar">
          {notesNotebook ? (
            <div className="prose prose-invert max-w-none leading-relaxed prose-headings:text-purple-300 prose-a:text-emerald-400 prose-blockquote:border-purple-500 prose-blockquote:bg-purple-500/10 prose-blockquote:py-1">
              {notesNotebook.cells?.map((cell: any, idx: number) => {
                const cellText = Array.isArray(cell.source) ? cell.source.join("") : String(cell.source);
                const sanitizedCellText = cellText
                  .split("\n")
                  .filter((line: string) => !/^\s*-?\s*Timestamp\s*[:=]/i.test(line))
                  .filter((line: string) => !/^\s*Segment\s*\(.*\)/i.test(line))
                  .join("\n");
                return (
                  <div key={idx} className="notebook-cell bg-black/20 p-5 rounded-xl border border-white/5 mb-4 shadow-sm hover:border-purple-500/30 transition-colors">
                    <ReactMarkdown
                      remarkPlugins={[remarkMath, remarkGfm]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {normalizeMathMarkdown(sanitizedCellText, videoId ?? "")}
                    </ReactMarkdown>
                  </div>
                );
              })}
            </div>
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