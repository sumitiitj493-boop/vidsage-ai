import { linkifyTimestamps } from "./formatters";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";

const looksLikeMath = (value: string) => {
  // Be strictly conservative: only match explicit math commands or standalone formulas
  return /\\(?:frac|sqrt|sum|int|lim|log|ln|sin|cos|tan|pm|cdot|times|alpha|beta|gamma|delta|theta|mu|sigma|pi)\b/.test(value);
};

export const normalizeMathMarkdown = (text: string, videoId?: string) => {
  // Convert output into clean Markdown.
  // Keep the LLM's math delimiters intact whenever possible so remark-math can parse them.
  const withLinks = videoId ? linkifyTimestamps(text, videoId) : text;

  // Remove invisible unicode that can confuse the parser, but do not strip math symbols.
  let cleaned = withLinks.replace(/\u2061/g, "");

  // Normalize common LaTeX math delimiters into markdown-friendly forms.
  cleaned = cleaned
    .replace(/\\\[([\s\S]+?)\\\]/g, (_match: string, expr: string) => `\n\n$$\n${String(expr).trim()}\n$$\n\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_match: string, expr: string) => `$${String(expr).trim()}$`);

  return cleaned;
};

// Safe markdown to HTML conversion for non-React contexts
export const convertMarkdownToHtmlStr = (markdown: string) => {
  try {
    const result = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkRehype)
      .use(rehypeKatex)
      .use(rehypeHighlight)
      .use(rehypeStringify)
      .processSync(markdown);
    return String(result);
  } catch (err) {
    console.error("Markdown parsing error", err);
    return `<pre>${markdown}</pre>`;
  }
};
