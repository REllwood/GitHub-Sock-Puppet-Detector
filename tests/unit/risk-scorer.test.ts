import { calculateRiskScore, getRiskLevel } from '@/lib/detection/risk-scorer';
import { DetectionResult } from '@/types/analysis';

describe('Risk Scoring', () => {
  const createMockDetection = (score: number): DetectionResult => ({
    detected: score > 30,
    score,
  });

  it('should calculate weighted risk score correctly', () => {
    const detections = {
      accountAge: createMockDetection(80),
      namePattern: createMockDetection(60),
      emailPattern: createMockDetection(40),
      singleRepo: createMockDetection(70),
      coordinatedBehaviour: createMockDetection(90),
      temporalClustering: createMockDetection(50),
    };

    const riskScore = calculateRiskScore(detections);

    // Should be weighted average
    expect(riskScore).toBeGreaterThan(0);
    expect(riskScore).toBeLessThanOrEqual(100);
  });

  it('should determine risk level correctly', () => {
    expect(getRiskLevel(15)).toBe('low');
    expect(getRiskLevel(45)).toBe('medium');
    expect(getRiskLevel(75)).toBe('high');
    expect(getRiskLevel(95)).toBe('critical');
  });

  it('should reach the full range when every detector agrees', () => {
    const all = (score: number) => ({
      accountAge: createMockDetection(score),
      namePattern: createMockDetection(score),
      emailPattern: createMockDetection(score),
      singleRepo: createMockDetection(score),
      coordinatedBehaviour: createMockDetection(score),
      temporalClustering: createMockDetection(score),
    });

    expect(calculateRiskScore(all(100))).toBe(100);
    expect(calculateRiskScore(all(50))).toBe(50);
    expect(getRiskLevel(calculateRiskScore(all(100)))).toBe('critical');
  });

  it('should leave out detectors that had no data to evaluate', () => {
    const detections = {
      accountAge: createMockDetection(100),
      namePattern: createMockDetection(0),
      emailPattern: { detected: false, score: 0, evaluated: false },
      singleRepo: createMockDetection(100),
      coordinatedBehaviour: createMockDetection(100),
      temporalClustering: createMockDetection(100),
    };

    // Weighted average of the evaluated detectors only: (20 + 0 + 10 + 30 + 20) / 0.9
    expect(calculateRiskScore(detections)).toBeCloseTo(88.9, 1);
  });

  it('should include the LLM score only when LLM analysis ran', () => {
    const base = {
      accountAge: createMockDetection(0),
      namePattern: createMockDetection(0),
      emailPattern: createMockDetection(0),
      singleRepo: createMockDetection(0),
      coordinatedBehaviour: createMockDetection(0),
      temporalClustering: createMockDetection(0),
    };

    expect(calculateRiskScore(base)).toBe(0);
    expect(calculateRiskScore({ ...base, llmAnalysis: createMockDetection(100) })).toBeCloseTo(
      (100 * 0.2) / 1.2,
      5
    );
  });

  it('should use the documented risk level boundaries', () => {
    expect(getRiskLevel(30)).toBe('low');
    expect(getRiskLevel(30.5)).toBe('medium');
    expect(getRiskLevel(60)).toBe('medium');
    expect(getRiskLevel(61)).toBe('high');
    expect(getRiskLevel(85)).toBe('high');
    expect(getRiskLevel(86)).toBe('critical');
  });

  it('should handle edge cases', () => {
    const zeroDetections = {
      accountAge: createMockDetection(0),
      namePattern: createMockDetection(0),
      emailPattern: createMockDetection(0),
      singleRepo: createMockDetection(0),
      coordinatedBehaviour: createMockDetection(0),
      temporalClustering: createMockDetection(0),
    };

    const score = calculateRiskScore(zeroDetections);
    expect(score).toBe(0);
    expect(getRiskLevel(score)).toBe('low');
  });
});
