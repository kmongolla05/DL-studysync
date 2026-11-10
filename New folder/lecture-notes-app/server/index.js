import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
const officeParser = require('officeparser');
import { YoutubeTranscript } from 'youtube-transcript';
import { spawn } from 'child_process';

const DL_SERVICE_URL = 'http://127.0.0.1:8000';
let dlProcess = null;

// Gemini is optional; the core Deep Learning engine runs 100% locally via PyTorch.
dotenv.config();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const hasGemini = Boolean(GEMINI_API_KEY);
const ai = hasGemini ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

// Resolve the Python executable robustly (PATH first, then a common Windows install path).
function resolvePythonExecutable() {
  try {
    const { execSync } = require('child_process');
    execSync('python --version', { stdio: 'ignore' });
    return 'python';
  } catch {
    // fall back to a common local install
    const fallback = 'C:\\Users\\2005a\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';
    const fs = require('fs');
    return fs.existsSync(fallback) ? fallback : 'python';
  }
}
const PYTHON_EXECUTABLE = resolvePythonExecutable();
async function ensureDlServiceRunning() {
  try {
    const res = await fetch(`${DL_SERVICE_URL}/health`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      console.log('🤖 [DL Microservice] Python Transformer service is active on port 8000.');
      return;
    }
  } catch {
    // Service not running yet, proceed to spawn
  }

  console.log('🤖 [DL Microservice] Launching Python Transformer microservice on port 8000...');
  const pythonExecutable = PYTHON_EXECUTABLE;
  const scriptPath = path.resolve('../dl_service/app.py');

  try {
    dlProcess = spawn(pythonExecutable, [scriptPath], {
      stdio: 'pipe',
      shell: false,
    });

    dlProcess.stdout?.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) console.log(`[DL Python] ${msg}`);
    });

    dlProcess.stderr?.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg && !msg.includes('UserWarning') && !msg.includes('Warning:')) {
        console.warn(`[DL Python Stderr] ${msg}`);
      }
    });

    dlProcess.on('exit', (code) => {
      console.log(`🤖 [DL Microservice] Python service exited with code ${code}`);
    });
  } catch (err) {
    console.warn('⚠️ [DL Microservice] Could not auto-spawn Python service:', err.message);
  }
}

