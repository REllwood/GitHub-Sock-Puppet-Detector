export interface DetectionResult {
  detected: boolean;
  score: number;
  reason?: string;
  details?: Record<string, any>;
  // false when there was no data to evaluate (e.g. no public email); excluded from the risk score
  evaluated?: boolean;
}

export interface AccountDetections {
  accountAge: DetectionResult;
  namePattern: DetectionResult;
  emailPattern: DetectionResult;
  singleRepo: DetectionResult;
  coordinatedBehaviour: DetectionResult;
  temporalClustering: DetectionResult;
  // Only present when LLM analysis is enabled and ran successfully
  llmAnalysis?: DetectionResult;
}

export interface AccountRiskAnalysis {
  accountId: string;
  username: string;
  riskScore: number;
  detections: AccountDetections;
  flagReasons: string[];
}

export interface ClusterDetection {
  type: 'coordination' | 'temporal';
  accounts: string[];
  score: number;
  strength?: number;
  patterns?: string[];
  thread?: number | null;
  timeWindow?: {
    start: string;
    end: string;
  };
}

export interface AnalysisResult {
  analysisId: string;
  repositoryId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  accountResults: AccountRiskAnalysis[];
  detectedClusters: ClusterDetection[];
  triggeredBy: 'webhook' | 'manual';
  createdAt: Date;
  completedAt?: Date;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Alert {
  id: string;
  repositoryId: string;
  severity: RiskLevel;
  title: string;
  description: string;
  accountsInvolved: string[];
  dismissed: boolean;
  createdAt: Date;
  dismissedAt?: Date;
  dismissedBy?: string;
}
