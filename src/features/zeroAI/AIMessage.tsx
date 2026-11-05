import { Children, isValidElement, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Tables become readable rows on phones instead of squeezing columns into a screen. */
function ResponseTable({ children }: { children?: ReactNode }) {
  const elements = (value: ReactNode) => Children.toArray(value).filter(isValidElement<{ children?: ReactNode }>);
  const sections = elements(children);
  const head = sections.find(section => section.type === "thead");
  const body = sections.find(section => section.type === "tbody");
  const headers = elements(elements(head?.props.children)[0]?.props.children).map(cell => cell.props.children);
  const rows = elements(body?.props.children);
  return <div className="my-5 min-w-0 max-w-full">
    <div className="space-y-4 sm:hidden">
      {rows.map((row, index) => {
        const cells = elements(row.props.children);
        return <section key={index} className="min-w-0 rounded-2xl bg-foreground/[0.035] p-4">
          <h3 className="!mb-3 !mt-0 text-base font-semibold leading-6">{cells[0]?.props.children}</h3>
          <dl className="space-y-4">
            {cells.slice(1).map((cell, column) => <div key={column} className="min-w-0">
              <dt className="mb-1 text-xs font-semibold leading-5 text-muted-foreground">{headers[column + 1]}</dt>
              <dd className="m-0 text-[15px] leading-7 [overflow-wrap:break-word]">{cell.props.children}</dd>
            </div>)}
          </dl>
        </section>;
      })}
    </div>
    <div className="no-scrollbar hidden max-w-full overflow-x-auto rounded-lg bg-foreground/[0.03] sm:block" tabIndex={0} role="region" aria-label="Response table. Scroll horizontally to see all columns.">
      <table className="w-max min-w-full border-collapse text-left text-[15px] leading-7">{children}</table>
    </div>
  </div>;
}

/** Render assistant formatting as React elements without accepting raw HTML. */
export function AIMessage({ content }: { content: string }) {
  return <div className="zero-ai-answer min-w-0 text-[15px] leading-7 [overflow-wrap:break-word] sm:text-[16px]">
    <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
      table: ResponseTable,
      th: ({ children }) => <th className="min-w-[12rem] max-w-[24rem] border-b border-border px-4 py-3 align-top font-semibold [overflow-wrap:break-word]">{children}</th>,
      td: ({ children }) => <td className="min-w-[12rem] max-w-[24rem] border-b border-border/50 px-4 py-3 align-top [overflow-wrap:break-word]">{children}</td>,
      pre: ({ children }) => <pre className="no-scrollbar my-4 max-w-full overflow-x-auto rounded-xl bg-foreground/[0.05] p-4 text-[13px] leading-6">{children}</pre>,
      a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline underline-offset-4">{children}</a>,
      img: ({ alt, src }) => <a href={src} target="_blank" rel="noopener noreferrer" className="text-accent underline">{alt || "View image"}</a>,
    }}>{content}</Markdown>
  </div>;
}