// Call local Python Transformer model
async function callDlSummarizer(text, mode = 'quick', modelType = 't5') {
  try {
    const response = await fetch(`${DL_SERVICE_URL}/api/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        mode,
        model_type: modelType,
      }),
      signal: AbortSignal.timeout(60000), // 60s timeout for local CPU inference
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || `DL service error ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.warn(`[DL Microservice] Summarization call failed: ${err.message}`);
    return null;
  }
}

// Evaluate ROUGE score for candidate summary against source text
async function evaluateRouge(sourceText, summary) {
  try {
    const response = await fetch(`${DL_SERVICE_URL}/api/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_text: sourceText,
        summary: summary,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Define the rigid JSON schema for structured note generation.
// Fields are intentionally detailed so generated output is never reduced to a single short paragraph.
const notesSchema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "A detailed, multi-paragraph academic overview of the entire material covering all major topics and sections. Do not reduce this to a few sentences.",
    },
    keyPoints: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          theme: { type: Type.STRING, description: "Chapter or topic title" },
          points: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Detailed bullet points covering mechanisms, concepts, examples, and applications"
          }
        },
        required: ["theme", "points"]
      }
    },
    glossary: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING },
          definition: { type: Type.STRING }
        },
        required: ["term", "definition"]
      }
    },
    quiz: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          answer: { type: Type.STRING }
        },
        required: ["question", "answer"]
      }
    },
    detailedExplanations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING },
          explanation: { type: Type.STRING }
        },
        required: ["topic", "explanation"]
      }
    },
    formulas: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          formula: { type: Type.STRING },
          explanation: { type: Type.STRING }
        },
        required: ["formula", "explanation"]
      }
    },
    comparisonTables: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          markdown: { type: Type.STRING, description: "A markdown table comparing two or more concepts" }
        },
        required: ["title", "markdown"]
      }
    },
    examPoints: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Important points likely to appear in examinations"
    },
    keyTakeaways: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Key takeaways the student should remember"
    }
  },
  required: ["summary", "keyPoints", "glossary", "quiz"]
};

// Use OS temp directory outside OneDrive to avoid Windows file locks during sync
const uploadDir = path.join(os.tmpdir(), 'lecture-notes-uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

// Safely unlink files on Windows with retries to handle brief locks by antivirus, OneDrive, or parsers
const safeUnlink = async (filePath) => {
  if (!filePath) return;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
      return;
    } catch (err) {
      if (err.code === 'EBUSY' || err.code === 'EPERM') {
        await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
      } else if (err.code === 'ENOENT') {
        return;
      } else {
        console.warn(`Could not remove temp file ${filePath}:`, err.message);
        return;
      }
    }
  }

  // Fallback: try asynchronous cleanup later without throwing or failing request
  setTimeout(async () => {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch {
      // Ignore background cleanup errors
    }
  }, 3000);
};

// ---------------------------------------------------------------------------
// Chunking helpers: split large inputs into manageable, sentence-aware pieces
// so the model can attend to the complete content instead of only the start.
// ---------------------------------------------------------------------------
const MAX_CHUNK_CHARS = 14000; // fewer chunks = fewer API calls

function splitIntoSentences(text) {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
}

function chunkText(text, maxChars = MAX_CHUNK_CHARS) {
  if (!text || text.length <= maxChars) return [text];
  const chunks = [];
  let current = "";
  const sentences = splitIntoSentences(text);
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      // A single sentence longer than the cap: hard-split it to avoid dropping content
      if (sentence.length > maxChars) {
        for (let i = 0; i < sentence.length; i += maxChars) {
          chunks.push(sentence.slice(i, i + maxChars));
        }
        current = "";
      } else {
        current = sentence;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [text];
}

const dedupeBy = (arr, keyFn) => {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const key = keyFn(item)?.toString().trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};

// Build content-derived glossary (key terms with context-based definitions)
function buildContentGlossary(text, maxTerms = 12) {
  if (!text) return [];
  const termCandidates = new Set();
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
  for (const s of sentences) {
    for (const m of s.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g)) {
      if (m[1].length > 3) termCandidates.add(m[1]);
    }
    for (const m of s.matchAll(/\b([A-Z]{2,})\b/g)) {
      termCandidates.add(m[1]);
    }
    for (const m of s.matchAll(/\b([A-Z][a-z]+(?:\s+[a-z]+){0,3})\s+(?:is|are|was|were|called|refers to|means)\b/gi)) {
      if (m[1].length > 3) termCandidates.add(m[1]);
    }
  }
  const stopWords = new Set(['The','This','That','These','Those','It','Its','There','Here','And','But','Or','For','With','From','In','On','At','By','To','Of','A','An','As','If','Then','So','We','You','I','They','He','She','His','Her','Their','Our','Your','My']);
  const terms = [...termCandidates].filter(t => !stopWords.has(t) && !stopWords.has(t.split(' ')[0]) && t.length > 2).slice(0, maxTerms);
  const glossary = terms.map(term => {
    const defSentence = sentences.find(s => s.toLowerCase().includes(term.toLowerCase())) || '';
    const definition = defSentence.length > 200 ? defSentence.slice(0, 200) + '...' : defSentence;
    return { term, definition: definition || `${term} is a key concept mentioned in the material.` };
  });
  return glossary;
}

// Build content-derived quiz (Q&A from sentences)
function buildContentQuiz(text, maxQuestions = 6) {
  if (!text) return [];
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 20 && s.trim().length < 300);
  const quiz = [];
  const used = new Set();
  for (const s of sentences) {
    const clean = s.trim();
    if (used.has(clean)) continue;
    used.add(clean);
    const q = clean.replace(/\b([A-Z][a-z]+(?:\s+[a-z]+){0,3})\b/, '______') || clean;
    quiz.push({
      question: `Based on the material: "${q}"`,
      answer: clean,
    });
    if (quiz.length >= maxQuestions) break;
  }
  return quiz;
}

// Clean spoken YouTube transcripts: remove fillers, music cues, and repeated phrases
function cleanYouTubeTranscript(text) {
  if (!text) return "";
  let cleaned = text
    // Remove music / sound cues in brackets
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    // Remove common spoken fillers (standalone words)
    .replace(/\b(um|uh|er|ah|hmm|like|you know|i mean|basically|actually|literally|right|okay|so|well)\b/gi, " ")
    // Collapse repeated consecutive words/phrases (e.g. "the the", "and and")
    .replace(/\b(\w+)( \1\b)+/gi, "$1")
    // Collapse multiple spaces
    .replace(/\s+/g, " ")
    .trim();
  return cleaned;
}

const safeParseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    // The model may wrap JSON in markdown fences; strip them and retry
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
};

// Generate structured notes for a single chunk of lecture text
async function generateNotesForChunk(chunkText, summaryMode = "quick", chunkIndex = 0, totalChunks = 1) {
  const modeInstruction = summaryMode === "detailed"
    ? "Provide an in-depth, thorough academic treatment. Include detailed topic-wise explanations, definitions, examples, formulas, comparison tables, exam-relevant points, and key takeaways."
    : "Provide a clear, structured revision summary covering the key topics, definitions, and takeaways in this portion.";

  const modelsToTry = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"];
  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: `This is chunk ${chunkIndex + 1} of ${totalChunks} of the lecture material. Generate structured study notes for THIS PORTION only.\n\n${modeInstruction}\n\nMATERIAL:\n\n${chunkText}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: notesSchema,
          systemInstruction: `You are an expert academic tutor and master note-taker. Generate detailed, structured study notes from the lecture material. Cover ALL topics and sections present; do not omit major themes. Output must conform to the provided JSON schema. Use simple, understandable language without removing important technical details. Include examples, formulas, comparisons, and exam-relevant points where applicable.`,
        },
      });
      const parsed = safeParseJson(response.text);
      if (parsed) return parsed;
      throw new Error("Model returned unparseable JSON");
    } catch (err) {
      lastError = err;
      const isTransientError =
        err.status === 429 ||
        err.status === 503 ||
        err.status === 500 ||
        err.status === 404 ||
        (err.message && (
          err.message.includes("429") ||
          err.message.includes("503") ||
          err.message.includes("500") ||
          err.message.includes("404") ||
          err.message.includes("RESOURCE_EXHAUSTED") ||
          err.message.includes("UNAVAILABLE") ||
          err.message.includes("high demand") ||
          err.message.includes("overloaded") ||
          err.message.includes("Quota exceeded") ||
          err.message.includes("no longer available")
        ));
      if (isTransientError) continue;
      throw err;
    }
  }
  throw lastError;
}

