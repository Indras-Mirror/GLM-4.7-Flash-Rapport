#!/bin/bash
# ============================================================================
# GLM-4.7-Flash-PRISM llama.cpp Server Settings
# ============================================================================
# Reference configuration for running GLM-4.7-Flash-PRISM with llama.cpp
# Optimized for RTX 4090 24GB VRAM with maximum context
#
# This is a reference file showing the exact settings used.
# Adjust paths and ports for your setup.
# ============================================================================

# Configuration
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LLAMA_SERVER="$HOME/AI/llama.cpp/build/bin/llama-server"
MODEL_PATH="/media/YOUR_DRIVE/models/GLM-4.7-Flash-PRISM-IQ4_NL.gguf"
HOST="0.0.0.0"
PORT=8082

# ============================================================================
# CONTEXT SIZE - MAXIMUM for GLM-4.7-Flash
# ============================================================================
# 202752 tokens = 198k context (model native maximum)
# GPU Usage: ~22GB/24GB on RTX 4090 with these settings
CTX_SIZE=202752

# All layers to GPU (set to specific number to offload some layers to CPU)
N_GPU_LAYERS=-1

# ============================================================================
# KV CACHE SETTINGS - V-LESS CACHE (MLA Architecture)
# ============================================================================
# GLM-4.7-Flash uses DeepSeek-style MLA (Multi-head Latent Attention)
# This means V-cache is automatically skipped (V-less cache)
# Only K-cache is allocated, which saves significant VRAM
#
# K-cache quantized to Q4_0 for additional VRAM savings (~9GB saved)
# V-cache type is ignored for MLA models but set to f16 for compatibility
KV_CACHE_TYPE_K="q4_0"
KV_CACHE_TYPE_V="f16"

# ============================================================================
# SAMPLING PARAMETERS (Recommended for GLM-4.7-Flash)
# ============================================================================
# Based on Unsloth recommendations and HuggingFace discussions
#
# CRITICAL FIXES (Jan 2025):
# - --dry-multiplier 1.1 : Reduces looping issues
# - -fa off / --flash-attn off : Flash attention broken for GLM-4.7
# - --min-p 0.01 : Required for llama.cpp (default is different)
#
# General use: --temp 1.0 --top-p 0.95 --min-p 0.01 --dry-multiplier 1.1
# Tool-calling: --temp 0.7 --top-p 1.0 --min-p 0.01 --dry-multiplier 1.1
#
# DO NOT use --chat-template glm4 with --jinja (they conflict)
TEMP=1.0
TOP_P=0.95
MIN_P=0.01
DRY_MULTIPLIER=1.1

# ============================================================================
# BATCH SETTINGS
# ============================================================================
# Optimized for RTX 4090 24GB
BATCH_SIZE=256      # Processing batch size
UBATCH_SIZE=64      # Micro-batch size for processing

# ============================================================================
# START THE SERVER
# ============================================================================

"$LLAMA_SERVER" \
    --model "$MODEL_PATH" \
    --host "$HOST" \
    --port "$PORT" \
    -c "$CTX_SIZE" \
    --n-gpu-layers "$N_GPU_LAYERS" \
    -np 1 \
    --no-warmup \
    --cache-type-k "$KV_CACHE_TYPE_K" \
    --cache-type-v "$KV_CACHE_TYPE_V" \
    --temp "$TEMP" \
    --top-p "$TOP_P" \
    --min-p "$MIN_P" \
    --dry-multiplier "$DRY_MULTIPLIER" \
    --batch-size "$BATCH_SIZE" \
    --ubatch-size "$UBATCH_SIZE" \
    --metrics

# ============================================================================
# PARAMETER REFERENCE
# ============================================================================
#
# --model <path>           : Path to GGUF model file
# --host <address>         : Server listen address (0.0.0.0 for all interfaces)
# --port <port>            : Server port
# -c <tokens>              : Context size (max tokens)
# --n-gpu-layers <n>       : Number of layers to offload to GPU (-1 = all)
# -np <n>                  : Number of parallel processing slots
# --no-warmup              : Skip model warmup (faster startup)
# --cache-type-k <type>    : K-cache quantization (q4_0, f16, etc.)
# --cache-type-v <type>    : V-cache quantization (ignored for MLA models)
# --temp <value>           : Temperature (0.0-2.0, higher = more random)
# --top-p <value>          : Top-p sampling (0.0-1.0)
# --min-p <value>          : Min-p sampling (0.0-1.0)
# --dry-multiplier <value> : DRY penalty multiplier (reduces repetition)
# --batch-size <n>         : Max batch size for prompt processing
# --ubatch-size <n>        : Max batch size for generation
# --metrics                : Enable metrics endpoint
#
# ============================================================================
# VRAM USAGE (RTX 4090 24GB with CTX_SIZE=202752)
# ============================================================================
#
# Model weights (IQ4_NL):    ~13 GB
# K-cache (Q4_0, 198k):     ~9 GB
# ----------------------------------------
# Total:                       ~22 GB / 24 GB
#
# With V-less cache (MLA):
# - Saves ~9 GB compared to full KV cache
# - Enables 198k context on 24GB VRAM
#
# ============================================================================
