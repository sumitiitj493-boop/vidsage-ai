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

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}

export type InputMode = "youtube" | "pdf" | "audio";
export type DashboardStage = "empty" | "processing" | "ready";
export type ActiveMode = "transcript" | "notes" | "progress" | "mindmap" | "summary";
export type NotesFormat = "markdown" | "latex";
