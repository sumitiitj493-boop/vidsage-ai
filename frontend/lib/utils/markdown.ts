import katex from "katex";
import { linkifyTimestamps } from "./formatters";

export const normalizeMathMarkdown = (text: string, videoId?: string) => {
  // Convert output into clean Markdown that separates math from descriptive text.
  // Math is rendered inline using $...$ so surrounding text remains normal.
  const withLinks = videoId ? linkifyTimestamps(text, videoId) : text;

  const normalizeSpokenMath = (input: string) =>
    input
      .replace(/\bsine squared\s+([A-Za-z0-9])/gi, "\\sin^2 $1")
      .replace(/\bsine squared\b/gi, "\\sin^2")
      .replace(/\bsine\b/gi, "\\sin")
      .replace(/\bcos\b/gi, "\\cos")
      .replace(/\bcosine\b/gi, "\\cos")
      .replace(/\btan\b/gi, "\\tan")
      .replace(/\btangent\b/gi, "\\tan")
      .replace(/\btheta\b/gi, "\\theta")
      .replace(/\bpi\b/gi, "\\pi")
      .replace(/\bdelta\b/gi, "\\delta");

  const normalizeCasualEquation = (line: string) =>
    line
      .replace(/\bis\b/gi, "=")
      .replace(/\bequals\b/gi, "=")
      .replace(/\bplus\b/gi, "+")
      .replace(/\bminus\b/gi, "-")
      .replace(/\btimes\b/gi, "*")
      .replace(/\bdivided by\b/gi, "/")
      .replace(/\bover\b/gi, "/");

  const normalizeFraction = (line: string) =>
    line.replace(/\b(\d+)\s*\/\s*(\d+)\b/g, "\\frac{$1}{$2}");

  const normalizeTrig = (line: string) =>
    line
      .replace(/\\cos\s*(\d+)x/gi, "\\cos($1x)")
      .replace(/\\sin\s*(\d+)x/gi, "\\sin($1x)");

  // Simplify common formatting patterns into nicer LaTeX.
  const normalizeCommonIdentities = (line: string) =>
    line
      .replace(/\\frac\{1\}\{2\}\s*\*\s*1\s*-\s*\\cos\((\d+)x\)/gi, "\\frac{1-\\cos($1x)}{2}")
      .replace(/\\frac\{1\}\{2\}\s*\*\s*1\s*-\s*\\cos\s*(\d+)x/gi, "\\frac{1-\\cos($1x)}{2}");

  const stripDollarSigns = (line: string) =>
    line.replace(/\$/g, "").replace(/\u2061/g, ""); // remove stray $ and invisible function-application chars

  const wrapMathInLine = (line: string) => {
    // Remove any stray dollar-sign delimiters.
    const cleaned = stripDollarSigns(line);

    // Protect URLs from being accidentally converted into math by our regexes.
    const urlRegex = /https?:\/\/[\w\-\.\/%&=\?\+\#]+/g;
    const urls: string[] = [];
    const placeholder = (match: string) => {
      const key = `__URL_${urls.length}__`;
      urls.push(match);
      return key;
    };
    const withoutUrls = cleaned.replace(urlRegex, placeholder);

    const shouldConvert = /\b(sin|cos|tan|log|ln|\d+\/\d+|\^|=)\b/i.test(withoutUrls);
    if (!shouldConvert) return cleaned;

    const normalized = normalizeSpokenMath(normalizeCasualEquation(withoutUrls));
    const fractioned = normalizeFraction(normalized);
    const trigged = normalizeTrig(fractioned);
    const simplified = normalizeCommonIdentities(trigged);

    const wrapWithDollar = (text: string, regex: RegExp) =>
      text
        .split("$")
        .map((segment, idx) => {
          if (idx % 2 === 1) return segment; // already inside math
          return segment.replace(regex, (m) => `$${m}$`);
        })
        .join("$");

    const mathRegex = /[A-Za-z0-9\\][A-Za-z0-9\\^_{}()]*\s*(?:[+\-*/^]\s*[A-Za-z0-9\\][A-Za-z0-9\\^_{}()]*)+/g;

    let out = simplified;
    out = wrapWithDollar(out, /\\frac\{[^}]+\}\{[^}]+\}/g);
    out = wrapWithDollar(out, /\\(?:sin|cos|tan|log|ln|theta|pi|delta)(?:\^\d+)?\s*[A-Za-z0-9()]+/g);
    out = wrapWithDollar(out, mathRegex);

    urls.forEach((url, idx) => {
      out = out.replace(`__URL_${idx}__`, url);
    });

    return out;
  };

  return withLinks
    .split("\n")
    .flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed) return [line];
      return [wrapMathInLine(line)];
    })
    .join("\n");
};

// Safe markdown to HTML conversion for non-React contexts
export const convertMarkdownToHtmlStr = (markdown: string) => {
  const escapeHtml = (text: string) =>
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const renderMathInline = (text: string) => {
    try {
      return katex.renderToString(text, { displayMode: false, throwOnError: false });
    } catch {
      return escapeHtml(`$${text}$`);
    }
  };

  const renderMathBlock = (text: string) => {
    try {
      return katex.renderToString(text, { displayMode: true, throwOnError: false });
    } catch {
      return escapeHtml(`$$${text}$$`);
    }
  };

  const renderString = (raw: string) => {
    const pattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
    let result = "";
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(raw))) {
      result += escapeHtml(raw.substring(lastIndex, match.index));
      if (match[1]) {
        result += renderMathBlock(match[1]);
      } else if (match[2]) {
        result += renderMathInline(match[2]);
      }
      lastIndex = match.index + match[0].length;
    }

    result += escapeHtml(raw.substring(lastIndex));
    return result
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  };

  const lines = markdown.split("\n");
  let html = "";
  let inList = false;

  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      html += "<br/>";
      return;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      const level = Math.min(6, headingMatch[1].length);
      html += `<h${level}>${renderString(headingMatch[2])}</h${level}>`;
      return;
    }

    const listMatch = line.match(/^[-*+]\s+(.+)$/);
    if (listMatch) {
      if (!inList) {
        inList = true;
        html += "<ul>";
      }
      let itemText = listMatch[1].trim();
      itemText = itemText.replace(/^[-*+]\s+/, "");
      html += `<li>${renderString(itemText)}</li>`;
      return;
    }

    closeList();
    html += `<p>${renderString(line)}</p>`;
  });

  closeList();
  return html;
};