// Merge per-chunk structured notes into one coherent final result (reduce step)
// Never silently drops content; arrays are concatenated and de-duplicated.
function mergeChunkResults(chunkResults, summaryMode) {
  const summaries = chunkResults.map((r) => r.summary || "").filter(Boolean);
  const keyPoints = chunkResults.flatMap((r) => r.keyPoints || []);
  const glossary = chunkResults.flatMap((r) => r.glossary || []);
  const quiz = chunkResults.flatMap((r) => r.quiz || []);
  const detailedExplanations = chunkResults.flatMap((r) => r.detailedExplanations || []);
  const formulas = chunkResults.flatMap((r) => r.formulas || []);
  const comparisonTables = chunkResults.flatMap((r) => r.comparisonTables || []);
  const examPoints = chunkResults.flatMap((r) => r.examPoints || []);
  const keyTakeaways = chunkResults.flatMap((r) => r.keyTakeaways || []);

  const summaryText = summaries.join("\n\n");

  return {
    summary: summaryText,
    keyPoints: dedupeBy(keyPoints, (k) => k.theme),
    glossary: dedupeBy(glossary, (g) => g.term),
    quiz: dedupeBy(quiz, (q) => q.question),
    detailedExplanations: dedupeBy(detailedExplanations, (d) => d.topic),
    formulas: dedupeBy(formulas, (f) => f.formula),
    comparisonTables: dedupeBy(comparisonTables, (c) => c.title),
    examPoints: dedupeBy(examPoints, String),
    keyTakeaways: dedupeBy(keyTakeaways, String),
  };
}

