"use client";
// Markdown for AI replies: Ant Design X's XMarkdown (tables, lists, headings, links) with its dark theme, its
// colours mapped to our antd tokens, and Ant Design X CodeHighlighter for fenced code. Raw HTML from the
// model is escaped, never rendered. `streaming` keeps half-written tables and lists from flickering.
import "@ant-design/x-markdown/themes/dark.css";
import { CodeHighlighter } from "@ant-design/x";
import XMarkdown, { type ComponentProps } from "@ant-design/x-markdown";
import { theme } from "antd";
import type { CSSProperties } from "react";

function Code({ className, children, block, lang, ...rest }: ComponentProps) {
  const text = String(children ?? "").replace(/\n$/, "");
  if (!block) {
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    );
  }
  return <CodeHighlighter lang={lang || "text"}>{text}</CodeHighlighter>;
}

const COMPONENTS = { code: Code };

export default function Markdown({ content, streaming = false }: { content: string; streaming?: boolean }) {
  const { token } = theme.useToken();
  // The theme's CSS variables, taken from our antd tokens so Markdown matches the rest of the app.
  const vars = {
    "--font-size": `${token.fontSize}px`,
    "--primary-color": token.colorPrimary,
    "--primary-color-hover": token.colorPrimaryHover,
    "--heading-color": token.colorTextHeading,
    "--text-color": token.colorText,
    "--border-color": token.colorBorderSecondary,
    "--line-color": token.colorSplit,
    "--dark-bg": token.colorFillTertiary,
    "--table-head-bg": token.colorFillSecondary,
    "--table-body-bg": token.colorBgContainer,
    "--cite-bg": token.colorFillTertiary,
    "--cite-hover-bg": token.colorFillSecondary,
    "--border-radius-middle": `${token.borderRadius}px`,
    "--border-radius-small": `${token.borderRadiusSM}px`,
  } as CSSProperties;
  return (
    <div className="x-markdown-dark" style={{ ...vars, minWidth: 0, overflowX: "auto" }}>
      <XMarkdown
        content={content}
        components={COMPONENTS}
        escapeRawHtml
        openLinksInNewTab
        streaming={streaming ? { hasNextChunk: true, enableAnimation: true } : undefined}
      />
    </div>
  );
}
