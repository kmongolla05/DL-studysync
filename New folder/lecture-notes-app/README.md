# StudySync

StudySync is a full-stack study assistant that converts educational content (PDFs, DOC/PPT/TXT files, raw text, and YouTube transcripts) into structured revision notes, summaries, flashcards, quizzes, and a chat tutor.

## Overview

- Frontend: React (Vite) + Tailwind CSS
- Backend: Node.js/Express gateway
- Deep Learning: Python FastAPI microservice running T5-Small and DistilBART-CNN locally via PyTorch + Hugging Face Transformers
- Optional: Google Gemini API for richer structured notes and chat tutor

## Deep Learning

- Models: google-t5/t5-small, sshleifer/distilbart-cnn-12-6 (DistilBART)
- Approach: abstractive seq2seq summarization with beam search decoding
- Evaluation: ROUGE-1, ROUGE-2, ROUGE-L, compression ratio, latency
- Chunking for long documents

## Features

- Upload PDF/PPT/DOC/TXT or paste text or YouTube URL
- Quick vs Detailed summary modes
- Local DL summarization with ROUGE metrics
- Optional Gemini structured notes (key points, glossary, quiz, formulas, etc.)
- AI Tutor chat grounded in lecture material
- Flashcard deck component

## Folder Structure

`
lecture-notes-app/
  client/        React frontend
  server/        Express backend gateway
  dl_service/    Python DL microservice
  start_project.bat
  requirements.txt
`

## Installation

Backend/Client:
`
cd server && npm install
cd ../client && npm install
`

DL service:
`
cd dl_service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
`

Set server/.env with GEMINI_API_KEY (optional) and PORT.

## Run

`
start_project.bat
`
Or three terminals as in DL_PROJECT_GUIDE.md.

## Limitations

- Gemini features require API key.
- Scanned/image PDFs not supported (no OCR).
- Local DL models run on CPU; inference may be slow.

## Future Improvements

- OCR support, model fine-tuning, caching, tests.

## Author

Add your name/contact here.
