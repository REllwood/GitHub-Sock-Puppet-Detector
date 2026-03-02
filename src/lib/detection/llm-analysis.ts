import { DetectionResult } from '@/types/analysis';

interface LLMConfig {
  enabled: boolean;
  provider: 'ollama' | 'openai' | 'anthropic' | 'none';
  model?: string;
  apiKey?: string;
  ollamaUrl?: string;
}

interface CommentAnalysis {
  username: string;
  content: string;
  timestamp: Date;
}

/**
 * LLM-based analysis for detecting coordinated behaviour and writing patterns
 */
export class LLMAnalyzer {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /**
   * Analyze writing style similarity across multiple accounts
   */
  async analyzeWritingStyleSimilarity(
    comments: CommentAnalysis[]
  ): Promise<DetectionResult> {
    if (!this.config.enabled || this.config.provider === 'none') {
      return { detected: false, score: 0, reason: 'LLM analysis disabled' };
    }

    try {
      const prompt = this.buildStyleAnalysisPrompt(comments);
      const response = await this.callLLM(prompt);
      
      return this.parseStyleAnalysisResponse(response);
    } catch (error) {
      console.error('LLM writing style analysis failed:', error);
      return { detected: false, score: 0, reason: 'Analysis failed' };
    }
  }

  /**
   * Detect coordinated messaging (same intent, different wording)
   */
  async detectCoordinatedMessaging(
    comments: CommentAnalysis[]
  ): Promise<DetectionResult> {
    if (!this.config.enabled || this.config.provider === 'none') {
      return { detected: false, score: 0, reason: 'LLM analysis disabled' };
    }

    try {
      const prompt = this.buildCoordinationPrompt(comments);
      const response = await this.callLLM(prompt);
      
      return this.parseCoordinationResponse(response);
    } catch (error) {
      console.error('LLM coordination analysis failed:', error);
      return { detected: false, score: 0, reason: 'Analysis failed' };
    }
  }

  /**
   * Detect social engineering tactics (pressure campaigns, manipulation)
   */
  async detectSocialEngineering(
    comments: CommentAnalysis[]
  ): Promise<DetectionResult> {
    if (!this.config.enabled || this.config.provider === 'none') {
      return { detected: false, score: 0, reason: 'LLM analysis disabled' };
    }

    try {
      const prompt = this.buildSocialEngineeringPrompt(comments);
      const response = await this.callLLM(prompt);
      
      return this.parseSocialEngineeringResponse(response);
    } catch (error) {
      console.error('LLM social engineering analysis failed:', error);
      return { detected: false, score: 0, reason: 'Analysis failed' };
    }
  }

  /**
   * Build prompt for writing style analysis
   */
  private buildStyleAnalysisPrompt(comments: CommentAnalysis[]): string {
    const commentTexts = comments
      .map((c, i) => `Comment ${i + 1} (${c.username}):\n${c.content}`)
      .join('\n\n');

    return `Analyze the following GitHub comments for writing style similarity. Look for:
- Similar sentence structure and phrasing
- Common grammatical patterns or errors
- Similar vocabulary usage
- Consistent tone or formality level
- Identical expressions or idioms

Comments:
${commentTexts}

Respond with a JSON object:
{
  "similarityScore": 0-100,
  "detected": true/false,
  "reason": "brief explanation",
  "suspiciousPatterns": ["pattern1", "pattern2"]
}`;
  }

  /**
   * Build prompt for coordinated messaging detection
   */
  private buildCoordinationPrompt(comments: CommentAnalysis[]): string {
    const commentTexts = comments
      .map(
        (c, i) =>
          `Comment ${i + 1} (${c.username}, ${c.timestamp.toISOString()}):\n${c.content}`
      )
      .join('\n\n');

    return `Analyze these GitHub comments for coordinated messaging. Look for:
- Multiple accounts pushing the same narrative with different wording
- Coordinated pressure campaigns (like the XZ backdoor attack)
- Artificial urgency or criticism
- Similar talking points across different accounts
- Timing patterns suggesting coordination

Comments:
${commentTexts}

Respond with a JSON object:
{
  "coordinationScore": 0-100,
  "detected": true/false,
  "reason": "brief explanation",
  "coordinationPatterns": ["pattern1", "pattern2"]
}`;
  }

  /**
   * Build prompt for social engineering detection
   */
  private buildSocialEngineeringPrompt(comments: CommentAnalysis[]): string {
    const commentTexts = comments
      .map((c, i) => `Comment ${i + 1} (${c.username}):\n${c.content}`)
      .join('\n\n');

    return `Analyze these GitHub comments for social engineering tactics:
- Pressure to accept changes quickly
- Criticism of maintainer response times
- Artificial urgency or deadlines
- Emotional manipulation
- Authority appeals
- Bandwagon effects

Comments:
${commentTexts}

Respond with a JSON object:
{
  "manipulationScore": 0-100,
  "detected": true/false,
  "reason": "brief explanation",
  "tactics": ["tactic1", "tactic2"]
}`;
  }

