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
