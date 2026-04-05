---
name: model-download
description: Download GGUF models from HuggingFace directly into LM Studio's model directory. Triggers on "download model", "get model", "grab model", "install model".
type: skill
---

# Model Downloader

Download GGUF model files from HuggingFace into LM Studio's model directory
so they can be loaded and tested with LiteBench.

## LM Studio Model Directory

Models go to: `~/.lmstudio/models/<publisher>/<model-name>/`

On Windows: `C:/Users/<username>/.lmstudio/models/`

## Workflow

### Step 1: Search HuggingFace

```bash
curl -s "https://huggingface.co/api/models?search=<query>+gguf&limit=10" | python -c "import sys,json; d=json.load(sys.stdin); [print(m['id']) for m in d]"
```

### Step 2: List Available Files

```bash
curl -s "https://huggingface.co/api/models/<repo-id>/tree/main" | python -c "
import sys, json
files = json.load(sys.stdin)
for f in files:
    if f.get('path','').endswith('.gguf'):
        size_mb = f.get('size', 0) / 1024 / 1024
        print(f'{f[\"path\"]:60s} {size_mb:.0f} MB')
"
```

### Step 3: Download

Prefer Q4_K_M quantization (good balance of quality and size).

```bash
mkdir -p ~/.lmstudio/models/<publisher>/<model-GGUF>/
curl -L -o ~/.lmstudio/models/<publisher>/<model-GGUF>/<filename>.gguf \
  "https://huggingface.co/<repo-id>/resolve/main/<filename>.gguf"
```

### Step 4: Verify

```bash
ls -lh ~/.lmstudio/models/<publisher>/<model-GGUF>/
```

The model will appear in LM Studio after a rescan. User needs to load it manually in LM Studio's UI.

## Recommended Models to Download

For tool calling / agent benchmarking:

| Model | Repo | Size | Why |
|-------|------|------|-----|
| xLAM 2 1B | Salesforce/xLAM-2-1b-fc-r-gguf | ~940MB | Purpose-built for function calling |
| xLAM 2 8B | Salesforce/xLAM-2-8b-fc-r-gguf | ~5GB | #1 on BFCL leaderboard |
| Hermes 3 8B | NousResearch/Hermes-3-Llama-3.1-8B-GGUF | ~5GB | Gold standard structured tool use |
| Llama 3.1 8B | lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF | ~5GB | Meta native tool calling |
| Llama 3.2 3B | lmstudio-community/Llama-3.2-3B-Instruct-GGUF | ~2GB | Smallest Llama with tools |
