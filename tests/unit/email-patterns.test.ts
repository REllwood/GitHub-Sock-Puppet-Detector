import { detectEmailPattern } from '@/lib/detection/email-patterns';

describe('email pattern detection', () => {
  it('flags disposable email providers', () => {
    expect(detectEmailPattern('someone@mailinator.com')).toMatchObject({ detected: true });
    expect(detectEmailPattern('someone@yopmail.com').score).toBeGreaterThanOrEqual(80);
  });

  it('does not flag an ordinary address', () => {
    expect(detectEmailPattern('jane.citizen@example.org')).toMatchObject({
      detected: false,
      score: 0,
    });
  });

  it('is not evaluated when there is no public email', () => {
    expect(detectEmailPattern(null)).toMatchObject({ detected: false, evaluated: false });
  });
});
