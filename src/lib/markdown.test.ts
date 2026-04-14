// Mock marked since it's ESM-only and Jest can't transform it
jest.mock('marked', () => {
  const mockParse = jest.fn((content: string, options?: { renderer?: any }) => {
    if (!content) return '';

    let result = content;

    // If a renderer is provided, simulate code block handling
    if (options?.renderer) {
      // Handle fenced code blocks
      result = result.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
        const langClass = lang ? ` class="hljs language-${lang}"` : ' class="hljs"';
        const langAttr = lang ? ` data-language="${lang}"` : '';
        return `<pre><code${langClass}${langAttr}>${code.trim()}</code></pre>`;
      });
    }

    // Headings
    result = result.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    result = result.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    result = result.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // Bold and italic
    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Inline code
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Links
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    // Unordered lists (simple case)
    if (result.includes('- ') && !result.includes('<ul>')) {
      const items = result.split('\n').filter(line => line.startsWith('- '));
      if (items.length > 0) {
        const listItems = items.map(item => `<li>${item.slice(2)}</li>`).join('');
        result = `<ul>${listItems}</ul>`;
      }
    }
    // Ordered lists
    if (result.match(/^\d+\. /m) && !result.includes('<ol>')) {
      const items = result.split('\n').filter(line => /^\d+\. /.test(line));
      if (items.length > 0) {
        const listItems = items.map(item => `<li>${item.replace(/^\d+\. /, '')}</li>`).join('');
        result = `<ol>${listItems}</ol>`;
      }
    }
    // Blockquotes
    result = result.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    // Horizontal rules
    result = result.replace(/^---$/gm, '<hr>');

    // Wrap in paragraphs if no HTML tags
    if (!result.includes('<')) {
      result = result.split('\n\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('');
    }

    return result;
  });

  const mockRenderer = jest.fn().mockImplementation(() => ({}));

  const mockMarked = {
    parse: mockParse,
    Renderer: mockRenderer,
  };

  return {
    marked: mockMarked,
    default: mockMarked,
  };
});

// Mock highlight.js
jest.mock('highlight.js', () => ({
  default: {
    highlight: jest.fn((code: string, { language }: { language: string }) => ({
      value: `<span class="hljs-${language}">${code}</span>`,
    })),
    highlightAuto: jest.fn((code: string) => ({
      value: `<span class="hljs">${code}</span>`,
    })),
    getLanguage: jest.fn((lang: string) => {
      const known = ['javascript', 'typescript', 'python', 'go', 'rust', 'java', 'ruby', 'json', 'html', 'css', 'bash', 'sql'];
      return known.includes(lang.toLowerCase()) ? lang : null;
    }),
  },
}));

import { parseMarkdown, marked } from '@/src/lib/markdown';

describe('markdown.ts', () => {
  describe('parseMarkdown', () => {
    it('should parse plain text', () => {
      const result = parseMarkdown('Hello world');
      expect(result).toContain('Hello world');
    });

    it('should parse headings', () => {
      const result = parseMarkdown('# Heading 1');
      expect(result).toContain('<h1');
      expect(result).toContain('Heading 1');
    });

    it('should parse links', () => {
      const result = parseMarkdown('[Click here](https://example.com)');
      expect(result).toContain('<a href="https://example.com"');
      expect(result).toContain('Click here');
    });

    it('should parse bold and italic', () => {
      const result = parseMarkdown('**bold** and *italic*');
      expect(result).toContain('<strong>bold</strong>');
      expect(result).toContain('<em>italic</em>');
    });

    it('should handle empty input', () => {
      const result = parseMarkdown('');
      expect(result).toBe('');
    });
  });

  describe('code block highlighting', () => {
    it('should highlight JavaScript code with language class', () => {
      const code = '```javascript\nconst x = 42;\n```';
      const result = parseMarkdown(code);

      expect(result).toContain('<pre>');
      expect(result).toContain('<code');
      expect(result).toContain('class="hljs language-javascript"');
      expect(result).toContain('data-language="javascript"');
    });

    it('should highlight TypeScript code', () => {
      const code = '```typescript\nconst y: number = 1;\n```';
      const result = parseMarkdown(code);

      expect(result).toContain('class="hljs language-typescript"');
      expect(result).toContain('data-language="typescript"');
    });

    it('should highlight Python code', () => {
      const code = '```python\ndef hello():\n    print("Hi")\n```';
      const result = parseMarkdown(code);

      expect(result).toContain('class="hljs language-python"');
      expect(result).toContain('data-language="python"');
    });

    it('should auto-highlight code without language specified', () => {
      const code = '```\nconst x = 42;\n```';
      const result = parseMarkdown(code);

      expect(result).toContain('<pre>');
      expect(result).toContain('class="hljs"');
    });

    it('should handle unknown language by including it in class', () => {
      const code = '```unknownlang123\nsome code\n```';
      const result = parseMarkdown(code);

      expect(result).toContain('<pre>');
      expect(result).toContain('class="hljs language-unknownlang123"');
    });
  });

  describe('marked export', () => {
    it('should export the marked library', () => {
      expect(marked).toBeDefined();
      expect(typeof marked.parse).toBe('function');
    });
  });

  describe('complex markdown with mixed content', () => {
    it('should handle unordered lists', () => {
      const md = '- Item one\n- Item two\n- Item three';
      const result = parseMarkdown(md);

      expect(result).toContain('<ul>');
      expect(result).toContain('<li>');
    });

    it('should handle inline code', () => {
      const md = 'Use the `foo` function';
      const result = parseMarkdown(md);

      expect(result).toContain('<code>');
      expect(result).toContain('foo');
    });

    it('should handle blockquotes', () => {
      const md = '> This is a quote';
      const result = parseMarkdown(md);

      expect(result).toContain('<blockquote>');
    });

    it('should handle horizontal rules', () => {
      const md = '---';
      const result = parseMarkdown(md);

      expect(result).toContain('<hr');
    });
  });
});
