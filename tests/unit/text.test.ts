import { contentTokens, jaccard, normaliseComment } from '@/lib/detection/text';

describe('comment text utilities', () => {
  it('strips quoted replies, code, URLs and mentions', () => {
    const text = [
      '> quoted text from someone else',
      'Real words here @someone',
      '```js\nconst x = 1;\n```',
      'see https://example.com/path and `inline code`',
    ].join('\n');

    const normalised = normaliseComment(text);

    expect(normalised).not.toContain('quoted');
    expect(normalised).not.toContain('someone');
    expect(normalised).not.toContain('const');
    expect(normalised).not.toContain('example.com');
    expect(normalised).not.toContain('inline');
    expect(normalised).toContain('real words here');
  });

  it('extracts meaningful tokens without stop words', () => {
    expect(contentTokens('The maintainer is too slow, please merge this now')).toEqual(
      new Set(['maintainer', 'slow', 'please', 'merge'])
    );
  });

  it('calculates Jaccard similarity', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
    expect(jaccard(new Set(['a', 'b']), new Set(['c']))).toBe(0);
    expect(jaccard(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']))).toBe(0.5);
    expect(jaccard(new Set(), new Set(['a']))).toBe(0);
  });
});