  /**
   * Call the configured LLM provider
   */
  private async callLLM(prompt: string): Promise<string> {
    switch (this.config.provider) {
      case 'ollama':
        return this.callOllama(prompt);
      case 'openai':
        return this.callOpenAI(prompt);
      case 'anthropic':
        return this.callAnthropic(prompt);
      default:
        throw new Error('No LLM provider configured');
    }
  }

  /**
   * Call Ollama (local LLM)
   */
  private async callOllama(prompt: string): Promise<string> {
    const url = this.config.ollamaUrl || 'http://localhost:11434';
    const model = this.config.model || 'llama3.2';

    const response = await fetch(`${url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: 'json',
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(prompt: string): Promise<string> {
    if (!this.config.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const model = this.config.model || 'gpt-5-mini';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are a security analyst detecting sock puppet accounts and coordinated attacks on GitHub.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * Call Anthropic Claude API
   */
  private async callAnthropic(prompt: string): Promise<string> {
    if (!this.config.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const model = this.config.model || 'claude-3-haiku-20240307';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  /**
   * Parse LLM response for writing style analysis
   */
  private parseStyleAnalysisResponse(response: string): DetectionResult {
    try {
      const parsed = JSON.parse(response);
      return {
        detected: parsed.detected || parsed.similarityScore > 70,
        score: parsed.similarityScore || 0,
        reason: parsed.reason || 'LLM detected writing style similarity',
        details: {
          suspiciousPatterns: parsed.suspiciousPatterns || [],
          llmProvider: this.config.provider,
        },
      };
    } catch (error) {
      console.error('Failed to parse LLM response:', error);
      return { detected: false, score: 0, reason: 'Failed to parse LLM response' };
    }
  }

  /**
   * Parse LLM response for coordination detection
   */
  private parseCoordinationResponse(response: string): DetectionResult {
    try {
      const parsed = JSON.parse(response);
      return {
        detected: parsed.detected || parsed.coordinationScore > 70,
        score: parsed.coordinationScore || 0,
        reason: parsed.reason || 'LLM detected coordinated messaging',
        details: {
          coordinationPatterns: parsed.coordinationPatterns || [],
          llmProvider: this.config.provider,
        },
      };
    } catch (error) {
      console.error('Failed to parse LLM response:', error);
      return { detected: false, score: 0, reason: 'Failed to parse LLM response' };
    }
  }

  /**
   * Parse LLM response for social engineering detection
   */
  private parseSocialEngineeringResponse(response: string): DetectionResult {
    try {
      const parsed = JSON.parse(response);
      return {
        detected: parsed.detected || parsed.manipulationScore > 70,
        score: parsed.manipulationScore || 0,
        reason: parsed.reason || 'LLM detected social engineering tactics',
        details: {
          tactics: parsed.tactics || [],
          llmProvider: this.config.provider,
        },
      };
    } catch (error) {
      console.error('Failed to parse LLM response:', error);
      return { detected: false, score: 0, reason: 'Failed to parse LLM response' };
    }
  }
}

/**
 * Create LLM analyzer from environment variables
 */
export function createLLMAnalyzer(): LLMAnalyzer {
  const config: LLMConfig = {
    enabled: process.env.LLM_ANALYSIS_ENABLED === 'true',
    provider: (process.env.LLM_PROVIDER as LLMConfig['provider']) || 'none',
    model: process.env.LLM_MODEL,
    apiKey: process.env.LLM_API_KEY,
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  };

  return new LLMAnalyzer(config);
}

/**
 * Comprehensive LLM-based analysis combining all detection methods
 */
export async function runLLMAnalysis(
  comments: Array<{ username: string; content: string; createdAt: Date }>
): Promise<DetectionResult> {
  const analyzer = createLLMAnalyzer();

  if (!analyzer) {
    return { detected: false, score: 0, reason: 'LLM analysis not configured' };
  }

  const commentData: CommentAnalysis[] = comments.map(c => ({
    username: c.username,
    content: c.content,
    timestamp: c.createdAt,
  }));

  // Run all analyses in parallel
  const [styleResult, coordinationResult, socialEngResult] = await Promise.all([
    analyzer.analyzeWritingStyleSimilarity(commentData),
    analyzer.detectCoordinatedMessaging(commentData),
    analyzer.detectSocialEngineering(commentData),
  ]);

  // Combine scores with weights
  const combinedScore = Math.min(
    100,
    styleResult.score * 0.3 + coordinationResult.score * 0.4 + socialEngResult.score * 0.3
  );

  const reasons: string[] = [];
  if (styleResult.detected) reasons.push(styleResult.reason || 'Similar writing styles');
  if (coordinationResult.detected)
    reasons.push(coordinationResult.reason || 'Coordinated messaging');
  if (socialEngResult.detected)
    reasons.push(socialEngResult.reason || 'Social engineering detected');

  return {
    detected: combinedScore > 60,
    score: combinedScore,
    reason: reasons.length > 0 ? reasons.join('; ') : undefined,
    details: {
      writingStyle: styleResult,
      coordination: coordinationResult,
      socialEngineering: socialEngResult,
    },
  };
}
