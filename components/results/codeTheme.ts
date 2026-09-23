/**
 * Prism theme for react-syntax-highlighter that reads the design tokens, so
 * it follows dark / light mode automatically.
 */
import type { CSSProperties } from "react";

type PrismStyle = Record<string, CSSProperties>;

const v = (name: string) => `var(--code-${name})`;

export const codeTheme: PrismStyle = {
  'code[class*="language-"]': {
    color: v("fg"),
    background: "none",
    fontFamily: "var(--font-jetbrains), ui-monospace, monospace",
    fontSize: "inherit",
    textAlign: "left",
    whiteSpace: "pre",
    wordSpacing: "normal",
    wordBreak: "normal",
    lineHeight: "1.65",
    tabSize: 2,
    hyphens: "none",
  },
  'pre[class*="language-"]': {
    color: v("fg"),
    background: v("bg"),
    fontFamily: "var(--font-jetbrains), ui-monospace, monospace",
    fontSize: "inherit",
    margin: 0,
    padding: "1.25rem",
    overflow: "auto",
    lineHeight: "1.65",
    tabSize: 2,
  },
  comment: { color: v("comment"), fontStyle: "italic" },
  prolog: { color: v("comment") },
  doctype: { color: v("comment") },
  cdata: { color: v("comment") },
  punctuation: { color: v("punct") },
  property: { color: v("type") },
  tag: { color: v("keyword") },
  boolean: { color: v("number") },
  number: { color: v("number") },
  constant: { color: v("number") },
  symbol: { color: v("number") },
  selector: { color: v("string") },
  "attr-name": { color: v("type") },
  string: { color: v("string") },
  char: { color: v("string") },
  builtin: { color: v("type") },
  inserted: { color: v("string") },
  operator: { color: v("punct") },
  entity: { color: v("type") },
  url: { color: v("string") },
  variable: { color: v("fg") },
  atrule: { color: v("keyword") },
  "attr-value": { color: v("string") },
  keyword: { color: v("keyword") },
  function: { color: v("function") },
  "class-name": { color: v("type") },
  regex: { color: v("string") },
  important: { color: v("macro"), fontWeight: "bold" },
  bold: { fontWeight: "bold" },
  italic: { fontStyle: "italic" },
  directive: { color: v("macro") },
  "directive-hash": { color: v("macro") },
  macro: { color: v("macro") },
  expression: { color: v("fg") },
  "macro-name": { color: v("macro") },
};
