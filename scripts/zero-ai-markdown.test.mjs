import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

let source = ts.transpileModule(fs.readFileSync("src/features/zeroAI/AIMessage.tsx", "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
for (const dependency of ["react/jsx-runtime", "react-markdown", "remark-gfm"]) {
  source = source.replaceAll(`"${dependency}"`, JSON.stringify(import.meta.resolve(dependency)));
}
const { AIMessage } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const render = content => renderToStaticMarkup(React.createElement(AIMessage, { content }));

test("AI replies render headings, emphasis, lists and tables as readable elements", () => {
  const html = render("### Key elements\n\n**Purpose** and *movement*.\n\n1. Plan\n2. Build\n\n| Element | Meaning |\n| --- | --- |\n| Motion | Communicate |\n");
  assert.match(html, /<h3>Key elements<\/h3>/);
  assert.match(html, /<strong>Purpose<\/strong>/);
  assert.match(html, /<em>movement<\/em>/);
  assert.match(html, /<ol>/);
  assert.match(html, /<table/);
  assert.doesNotMatch(html, /###|\*\*Purpose\*\*|\| --- \|/);
});

test("AI formatting keeps code literal and blocks executable HTML and links", () => {
  const html = render('```js\nconst label = "**literal**";\n```\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))');
  assert.match(html, /<pre/);
  assert.match(html, /\*\*literal\*\*/);
  assert.doesNotMatch(html, /<script|javascript:/i);
});
