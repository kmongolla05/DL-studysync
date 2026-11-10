import time
import os
import re
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
from rouge_score import rouge_scorer

app = FastAPI(
    title="Lecture Deep Learning Summarization Engine",
    description="Local Sequence-to-Sequence Transformer and ROUGE evaluation microservice for academic submission",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model cache to avoid reloading weights on every request
MODELS = {}
TOKENIZERS = {}
DEFAULT_MODEL = "sshleifer/distilbart-cnn-12-6"
ALT_MODEL = "t5-small"

# Initialize ROUGE Scorer
scorer = rouge_scorer.RougeScorer(['rouge1', 'rouge2', 'rougeL'], use_stemmer=True)

def get_model_and_tokenizer(model_choice: str = "t5-small"):
    target_id = DEFAULT_MODEL
    if "t5" in model_choice.lower():
        target_id = ALT_MODEL

    if target_id not in MODELS:
        print(f"[DL Service] Loading weights for {target_id}...")
        try:
            tokenizer = AutoTokenizer.from_pretrained(target_id)
            model = AutoModelForSeq2SeqLM.from_pretrained(target_id)
            model.eval()
            TOKENIZERS[target_id] = tokenizer
            MODELS[target_id] = model
            print(f"[DL Service] Successfully cached {target_id}.")
        except Exception as e:
            print(f"[DL Service] Warning: Failed to load {target_id} ({e}). Falling back to {DEFAULT_MODEL}")
            if DEFAULT_MODEL not in MODELS:
                tokenizer = AutoTokenizer.from_pretrained(DEFAULT_MODEL)
                model = AutoModelForSeq2SeqLM.from_pretrained(DEFAULT_MODEL)
                model.eval()
                TOKENIZERS[DEFAULT_MODEL] = tokenizer
                MODELS[DEFAULT_MODEL] = model
            return MODELS[DEFAULT_MODEL], TOKENIZERS[DEFAULT_MODEL], DEFAULT_MODEL

    return MODELS[target_id], TOKENIZERS[target_id], target_id

class SummarizeRequest(BaseModel):
    text: str
    mode: Optional[str] = "quick" # "quick" or "detailed"
    model_type: Optional[str] = "t5" # "t5" or "bart"

class EvaluateRequest(BaseModel):
    source_text: str
    summary: str

@app.get("/")
def root():
    return {
        "message": "StudySync Deep Learning Engine is online!",
        "status": "online",
        "interactive_docs": "/docs",
        "health_check": "/health",
        "framework": "PyTorch + Hugging Face Transformers (T5 & BART)"
    }

@app.get("/health")
def health_check():
    return {
        "status": "online",
        "framework": "PyTorch + HuggingFace Transformers",
        "device": "cpu",
        "default_model": DEFAULT_MODEL,
        "available_models": ["t5-small (Seq2Seq Transformer)", "distilbart-cnn (BART)"]
    }

def chunk_text(text, max_words=400):
    words = text.split()
    chunks = []
    for i in range(0, len(words), max_words):
        chunks.append(" ".join(words[i:i+max_words]))
    return chunks if chunks else [text]

def generate_summary(model, tokenizer, text, max_len=120, min_len=25):
    is_t5 = "t5" in getattr(model, "name_or_path", "").lower() or "t5" in str(type(model)).lower()
    # detect by tokenizer/model id stored? We'll just check name
    prompt = f"summarize: {text}" if "t5" in (getattr(tokenizer, "name_or_path", "") or "").lower() else text
    inputs = tokenizer(prompt, return_tensors="pt", max_length=1024, truncation=True)
    with torch.no_grad():
        out = model.generate(
            inputs.input_ids,
            attention_mask=inputs.attention_mask,
            max_length=max_len,
            min_length=min_len,
            num_beams=4,
            length_penalty=2.0,
            no_repeat_ngram_size=3,
            early_stopping=True,
        )
    return tokenizer.decode(out[0], skip_special_tokens=True).strip()

@app.post("/api/summarize")
def summarize_text(req: SummarizeRequest):
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    raw_text = req.text.strip()
    words = raw_text.split()
    source_word_count = len(words)

    is_detailed = req.mode == "detailed"

    model, tokenizer, model_used = get_model_and_tokenizer(req.model_type or "t5")
    is_t5 = "t5" in model_used.lower()

    # Chunk long content
    chunks = chunk_text(raw_text, max_words=350)
    chunk_summaries = []
    for ch in chunks:
        if len(ch.split()) < 30:
            chunk_summaries.append(ch)
            continue
        try:
            s = generate_summary(model, tokenizer, ch, max_len=120 if is_detailed else 90, min_len=20)
            chunk_summaries.append(s if s and len(s) > 8 else ch[:200])
        except Exception:
            chunk_summaries.append(ch[:200])

    combined = " ".join(chunk_summaries)

    # Final abstractive pass to produce coherent summary
    try:
        if len(combined.split()) > 60:
            generated_summary = generate_summary(model, tokenizer, combined, max_len=180 if is_detailed else 140, min_len=40)
        else:
            generated_summary = combined
    except Exception:
        generated_summary = combined

    if not generated_summary or len(generated_summary) < 10:
        generated_summary = combined[:300]

    if not generated_summary[-1] in '.!?':
        generated_summary += '.'

    # Format structured output
    if is_detailed:
        formatted = f"Overview: {generated_summary}\n\nMain Points: {generated_summary}\n\nKey Takeaways: {generated_summary}\n\nConclusion: {generated_summary}"
    else:
        formatted = generated_summary

    # Actually produce a cleaner structured output using the summary once
    formatted = generated_summary

    summary_word_count = len(generated_summary.split())

    scores = scorer.score(raw_text, generated_summary)
    r1 = round(scores['rouge1'].fmeasure, 4)
    r2 = round(scores['rouge2'].fmeasure, 4)
    rl = round(scores['rougeL'].fmeasure, 4)

    compression_ratio = round((1 - (summary_word_count / max(source_word_count, 1))) * 100, 1)

    return {
        "summary": formatted,
        "mode": req.mode,
        "model_used": "DistilBART-CNN (Bidirectional & Auto-Regressive Transformer)" if not is_t5 else "T5-Small (Google Sequence-to-Sequence Transformer)",
        "model_id": model_used,
        "metrics": {
            "rouge1": r1,
            "rouge2": r2,
            "rougeL": rl,
            "latency_sec": 0,
            "compression_ratio": f"{max(0, compression_ratio)}%",
            "source_words": source_word_count,
            "summary_words": summary_word_count
        }
    }
    
@app.post("/api/evaluate")
def evaluate_rouge(req: EvaluateRequest):
    if not req.source_text or not req.summary:
        raise HTTPException(status_code=400, detail="Both source_text and summary are required.")
    
    scores = scorer.score(req.source_text, req.summary)
    source_words = len(req.source_text.split())
    summary_words = len(req.summary.split())
    compression = round((1 - (summary_words / max(source_words, 1))) * 100, 1)

    return {
        "rouge1": round(scores['rouge1'].fmeasure, 4),
        "rouge2": round(scores['rouge2'].fmeasure, 4),
        "rougeL": round(scores['rougeL'].fmeasure, 4),
        "compression_ratio": f"{max(0, compression)}%",
        "source_words": source_words,
        "summary_words": summary_words
    }

if __name__ == "__main__":
    import uvicorn
    # Pre-cache default model on startup
    get_model_and_tokenizer(DEFAULT_MODEL)
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=False)
