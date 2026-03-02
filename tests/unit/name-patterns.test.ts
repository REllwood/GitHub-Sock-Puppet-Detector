import { detectNamePattern, detectSimilarNamingPatterns } from '@/lib/detection/name-patterns';

describe('Name Pattern Detection', () => {
  it('should detect common name + digits pattern', () => {
    const result = detectNamePattern('james123');

    expect(result.detected).toBe(true);
    expect(result.score).toBeGreaterThan(30);
  });

  it('should detect capitalized name + digits', () => {
    const result = detectNamePattern('James1234');

    expect(result.detected).toBe(true);
    expect(result.score).toBeGreaterThan(30);
  });

  it('should detect generic usernames', () => {
    const result = detectNamePattern('user456');

    expect(result.detected).toBe(true);
    expect(result.score).toBeGreaterThan(40);
  });

  it('should not detect normal usernames', () => {
    const result = detectNamePattern('johndoe');

    expect(result.detected).toBe(false);
  });

  it('should detect similar naming patterns across accounts', () => {
    const usernames = ['james123', 'john456', 'robert789'];

    const result = detectSimilarNamingPatterns(usernames);

    expect(result.clusters.length).toBeGreaterThan(0);
    expect(result.overallScore).toBeGreaterThan(0);
  });
});
