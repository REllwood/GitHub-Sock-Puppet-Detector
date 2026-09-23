# LLM Model Recommendations

LLM analysis is optional (see [LLM_ANALYSIS.md](LLM_ANALYSIS.md)). The task is to read up to 150 GitHub comments and judge whether accounts are coordinating or applying social engineering pressure. Stronger models make fewer mistakes on subtle cases, while smaller models are cheaper and faster.

## Quick Recommendations

| If you want... | Use |
|---|---|
| Comments never leaving your infrastructure | Ollama with the largest model your hardware runs comfortably |
| Good results at low cost | A small, fast cloud model: `claude-haiku-4-5-20251001` (default for Anthropic) or `gpt-5-mini` (default for OpenAI) |
| The most careful judgement on high-value repositories | A larger cloud model such as `claude-sonnet-5` or `claude-opus-5-5` |

Change model with `LLM_MODEL`; no other settings are needed.

## Local Models (Ollama)

| Model | Size | Notes |
|-------|------|-------|
| `llama3.2` | 3B | Default. Fast, runs on modest hardware (8 GB RAM); least reliable judgement |
| `phi3` | 3.8B | Similar footprint to `llama3.2` |
| `mistral` | 7B | Better judgement; needs roughly 16 GB RAM |
| `llama3.1` | 8B | Better judgement; needs roughly 16 GB RAM |

Local models are asked for JSON output (Ollama's `format: json`). Very small models occasionally return unusable output; the analysis then continues without the LLM result and the worker logs a warning.

## Cloud Models

### Anthropic

| Model | Notes |
|-------|-------|
| `claude-haiku-4-5-20251001` | Default. Fast and inexpensive |
| `claude-sonnet-5` | Stronger reasoning for subtle campaigns |
| `claude-opus-5-5` | Most capable; highest cost |

Anthropic requests use forced tool use, so responses always match the expected structure.

### OpenAI

| Model | Notes |
|-------|-------|
| `gpt-5-mini` | Default. Fast and inexpensive |

Any Chat Completions model that supports JSON mode (`response_format: json_object`) should work.

Check the provider's pricing page for current costs.

## Choosing and Checking a Model

There is no labelled benchmark of sock puppet campaigns in this repository, so there are no reliable accuracy figures to quote for these models. To judge a model on your own repositories:

1. Enable LLM analysis with the model you want to try
2. Run manual analyses on a few repositories, including any past incident you know about
3. Compare the LLM rows in each account's detection breakdown with your own judgement
4. Watch for false positives on ordinary disagreement or "+1" comments, and for coordinated accounts it misses

The LLM is one weighted signal among seven (about a sixth of the score when every detector has data), so the heuristic detectors still carry most of the weight whichever model you choose.