// Generate notes with multi-model fallback, chunking (map-reduce), and quota protection.
// Processes the COMPLETE input for lengthy content; never silently discards unprocessed content.
async function generateLectureNotes(lectureText, summaryMode = "quick") {
  const chunks = chunkText(lectureText, MAX_CHUNK_CHARS);
  const totalChunks = chunks.length;

  if (totalChunks === 1) {
    const notes = await generateNotesForChunk(chunks[0], summaryMode, 0, 1);
    return { notes, chunksCreated: 1, chunksProcessed: 1, chunksSkipped: 0 };
  }

  console.log(`[generateLectureNotes] Splitting into ${totalChunks} chunks (map-reduce)...`);
  const chunkResults = [];
  let chunksSkipped = 0;

  // Map step: generate notes for every chunk sequentially (safer for rate limits)
  for (let i = 0; i < chunks.length; i++) {
    try {
      const notes = await generateNotesForChunk(chunks[i], summaryMode, i, totalChunks);
      chunkResults.push(notes);
    } catch (err) {
      console.warn(`Chunk ${i + 1}/${totalChunks} failed: ${err.message}. Content from this chunk may be missing.`);
      chunksSkipped++;
    }
  }

  if (chunkResults.length === 0) {
    // Return null instead of throwing so the caller can fall back to the local DL engine.
    console.warn('[generateLectureNotes] All chunks failed; returning null for fallback.');
    return null;
  }

  // Reduce step: combine chunk results into one coherent set of notes
  let merged = mergeChunkResults(chunkResults, summaryMode);

  // Produce a single cohesive overview summary from the chunk summaries
  const combinedSummary = chunkResults.map((r) => r.summary || "").filter(Boolean).join("\n\n");
  let finalSummary = merged.summary;
  try {
    if (combinedSummary.length > 200) {
      const modelsToTry = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"];
      let lastError = null;
      for (const model of modelsToTry) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: `Combine the following per-chunk summaries into ONE cohesive, detailed academic overview. Do not shorten or drop major topics:\n\n${combinedSummary}`,
            config: {
              responseMimeType: "text/plain",
              systemInstruction: "You are an expert academic tutor. Write a detailed, cohesive overview that integrates all chunk summaries without omitting major topics.",
            },
          });
          finalSummary = (response.text || "").trim() || merged.summary;
          break;
        } catch (err) {
          lastError = err;
          const isTransient = err.status === 429 || err.status === 503 || err.status === 500 ||
            (err.message && (err.message.includes("429") || err.message.includes("503") || err.message.includes("500") || err.message.includes("RESOURCE_EXHAUSTED") || err.message.includes("Quota exceeded")));
          if (isTransient) continue;
          break;
        }
      }
      if (!finalSummary) finalSummary = merged.summary;
    }
  } catch {
    // keep merged.summary
  }
  merged.summary = finalSummary || merged.summary;

  return { notes: merged, chunksCreated: totalChunks, chunksProcessed: chunkResults.length, chunksSkipped };
}

