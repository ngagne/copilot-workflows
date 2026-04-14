import { marked } from 'marked';
import hljs from 'highlight.js';

/**
 * Custom renderer that adds syntax highlighting to code blocks.
 */
const renderer = new marked.Renderer();

renderer.code = ({ text, lang }) => {
  let highlighted = text;

  if (lang && hljs.getLanguage(lang)) {
    try {
      highlighted = hljs.highlight(text, { language: lang }).value;
    } catch {
      // Fall through to auto
    }
  } else {
    try {
      highlighted = hljs.highlightAuto(text).value;
    } catch {
      // Use original code if highlighting fails
    }
  }

  const langClass = lang ? ` class="hljs language-${lang}"` : ' class="hljs"';
  const langAttr = lang ? ` data-language="${lang}"` : '';

  return `<pre><code${langClass}${langAttr}>${highlighted}</code></pre>`;
};

/**
 * Parse markdown to HTML with syntax highlighting support.
 */
export function parseMarkdown(content: string): string {
  return marked.parse(content, { renderer }) as string;
}

export { marked };
