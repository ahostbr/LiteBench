import { useState, useCallback, memo, createContext, useContext } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check } from 'lucide-react';

interface CodeApplyContextValue {
  appliedBlocks: Set<string>;
  markApplied: (blockId: string) => void;
}

const CodeApplyContext = createContext<CodeApplyContextValue>({
  appliedBlocks: new Set(),
  markApplied: () => {},
});

function generateBlockId(code: string, language: string): string {
  let hash = 0;
  const str = code + language;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `block_${Math.abs(hash)}`;
}

const CodeBlock = memo(function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }, [code]);

  return (
    <div className="relative my-2 rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800 border-b border-zinc-700">
        <span className="text-[10px] font-mono text-zinc-500">{language || 'text'}</span>
        <button
          onClick={handleCopy}
          className="p-1 rounded hover:bg-zinc-700 transition-colors"
          title="Copy code"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-zinc-500" />
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-sm">
        <code className="font-mono text-zinc-300">{code}</code>
      </pre>
    </div>
  );
});

const InlineCode = memo(function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 rounded text-[0.9em] font-mono bg-zinc-800 text-amber-300 border border-zinc-700">
      {children}
    </code>
  );
});

const markdownComponents = {
  code: ({
    inline,
    className,
    children,
  }: {
    inline?: boolean;
    className?: string;
    children?: React.ReactNode;
  }) => {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    const code = String(children).replace(/\n$/, '');

    if (!inline && (match || code.includes('\n'))) {
      return <CodeBlock language={language} code={code} />;
    }
    return <InlineCode>{children}</InlineCode>;
  },

  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0 text-zinc-100 leading-relaxed">{children}</p>
  ),

  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-lg font-bold mb-2 mt-3 first:mt-0 text-zinc-50">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-base font-bold mb-2 mt-3 first:mt-0 text-zinc-50">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-sm font-bold mb-1.5 mt-2 first:mt-0 text-zinc-50">{children}</h3>
  ),

  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside mb-2 space-y-0.5 ml-1 text-zinc-100">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside mb-2 space-y-0.5 ml-1 text-zinc-100">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-sm text-zinc-100">{children}</li>
  ),

  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-[var(--accent-color)]/50 pl-3 my-2 text-zinc-400 italic">
      {children}
    </blockquote>
  ),

  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--accent-color)] hover:underline"
    >
      {children}
    </a>
  ),

  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-zinc-50">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic text-zinc-200">{children}</em>
  ),

  hr: () => <hr className="my-3 border-zinc-700" />,

  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full text-sm border border-zinc-700 rounded">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-zinc-800">{children}</thead>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => (
    <tbody className="divide-y divide-zinc-700">{children}</tbody>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="hover:bg-zinc-800/50">{children}</tr>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-2 py-1.5 text-left font-medium text-zinc-100 border-b border-zinc-700">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-2 py-1.5 text-zinc-300">{children}</td>
  ),

  del: ({ children }: { children?: React.ReactNode }) => (
    <del className="line-through text-zinc-500">{children}</del>
  ),

  input: ({ checked }: { checked?: boolean }) => (
    <input
      type="checkbox"
      checked={checked}
      readOnly
      className="mr-1.5 accent-[var(--accent-color)]"
    />
  ),
};

export interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const [appliedBlocks, setAppliedBlocks] = useState<Set<string>>(new Set());

  const markApplied = useCallback((blockId: string) => {
    setAppliedBlocks((prev) => new Set(prev).add(blockId));
  }, []);

  return (
    <CodeApplyContext.Provider value={{ appliedBlocks, markApplied }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents as any}>
        {content}
      </ReactMarkdown>
    </CodeApplyContext.Provider>
  );
});

export default MarkdownRenderer;
