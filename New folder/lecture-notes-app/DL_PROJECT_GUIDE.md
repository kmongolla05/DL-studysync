# 🎓 StudySync: Academic Deep Learning Project Guide & Viva Defense

---

## 📌 1. Project Title & Overview
**Project Title**: *Comparative Abstractive Summarization and Cognitive Study-Note Synthesis using Encoder-Decoder Transformers and Foundation Models*

**Core Objective**:
Transform dense academic multimedia material (PDF documents, YouTube lecture audio/transcripts, and lecture text) into structured revision guides while conducting an empirical performance comparison between **local PyTorch Sequence-to-Sequence Deep Learning models (T5 / BART)** and **large foundation models (Gemini 2.5 Flash)** evaluated on **ROUGE-1, ROUGE-2, and ROUGE-L** metrics.

---

## 🧠 2. Deep Learning Architecture Breakdown

### A. Sequence-to-Sequence (Seq2Seq) Transformer: T5 & BART
1. **Model Families Used**:
   - **T5 (`google-t5/t5-small`)**: Text-to-Text Transfer Transformer trained on the C4 dataset. Every NLP task is framed as text-to-text generation.
   - **BART (`sshleifer/distilbart-cnn-12-6`)**: A denoising autoencoder sequence-to-sequence model combining a bidirectional encoder (like BERT) with an autoregressive left-to-right decoder (like GPT).
2. **Key Internal Mechanisms**:
   - **Multi-Head Self-Attention**:
     $$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V$$
     Enables the encoder to attend to context across the entire lecture transcript regardless of distance.
   - **Cross-Attention**:
     The decoder queries ($Q$) interact with encoder keys ($K$) and values ($V$) to generate context-grounded summary tokens.
   - **Positional Encoding**:
     Injects sequence order into the permutation-invariant self-attention matrices.
3. **Hierarchical Document Chunking**:
   - When transcript lengths exceed model positional embeddings ($512$ tokens for T5, $1024$ for BART), the engine chunks input text using sliding overlapping windows, generates chunk-level latent representations, and decodes aggregated abstractive summaries.

---

## 📊 3. Quantitative Evaluation Metrics (ROUGE Benchmarks)

Quality of generated abstractive summaries is computed using the standard **ROUGE** (Recall-Oriented Understudy for Gisting Evaluation) framework:

| Metric | Formula / Basis | Academic Meaning |
| :--- | :--- | :--- |
| **ROUGE-1** | $\frac{\sum_{w \in \text{Summary}} \text{Count}_{\text{match}}(w)}{\text{Total Words in Source}}$ | **Lexical Coverage & Concept Recall**: Measures how many individual keywords and concepts from the lecture were captured. |
| **ROUGE-2** | $\frac{\sum_{w_1, w_2 \in \text{Summary}} \text{Count}_{\text{match}}(w_1, w_2)}{\text{Total Bigrams in Source}}$ | **Fluency & Phrasal Coherence**: Measures 2-word phrase overlap, indicating natural language flow. |
| **ROUGE-L** | $\frac{\text{LCS}(\text{Source}, \text{Summary})}{\text{Length of Source}}$ | **Structural Alignment**: Uses the **Longest Common Subsequence** to evaluate in-sequence sentence structure without requiring consecutive matches. |
| **Compression Ratio** | $1 - \frac{\text{Summary Words}}{\text{Source Words}} \times 100\%$ | Quantifies summary density and information condensation rate. |
| **Inference Latency** | Execution time in seconds | Evaluates computational efficiency on edge/CPU hardware versus cloud network round-trip. |

---

## ⚡ 4. Two Distinct Summary Modes Explained

1. **Quick Revision Mode**:
   - **Purpose**: Rapid exam prep and high-yield flashcard review.
   - **Generation Parameters**:
     - Constrained sequence length (`max_length=60-75`, `min_length=25`).
     - Lower beam width (`num_beams=2`) with `length_penalty=1.0`.
     - Filters out peripheral examples to isolate core thesis statements.
2. **Detailed Notes Mode**:
   - **Purpose**: Deep conceptual retention and textbook-style structured synthesis.
   - **Generation Parameters**:
     - Expanded sequence length (`max_length=150-160`, `min_length=50-60`).
     - Enhanced beam exploration (`num_beams=4`) with higher penalty (`length_penalty=2.0`).
     - Generates multi-sentence thematic abstractions with nuanced explanations.

---

## 🗣️ 5. Viva Voce Defense: Expected Questions & Model Answers

### Q1: "Is this just an API call or did you actually use Deep Learning?"
> **Answer**:
> *"We implemented a hybrid architecture. While we use a cloud foundation model for generating structured study artefacts (flashcards, quizzes), our core summarization engine runs an open-source **Deep Learning Sequence-to-Sequence Transformer (T5 / DistilBART)** implemented locally in **PyTorch and Hugging Face Transformers** (`dl_service/app.py`). It executes full tensor forward passes, multi-head attention, and beam search decoding on local compute, and is evaluated with ROUGE metrics."*

### Q2: "What is the difference between Extractive and Abstractive summarization?"
> **Answer**:
> *"**Extractive summarization** ranks and copies verbatim sentences directly from the source text (acting like a highlighter). **Abstractive summarization**—which our Seq2Seq Transformer performs—builds an intermediate semantic latent space and generates novel, rephrased sentences that did not exist word-for-word in the transcript, producing a synthesized narrative."*

### Q3: "Why compare T5/BART against Gemini?"
> **Answer**:
> *"It allows us to study the engineering and academic trade-offs between **Task-Specific Small Transformers (240MB–1.1GB)** and **General-Purpose Foundation LLMs**:*
> *1. Local Seq2Seq models can run on edge devices without data privacy concerns or internet access, with deterministic beam decoding.*
> *2. Foundation LLMs achieve marginally higher ROUGE and fluency scores due to massive pre-training corpora, but require external API dependencies, network latency, and incur token costs."*

### Q4: "How does Beam Search work in your decoding process?"
> **Answer**:
> *"Greedy search picks the single token with the highest conditional probability at each step ($P(y_t | y_{<t}, x)$), which can lead to sub-optimal local minima. In our implementation, we use **Beam Search** with beam widths of 2 to 4. It maintains the $k$ most probable sequence hypotheses across each generation step, choosing the globally highest probability path across the entire summary."*

---

## 🚀 6. How to Run the Project for Viva / Demo

Double click `start_project.bat` in the project root, or launch the 3 services in separate terminals:

1. **Terminal 1 (Python DL Engine)**:
   ```bash
   cd dl_service
   python app.py
   ```
2. **Terminal 2 (Express Backend Gateway)**:
   ```bash
   cd server
   npm run dev
   ```
3. **Terminal 3 (React Frontend)**:
   ```bash
   cd client
   npm run dev
   ```

Visit `http://localhost:5173` in your browser.
