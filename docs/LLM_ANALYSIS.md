# LLM-Enhanced Analysis

The Sock Puppet Detector includes optional LLM (Large Language Model) integration to enhance detection accuracy through semantic analysis.

## Why LLM Analysis?

Traditional pattern matching can miss sophisticated attacks where:
- Attackers use different wording to express the same message
- Writing styles are similar but not identical
- Social engineering tactics are subtle
- Multilingual campaigns are used

LLMs can detect:
1. **Semantic Similarity**: Same intent expressed differently
2. **Writing Style Fingerprints**: Subtle patterns in grammar, tone, and vocabulary
3. **Social Engineering Tactics**: Pressure campaigns, emotional manipulation
4. **Context-Aware Detection**: Understanding nuanced communication patterns

## Supported Providers

### 1. Ollama (Local, Recommended)

**Advantages**:
- ✅ **Privacy**: Data never leaves your server
- ✅ **Cost**: Free to run
- ✅ **Speed**: Low latency on local hardware
- ✅ **No API limits**: Unlimited analysis

**Setup**:
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull recommended model
ollama pull llama3.2

# Configure .env
LLM_ANALYSIS_ENABLED=true
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2
OLLAMA_URL=http://localhost:11434
```

**Recommended Models**:
- `llama3.2` (3B) - Fast, good balance
- `mistral` (7B) - Better accuracy
- `phi3` (3.8B) - Very fast, lighter

### 2. OpenAI

**Advantages**:
- ✅ **Accuracy**: State-of-the-art performance with GPT-5 family
- ✅ **No setup**: Cloud-based
- ❌ **Cost**: ~$0.15-15.00 per 1M input tokens
- ❌ **Privacy**: Data sent to OpenAI

**Setup**:
```bash
# Configure .env
LLM_ANALYSIS_ENABLED=true
LLM_PROVIDER=openai
LLM_MODEL=gpt-5-mini
LLM_API_KEY=your_openai_api_key
```

**Recommended Models** (2026):
- `gpt-5-mini` - Best value for speed and cost
- `gpt-5.2` - Excellent for complex analysis, broad world knowledge
- `gpt-5.2-chat-latest` - Latest stable ChatGPT model
- `gpt-5.2-pro` - Highest accuracy with extended reasoning (more compute)

**Pricing** (Per 1M tokens):
- `gpt-5-mini`: ~$0.15 input (estimated)
- `gpt-5.2`: ~$5.00 input, ~$15.00 output (estimated)
- `gpt-5.2-pro`: $15.00 input, $120.00 output

### 3. Anthropic Claude

**Advantages**:
- ✅ **Accuracy**: Excellent performance
- ✅ **Long context**: Better for analyzing many comments
- ❌ **Cost**: ~$0.25-3.00 per 1M tokens
- ❌ **Privacy**: Data sent to Anthropic

**Setup**:
```bash
# Configure .env
LLM_ANALYSIS_ENABLED=true
LLM_PROVIDER=anthropic
LLM_MODEL=claude-3-haiku-20240307
LLM_API_KEY=your_anthropic_api_key
```

**Recommended Models**:
- `claude-3-haiku-20240307` - Fast, affordable ($0.25/1M tokens)
- `claude-3-5-sonnet-20241022` - Best accuracy ($3.00/1M tokens)

## How It Works

### Detection Methods

The LLM analyzer runs three parallel analyses:

#### 1. Writing Style Analysis (30% weight)
Detects accounts with suspiciously similar writing patterns:
- Sentence structure and complexity
- Grammar patterns and errors
- Vocabulary usage
- Tone and formality
- Idiomatic expressions

#### 2. Coordinated Messaging (40% weight)
Identifies coordinated campaigns:
- Same narrative, different wording
- Timing patterns
- Shared talking points
- Artificial urgency
- Pressure tactics (like XZ attack)

#### 3. Social Engineering Detection (30% weight)
Recognises manipulation tactics:
- Pressure to accept changes quickly
- Criticism of maintainer response
- Emotional appeals
- Authority manipulation
- Bandwagon effects

### Integration with Existing Detection

LLM analysis is weighted at **14%** of the total risk score when enabled:

```
Risk Score = 
  Account Age (15%) +
  Name Pattern (18%) +
  Email Pattern (12%) +
  Single Repo (8%) +
  Coordinated Behaviour (25%) +
  Temporal Clustering (8%) +
  LLM Analysis (14%)  ← Optional
