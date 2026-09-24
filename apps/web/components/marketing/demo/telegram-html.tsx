import { Fragment, type ReactNode } from 'react';

/**
 * Renders Telegram HTML (the `parse_mode: 'HTML'` text `formatTelegram` produces) as React nodes,
 * the way a Telegram client shows it. Only `<b>`, `<code>` and `<a href="http(s)://…">` become
 * elements, `\n` becomes `<br>` and `&amp; &lt; &gt; &quot;` are decoded. Every other tag,
 * attribute or stray `<` stays literal text, which React escapes; unbalanced tags never throw.
 * Links do not navigate: the demo stage is inert, so they render as link-styled spans.
 */

type Tag = 'b' | 'code' | 'a';

interface ElementNode {
  tag: Tag;
  /** `a` only: the decoded href when it is an http(s) URL, otherwise null (text only). */
  href: string | null;
  children: Node[];
}
type Node = string | ElementNode;

const TOKEN = /<(\/?)(b|code|a)(?:\s+href="([^"<>]*)")?>/g;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"' };

export function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot);/g, (_, name: string) => ENTITIES[name]!);
}

function safeHref(raw: string): string | null {
  const href = decodeEntities(raw).trim();
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Builds a tree of whitelisted elements; anything else is kept as raw (still encoded) text. */
export function parseTelegramHtml(html: string): Node[] {
  const root: ElementNode = { tag: 'b', href: null, children: [] };
  const stack: ElementNode[] = [root];
  const top = () => stack[stack.length - 1]!;
  let last = 0;
  for (const match of html.matchAll(TOKEN)) {
    const [raw, closing, name, href] = match;
    const tag = name as Tag;
    const index = match.index;
    // Only `<a …>` may carry an attribute, and only when opening.
    const valid = href === undefined || (tag === 'a' && !closing);
    const open = valid && !closing && (tag !== 'a' || href !== undefined);
    const closes = valid && closing && stack.length > 1 && top().tag === tag;
    if (!open && !closes) continue; // Stays literal text.
    if (index > last) top().children.push(html.slice(last, index));
    last = index + raw.length;
    if (open) {
      const element: ElementNode = {
        tag,
        href: tag === 'a' ? safeHref(href!) : null,
        children: [],
      };
      top().children.push(element);
      stack.push(element);
    } else {
      stack.pop();
    }
  }
  if (last < html.length) top().children.push(html.slice(last));
  return root.children;
}

function renderText(text: string, key: string): ReactNode {
  const lines = decodeEntities(text).split('\n');
  return (
    <Fragment key={key}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </Fragment>
  );
}

export interface TelegramHtmlClasses {
  link?: string;
  code?: string;
}

function renderNodes(nodes: Node[], prefix: string, classes: TelegramHtmlClasses): ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${prefix}${i}`;
    if (typeof node === 'string') return renderText(node, key);
    const children = renderNodes(node.children, `${key}.`, classes);
    switch (node.tag) {
      case 'b':
        return (
          <b key={key} className="font-semibold">
            {children}
          </b>
        );
      case 'code':
        return (
          <code key={key} className={classes.code}>
            {children}
          </code>
        );
      case 'a':
        return node.href ? (
          <span key={key} data-href={node.href} className={classes.link}>
            {children}
          </span>
        ) : (
          <Fragment key={key}>{children}</Fragment>
        );
    }
  });
}

export function TelegramHtml({
  html,
  classes = {},
}: {
  html: string;
  classes?: TelegramHtmlClasses;
}) {
  return <>{renderNodes(parseTelegramHtml(html), '', classes)}</>;
}
