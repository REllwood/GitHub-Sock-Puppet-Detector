export interface DetectionResult {
  detected: boolean;
  score: number;
  reason?: string;
  details?: Record<string, any>;
}

export interface AccountRiskAnalysis {
  accountId: string;
  username: string;
  riskScore: number;
  detections: {
    accountAge: DetectionResult;
    namePattern: DetectionResult;
    emailPattern: DetectionResult;
    singleRepo: DetectionResult;
    coordinatedBehaviour: DetectionResult;
    temporalClustering: DetectionResult;
  };
  flagReasons: string[];
}

export interface ClusterDetection {
  accounts: string[];
  strength: number;
  patterns: string[];
  timeWindow: {
    start: Date;
    end: Date;
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
