import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { formatTelegram } from '@/lib/notify/format';
import { sampleMessage } from '@/test/notify-fixtures';
import { TelegramHtml } from './telegram-html';

const render = (html: string) =>
  renderToStaticMarkup(<TelegramHtml html={html} classes={{ link: 'l', code: 'c' }} />);

describe('TelegramHtml', () => {
  it('keeps b, code and http(s) links and turns newlines into <br>', () => {
    expect(
      render(
        '<b>Bug</b> · x\n<code>err</code>\n<a href="https://a.example/p?x=1&amp;y=2">Open</a>',
      ),
    ).toBe(
      '<b class="font-semibold">Bug</b> · x<br/><code class="c">err</code><br/>' +
        '<span data-href="https://a.example/p?x=1&amp;y=2" class="l">Open</span>',
    );
  });

  it('decodes the entities formatTelegram produces, once', () => {
    expect(render('a &lt;b&gt; &amp; &quot;q&quot; &amp;lt;')).toBe(
      'a &lt;b&gt; &amp; &quot;q&quot; &amp;lt;',
    );
    expect(render('&#39;&nbsp;')).toBe('&amp;#39;&amp;nbsp;');
  });

  it('renders script tags and unknown tags as text', () => {
    const out = render('<script>alert(1)</script><i>x</i><b><u>y</u></b>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<i>');
    expect(out).not.toContain('<u>');
    expect(out).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;&lt;i&gt;x&lt;/i&gt;<b class="font-semibold">&lt;u&gt;y&lt;/u&gt;</b>',
    );
  });

  it('renders attributes on anything but a[href] as text', () => {
    const out = render(
      '<img src=x onerror="alert(1)"><b class="x">t</b><a href="https://x.example" onclick="y">z</a>',
    );
    // Nothing became an element: every `<` is escaped text.
    expect(out).not.toContain('<');
    expect(out).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(out).toContain('&lt;b class=&quot;x&quot;&gt;t');
  });

  it('drops non-http(s) link targets and keeps only the text', () => {
    for (const href of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,x',
      'tg://resolve',
      'x',
    ]) {
      const out = render(`<a href="${href}">click</a>`);
      expect(out).toBe('click');
    }
    expect(render('<a href=" javascript&#58;alert(1)">c</a>')).toBe('c');
  });

  it('nests whitelisted tags', () => {
    expect(render('<b><a href="http://x.example/">in</a></b>')).toBe(
      '<b class="font-semibold"><span data-href="http://x.example/" class="l">in</span></b>',
    );
  });

  it('never throws on unbalanced tags', () => {
    for (const html of [
      '<b>open',
      '</b>close',
      '<b><code>x</b></code>',
      '<a href="https://x.example">',
      '<',
      '<b',
      '</a></a><code>',
    ]) {
      expect(() => render(html)).not.toThrow();
    }
    expect(render('<b>open')).toBe('<b class="font-semibold">open</b>');
    expect(render('</b>close')).toBe('&lt;/b&gt;close');
    expect(render('<b><code>x</b></code>')).toBe(
      '<b class="font-semibold"><code class="c">x&lt;/b&gt;</code></b>',
    );
  });

  it('renders a real notification without losing text', () => {
    const { full } = formatTelegram(sampleMessage());
    const out = render(full);
    expect(out).toContain('<b class="font-semibold">Bug</b>');
    expect(out).toContain('Checkout &lt;b&gt;fails&lt;/b&gt; &amp; nothing happens');
    expect(out).toContain('<code class="c">TypeError: x is undefined</code>');
    expect(out).toContain('class="l">Open in dashboard</span>');
  });
});
