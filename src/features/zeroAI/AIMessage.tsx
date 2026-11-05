import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Render assistant formatting as React elements without accepting raw HTML. */
export function AIMessage({ content }: { content: string }) {
  return <div className="zero-ai-answer min-w-0 text-[15px] leading-7 [overflow-wrap:anywhere] sm:text-[16px]">
    <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
      table: ({ children }) => <div className="no-scrollbar my-4 max-w-full overflow-x-auto rounded-lg bg-foreground/[0.03]" tabIndex={0} role="region" aria-label="Response table"><table className="w-full min-w-[420px] border-collapse text-left text-sm">{children}</table></div>,
      th: ({ children }) => <th className="border-b border-border px-3 py-2 font-semibold">{children}</th>,
      td: ({ children }) => <td className="border-b border-border/50 px-3 py-2 align-top">{children}</td>,
      pre: ({ children }) => <pre className="no-scrollbar my-4 max-w-full overflow-x-auto rounded-xl bg-foreground/[0.05] p-4 text-[13px] leading-6">{children}</pre>,
      a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline underline-offset-4">{children}</a>,
      img: ({ alt, src }) => <a href={src} target="_blank" rel="noopener noreferrer" className="text-accent underline">{alt || "View image"}</a>,
    }}>{content}</Markdown>
  </div>;
}
