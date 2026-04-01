export interface VideoDownloadState {
  status: "idle" | "loading" | "done" | "error";
  error?: string;
  response?: any; // Replace with an exact interface once known
}

export interface ChatMessage {
  question: string;
  answer: string;
  format: "markdown" | "latex";
}

export type InputMode = "youtube" | "pdf" | "audio";
export type DashboardStage = "empty" | "processing" | "ready";
export type ActiveMode = "transcript" | "notes" | "progress";
export type NotesFormat = "markdown" | "latex";
