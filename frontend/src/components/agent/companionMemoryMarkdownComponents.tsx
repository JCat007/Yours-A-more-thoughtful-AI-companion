import type { Components } from 'react-markdown';

/** Shared with Bella chat styling for companion memory preview. */
export const companionMemoryMarkdownComponents: Components = {
  h1: ({ children }) => <h1 className="bella-md-h1">{children}</h1>,
  h2: ({ children }) => <h2 className="bella-md-h2">{children}</h2>,
  h3: ({ children }) => <h3 className="bella-md-h3">{children}</h3>,
  h4: ({ children }) => <h4 className="bella-md-h3 text-sm mt-2">{children}</h4>,
  p: ({ children }) => <p className="bella-md-p">{children}</p>,
  ul: ({ children }) => <ul className="bella-md-ul">{children}</ul>,
  ol: ({ children }) => <ol className="bella-md-ol">{children}</ol>,
  li: ({ children }) => <li className="bella-md-li">{children}</li>,
  blockquote: ({ children }) => <blockquote className="bella-md-blockquote">{children}</blockquote>,
  hr: () => <hr className="bella-md-hr" />,
  strong: ({ children }) => <strong className="font-semibold bella-md-strong">{children}</strong>,
  code: ({ children }) => <code className="bella-md-code">{children}</code>,
  pre: ({ children }) => <pre className="bella-md-pre">{children}</pre>,
  table: ({ children }) => (
    <div className="bella-md-table-wrap">
      <table className="bella-md-table">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="bella-md-th">{children}</th>,
  td: ({ children }) => <td className="bella-md-td">{children}</td>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="bella-md-link">
      {children}
    </a>
  ),
};