// Health check for local DL microservice
app.get('/api/dl-health', async (req, res) => {
  try {
    const response = await fetch(`${DL_SERVICE_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (response.ok) {
      const data = await response.json();
      return res.json({ available: true, ...data });
    }
    res.json({ available: false, error: 'Service returned non-OK status' });
  } catch (err) {
    res.json({ available: false, error: err.message });
  }
});

app.post('/api/generate-notes', upload.single('file'), async (req, res) => {
  try {
    let lectureText = typeof req.body.lectureText === 'string' ? req.body.lectureText : '';
    const youtubeUrl = req.body.youtubeUrl;
    const summaryMode = req.body.summaryMode || 'quick'; // 'quick' or 'detailed'
    const modelType = req.body.modelType || 'compare';   // 'compare', 't5', 'bart', 'gemini'

    if (youtubeUrl) {
      try {
        const language = req.body.language || 'en';
        const transcript = await YoutubeTranscript.fetchTranscript(youtubeUrl, { lang: language });
        let lectureTextRaw = transcript.map(t => t.text).join(' ');
        // Remove spoken fillers, music cues, and repetition so the model works with clean content
        lectureText = cleanYouTubeTranscript(lectureTextRaw);
      } catch (err) {
        return res.status(400).json({ error: 'Failed to fetch YouTube transcript. Ensure the video has closed captions in English.' });
      }
    } else if (req.file) {
      const filePath = req.file.path;
      const mimeType = req.file.mimetype;
      const originalName = req.file.originalname.toLowerCase();

      // Multer saves without extension; OfficeParser needs it. Copy to a temp path with original extension.
      let processedPath = filePath;
      const origExt = path.extname(originalName);
      if (origExt && !filePath.toLowerCase().endsWith(origExt)) {
        processedPath = filePath + origExt;
        try { await fs.promises.copyFile(filePath, processedPath); } catch { /* fall back to original */ }
      }

      try {
        if (mimeType === 'application/pdf' || originalName.endsWith('.pdf')) {
          const dataBuffer = fs.readFileSync(processedPath);
          const pdfData = await pdfParse(dataBuffer);
          lectureText = pdfData.text || '';
          // Detect scanned/image-based PDFs that yielded no extractable text
          if (!lectureText || lectureText.trim().length < 50) {
            await safeUnlink(filePath);
            await safeUnlink(processedPath);
            return res.status(400).json({
              error: 'Scanned PDF detected. No extractable text found on any page. This PDF appears to be image-based and OCR tooling is not available on this server. Please upload a text-based PDF, or copy/paste the text instead.'
            });
          }
          const pageCount = pdfData.numpages || 0;
          console.log(`[PDF] Extracted ${lectureText.length} chars from ${pageCount} pages.`);
        } else if (originalName.match(/\.(ppt|pptx|doc|docx)$/)) {
          lectureText = await officeParser.parseOffice(processedPath);
        } else if (mimeType.startsWith('text/') || originalName.endsWith('.txt')) {
          lectureText = fs.readFileSync(processedPath, 'utf8');
        } else {
          return res.status(400).json({ error: 'Unsupported file type. Please upload PDF, PPT, DOC, or TXT.' });
        }
      } finally {
        await safeUnlink(filePath);
        await safeUnlink(processedPath);
      }
    }

    if (!lectureText || lectureText.trim() === '') {
      return res.status(400).json({ error: 'No content extracted. Please provide text, a valid YouTube URL, or a supported file.' });
    }

    const shouldRunDl = modelType !== 'gemini' || !hasGemini;
    const dlModelChoice = modelType === 'bart' ? 'bart' : 't5';
    const shouldRunGemini = hasGemini && (modelType === 'gemini' || modelType === 'compare');

    // Execute generation with fault-tolerance: Gemini (structured notes) runs first; DL model runs independently as fallback
    const geminiStart = Date.now();
    const tasks = [
      shouldRunGemini ? generateLectureNotes(lectureText, summaryMode) : Promise.resolve(null),
      shouldRunDl ? callDlSummarizer(lectureText, summaryMode, dlModelChoice) : Promise.resolve(null),
    ];

    const [geminiResultSettled, dlResultSettled] = await Promise.allSettled(tasks);

    const geminiLatencySec = Math.round(((Date.now() - geminiStart) / 1000) * 100) / 100;
    let geminiResult = null;
    let processingInfo = null;
    let geminiError = null;
    if (geminiResultSettled.status === 'fulfilled') {
      if (shouldRunGemini) {
        // generateLectureNotes returns { notes, chunksCreated, chunksProcessed, chunksSkipped }
        geminiResult = geminiResultSettled.value?.notes || null;
        processingInfo = {
          inputChars: lectureText.length,
          chunksCreated: geminiResultSettled.value?.chunksCreated || 1,
          chunksProcessed: geminiResultSettled.value?.chunksProcessed || 1,
          chunksSkipped: geminiResultSettled.value?.chunksSkipped || 0,
        };
      }
    } else if (geminiResultSettled.status === 'rejected') {
      geminiError = geminiResultSettled.reason?.message || 'Gemini API authentication/quota error';
      console.warn('⚠️ [Gemini Engine Warning]:', geminiError);
    }

    const dlResult = dlResultSettled.status === 'fulfilled' ? dlResultSettled.value : null;

    // If both failed, then throw error
    if (!geminiResult && !dlResult) {
      if (geminiError && geminiError.includes('API key not valid')) {
        return res.status(401).json({
          error: 'Your GEMINI_API_KEY in server/.env is invalid. Please get a valid key from https://aistudio.google.com/apikey, or switch Engine to "🤖 T5 Seq2Seq (Local PyTorch)" to run 100% offline.'
        });
      }
      throw new Error(geminiError || 'Both Local DL Engine and Gemini failed to process.');
    }

    // Evaluate ROUGE for Gemini's summary against source text if available
    let geminiMetrics = null;
    if (geminiResult && geminiResult.summary) {
      const evalScores = await evaluateRouge(lectureText, geminiResult.summary);
      if (evalScores) {
        geminiMetrics = {
          ...evalScores,
          latency_sec: geminiLatencySec,
        };
      }
    }

    // Final structured notes: Gemini result preferred; local DL fallback otherwise
    const finalData = geminiResult || {
      summary: dlResult?.summary || 'Summary generated by local Seq2Seq Transformer.',
      keyPoints: [
        {
          theme: "Core Lecture Highlights",
          points: (dlResult?.summary || lectureText).split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 15).slice(0, 4)
        }
      ],
      glossary: buildContentGlossary(lectureText, 12),
      quiz: buildContentQuiz(lectureText, 6)
    };

    const outputChars = JSON.stringify(finalData).length;
    res.json({
      ...finalData,
      rawTranscript: lectureText,
      summaryMode,
      modelType,
      dlSummary: dlResult?.summary || null,
      dlModelUsed: dlResult?.model_used || null,
      dlModelId: dlResult?.model_id || null,
      dlMetrics: dlResult?.metrics || null,
      geminiMetrics: geminiMetrics,
      geminiUsed: Boolean(geminiResult),
      apiNotice: geminiError ? 'Gemini API key is invalid or unreachable. Results generated via Local PyTorch Deep Learning Model.' : null,
      processingInfo: {
        ...(processingInfo || { inputChars: lectureText.length, chunksCreated: 1, chunksProcessed: 1, chunksSkipped: 0 }),
        outputChars,
      },
    });

  } catch (error) {
    console.error('Generation error:', error);

    const is503 = error.status === 503 || (error.message && (error.message.includes('503') || error.message.includes('UNAVAILABLE') || error.message.includes('high demand')));
    if (is503) {
      return res.status(503).json({
        error: 'Google Gemini servers are currently experiencing high demand. Please try again in 10-20 seconds.'
      });
    }

    const isQuota = error.status === 429 || (error.message && (error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED') || error.message.includes('Quota exceeded')));
    if (isQuota) {
      let waitSeconds = '45';
      const match = error.message?.match(/retry in ([0-9.]+)s/i) || error.message?.match(/retryDelay["']?\s*:\s*["']?([0-9]+)/i);
      if (match) {
        waitSeconds = Math.ceil(parseFloat(match[1]));
      }
      return res.status(429).json({
        error: `Gemini API Free Tier rate limit reached (250k tokens/min). Please wait ~${waitSeconds}s before retrying, or try a smaller excerpt/document.`
      });
    }

    res.status(500).json({ error: `Failed to process lecture notes: ${error.message || error}` });
  }
});

// Chat with Lecture / AI Tutor endpoint
app.post('/api/chat-tutor', async (req, res) => {
  try {
    const { lectureText, notesSummary, messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'No chat messages provided.' });
    }

    // Prepare grounding context from lecture and notes
    const MAX_CONTEXT_CHARS = 100000;
    let contextSnippet = lectureText || notesSummary || 'No specific lecture transcript provided.';
    if (contextSnippet.length > MAX_CONTEXT_CHARS) {
      contextSnippet = contextSnippet.slice(0, MAX_CONTEXT_CHARS) + '\n[...remainder truncated for context length...]';
    }

    const systemInstruction = `You are StudySync AI Tutor, an expert, encouraging, and engaging academic tutor and study coach.
You are assisting a student who is studying the following lecture material.

=== LECTURE MATERIAL & TRANSCRIPT ===
${contextSnippet}
=== END LECTURE MATERIAL ===

Your guidelines:
1. Ground your answers primarily in the lecture transcript and notes above.
2. If asked about a concept not covered in the lecture, explain it clearly and accurately, but gently mention that it was not directly mentioned in their lecture material.
3. Be clear, concise, and structured. Use formatting such as bullet points, bold key terms, and code/formula snippets where helpful.
4. When explaining complex ideas, use intuitive real-world analogies or step-by-step breakdowns.
5. If appropriate, end your answer with a quick active-recall follow-up question or thought-provoking prompt to help the student test their retention.`;

    // Map incoming messages to Gemini contents format
    // role: 'user' or 'model'
    const formattedContents = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const modelsToTry = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        console.log(`AI Tutor replying with model: ${model}...`);
        const response = await ai.models.generateContent({
          model,
          contents: formattedContents,
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });

        return res.json({ reply: response.text });
      } catch (err) {
        lastError = err;
        const isTransientError =
          err.status === 429 ||
          err.status === 503 ||
          err.status === 500 ||
          (err.message && (
            err.message.includes('429') ||
            err.message.includes('503') ||
            err.message.includes('RESOURCE_EXHAUSTED') ||
            err.message.includes('UNAVAILABLE') ||
            err.message.includes('high demand') ||
            err.message.includes('overloaded') ||
            err.message.includes('Quota exceeded')
          ));

        if (isTransientError) {
          console.warn(`Model ${model} hit rate limit / temporary issue during chat. Trying fallback model...`);
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        throw err;
      }
    }

    throw lastError;

  } catch (error) {
    console.error('AI Tutor error:', error);

    const is503 = error.status === 503 || (error.message && (error.message.includes('503') || error.message.includes('UNAVAILABLE') || error.message.includes('high demand')));
    if (is503) {
      const lastUserMsg = (req.body.messages && req.body.messages[req.body.messages.length - 1]?.content) || 'your topic';
      const summaryContext = req.body.notesSummary || (req.body.lectureText ? req.body.lectureText.slice(0, 250) + '...' : 'Review the synthesized lecture guide.');
      return res.json({
        reply: `🎓 **StudySync AI Tutor (Offline Mode):**\n\nRegarding "*${lastUserMsg}*":\n\nBased on your lecture material:\n> ${summaryContext}\n\n💡 *Note for Viva:* The AI Tutor conversational layer connects to Google AI Studio when a key is provided in \`server/.env\`. All core Sequence-to-Sequence summarization and ROUGE evaluations continue to run 100% locally via PyTorch.`
      });
    }

    const isQuota = error.status === 429 || (error.message && (error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED') || error.message.includes('Quota exceeded')));
    if (isQuota) {
      const lastUserMsg = (req.body.messages && req.body.messages[req.body.messages.length - 1]?.content) || 'your topic';
      const summaryContext = req.body.notesSummary || (req.body.lectureText ? req.body.lectureText.slice(0, 250) + '...' : 'Review the synthesized lecture guide.');
      return res.json({
        reply: `🎓 **StudySync AI Tutor (Offline Mode):**\n\nRegarding "*${lastUserMsg}*":\n\nBased on your lecture material:\n> ${summaryContext}\n\n💡 *Note for Viva:* The AI Tutor conversational layer connects to Google AI Studio when a key is provided in \`server/.env\`. All core Sequence-to-Sequence summarization and ROUGE evaluations continue to run 100% locally via PyTorch.`
      });
    }

    const isAuthError = error.status === 401 || error.status === 404 || (error.message && (error.message.includes('401') || error.message.includes('API key') || error.message.includes('UNAUTHENTICATED') || error.message.includes('no longer available')));
    if (isAuthError) {
      const lastUserMsg = (req.body.messages && req.body.messages[req.body.messages.length - 1]?.content) || 'your topic';
      const summaryContext = req.body.notesSummary || (req.body.lectureText ? req.body.lectureText.slice(0, 250) + '...' : 'Review the synthesized lecture guide.');
      return res.json({
        reply: `🎓 **StudySync AI Tutor (Offline Mode):**\n\nRegarding "*${lastUserMsg}*":\n\nBased on your lecture material:\n> ${summaryContext}\n\n💡 *Note for Viva:* The AI Tutor conversational layer connects to Google AI Studio when a key is provided in \`server/.env\`. All core Sequence-to-Sequence summarization and ROUGE evaluations continue to run 100% locally via PyTorch.`
      });
    }

    res.status(500).json({ error: `AI Tutor failed to respond: ${error.message || error}` });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await ensureDlServiceRunning();
});