```

## Performance Impact

### With Ollama (Local)
- **Analysis Time**: ~2-5 seconds per batch
- **Hardware**: Recommended 8GB+ RAM
- **Cost**: $0 (electricity only)
- **Privacy**: Full control

### With API Providers
- **Analysis Time**: ~1-3 seconds per batch
- **Cost**: ~$0.001-0.01 per analysis
- **Privacy**: Data sent to third party

## Configuration Options

### Environment Variables

```bash
# Enable/disable LLM analysis
LLM_ANALYSIS_ENABLED=true

# Provider selection
LLM_PROVIDER=ollama  # ollama | openai | anthropic | none

# Model selection
LLM_MODEL=llama3.2  # Provider-specific model name

# API key (for cloud providers)
LLM_API_KEY=sk-...

# Ollama URL (for local)
OLLAMA_URL=http://localhost:11434
```

### When to Enable

**Enable LLM analysis if**:
- You monitor high-value repositories
- You've seen coordinated attacks before
- You want the highest accuracy
- Privacy is important (use Ollama)

**Skip LLM analysis if**:
- You're monitoring low-risk repositories
- Cost is a concern (use API providers)
- Hardware is limited (Ollama)
- Traditional detection is sufficient

## Example Results

### Case 1: XZ-Style Pressure Campaign

**Comments analyzed**:
```
User1: "The maintainer is too slow, we need this feature now"
User2: "Completely agree, this is unacceptable delay"
User3: "Why is progress so slow? This should be prioritized"
```

**LLM Detection** (using gpt-5-mini):
- ✅ Coordinated messaging: 85/100
- ✅ Social engineering: 78/100
- ⚠️ Writing style: 45/100
- **Overall**: High risk (combined with other signals)
- **Reasoning**: "Multiple accounts expressing urgency and criticizing maintainer with similar tone"

### Case 2: Legitimate Discussion

**Comments analyzed**:
```
User1: "Would it be possible to add feature X?"
User2: "I second this request, it would help our team"
User3: "Here's a draft PR implementing this idea"
```

**LLM Detection**:
- ✅ Coordinated messaging: 15/100
- ✅ Social engineering: 5/100
- ✅ Writing style: 12/100
- **Overall**: Low risk

## Cost Estimation

### OpenAI (gpt-5-mini)
- Per analysis (10 comments): ~1,000 tokens input
- Cost: ~$0.00015 per analysis (input only)
- 1,000 analyses/month: ~$0.15/month

### OpenAI (gpt-5.2)
- Per analysis (10 comments): ~1,000 tokens input + ~500 tokens output
- Cost: ~$0.005 input + ~$0.0075 output = ~$0.0125 per analysis
- 1,000 analyses/month: ~$12.50/month

### Anthropic (claude-3-haiku)
- Per analysis (10 comments): ~1,000 tokens
- Cost: ~$0.00025 per analysis  
- 1,000 analyses/month: ~$0.25/month

### Ollama (local)
- Hardware: One-time ~$500-2000 for capable machine
- Electricity: ~$5-20/month
- Unlimited analyses

## Best Practices

1. **Start with Ollama** for privacy and cost-effectiveness
2. **Monitor accuracy** - compare LLM detections with manual review
3. **Tune weights** - adjust LLM weight based on your needs
4. **Cache results** - avoid re-analyzing the same comments
5. **Batch processing** - analyze comments in groups for efficiency
6. **Rate limiting** - respect API provider limits

## Troubleshooting

### Ollama Not Responding

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Restart Ollama
systemctl restart ollama  # Linux
brew services restart ollama  # macOS
```

### API Key Errors

```bash
# Verify API key is set
echo $LLM_API_KEY

# Test API connection
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $LLM_API_KEY"
```

### Slow Performance

**For Ollama**:
- Use smaller model (llama3.2 instead of larger models)
- Increase RAM allocation
- Use GPU acceleration if available

**For API providers**:
- Check network latency
- Use batch processing
- Consider regional endpoints

## Security Considerations

1. **API Keys**: Store in environment variables, never in code
2. **Data Privacy**: Consider what comment data is sent to LLM providers
3. **Rate Limiting**: Implement limits to prevent API abuse
4. **Validation**: Always validate LLM responses before using them
5. **Fallback**: System works without LLM if it fails

## Future Enhancements

Planned improvements:
1. **Fine-tuning**: Train on known sock puppet datasets
2. **Embeddings**: Use vector similarity for faster comparison
3. **Streaming**: Real-time analysis for live monitoring
4. **Multi-model**: Combine multiple LLMs for consensus
5. **Explainability**: Better insights into why accounts were flagged
