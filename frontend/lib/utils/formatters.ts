export const truncateMiddle = (value: string, visibleChars = 8) => {
  if (!value || value.length <= visibleChars * 2) return value;
  return `${value.slice(0, visibleChars)}…${value.slice(-visibleChars)}`;
};

export const parseTimestamp = (ts: string) => {
  const parts = ts.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
};

export const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

export const stripEmojis = (str: string) => {
  // This regex matches most emoji code points
  return str.replace(/[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1FA70}-\u{1FAFF}\u{1F680}-\u{1F6FF}\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "");
};

export const keepEnglishOnly = (str: string) => {
  return str.replace(/[^A-Za-z0-9\s\.,;:!\?\'\"\-\(\)\[\]]+/g, "");
};

export const linkifyTimestamps = (text: string, videoId: string) => {
  // Match timestamps like 0:20, 00:20, 1:02:15 and ranges like 0:20-0:35 or 0:20 - 0:35
  const regex = /(\b\d{1,2}:\d{2}(?::\d{2})?\b)(?:\s*[-–—]\s*(\d{1,2}:\d{2}(?::\d{2})?\b))?/g;
  return text.replace(regex, (match, start, end) => {
    const startSeconds = parseTimestamp(start);
    if (startSeconds === null) return match;

    const link = `https://www.youtube.com/watch?v=${videoId}&t=${startSeconds}s`;
    if (!end) return `[${start}](${link})`;

    const endSeconds = parseTimestamp(end);
    if (endSeconds === null) return `[${start}](${link}) — ${end}`;

    // Render range as two clickable timestamps (start + end)
    return `[${start}](${link}) – [${end}](https://www.youtube.com/watch?v=${videoId}&t=${endSeconds}s)`;
  });
};
