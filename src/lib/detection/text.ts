// Common English words that carry no signal about who wrote a comment or what it pushes
const STOP_WORDS = new Set(
  (
    'a about above after again against all am an and any are as at be because been before being ' +
    'below between both but by can could did do does doing down during each few for from further ' +
    'had has have having he her here hers herself him himself his how i if in into is it its itself ' +
    'just me more most my myself no nor not now of off on once only or other our ours ourselves out ' +
    'over own same she should so some such than that the their theirs them themselves then there ' +
    'these they this those through to too under until up very was we were what when where which ' +
    'while who whom why will with would you your yours yourself yourselves im ive its dont cant ' +
    'wont thats theres lets also get got one like'
  ).split(' ')
);

/**
 * Strip content that isn't the author's own words: fenced and inline code, quoted replies,
 * URLs and @mentions. Quoted replies in particular would otherwise make a reply look like
 * a copy of the comment it answers.
 */
export function normaliseComment(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .split('\n')
    .filter(line => !line.trim().startsWith('>'))
    .join('\n')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/@[\w-]+/g, ' ')
    .toLowerCase();
}

/**
 * Meaningful words in a comment (stop words removed)
 */
export function contentTokens(text: string): Set<string> {
  const words = normaliseComment(text)
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter(word => word.length >= 2 && !STOP_WORDS.has(word));
  return new Set(words);
}

/**
 * Jaccard similarity of two token sets (0 - 1)
 */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;

  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  let intersection = 0;
  smaller.forEach(token => {
    if (larger.has(token)) intersection++;
  });

  return intersection / (a.size + b.size - intersection);
}
