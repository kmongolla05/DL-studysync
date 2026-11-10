import React, { useState } from 'react';
import FlashcardDeck from './components/FlashcardDeck';
import ChatTutor from './components/ChatTutor';

export default function App() {
  const [inputType, setInputType] = useState('text');
  const [lectureText, setLectureText] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notesData, setNotesData] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('notes');
  const [summaryMode, setSummaryMode] = useState('quick');
  const [tutorInitialPrompt, setTutorInitialPrompt] = useState('');
  const [expandedSections, setExpandedSections] = useState({ summary: true });

  const toggleSection = (key) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isExpanded = (key) => expandedSections[key] !== false;

  const handleGenerate = async () => {
    if (inputType === 'text' && !lectureText.trim()) return;
    if (inputType === 'youtube' && !youtubeUrl.trim()) return;
    if (inputType === 'file' && !file) return;

    setLoading(true);
    setError('');
    setNotesData(null);
    setExpandedSections({ summary: true });

    try {
      const formData = new FormData();
      if (inputType === 'text') formData.append('lectureText', lectureText);
      else if (inputType === 'youtube') {
        formData.append('youtubeUrl', youtubeUrl);
        formData.append('language', 'en');
      }
      else if (inputType === 'file') formData.append('file', file);

      formData.append('summaryMode', summaryMode);
      formData.append('modelType', 'compare');

      const response = await fetch('/api/generate-notes', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Something went wrong');

      setNotesData(data);
      setActiveTab('notes');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const askTutorAbout = (promptText) => {
    setTutorInitialPrompt(promptText);
    setActiveTab('chat');
  };

  const handleExportMarkdown = () => {
    if (!notesData) return;
    let md = `# Lecture Study Guide\n\n`;
    md += `## Summary\n${notesData.summary || notesData.dlSummary || ''}\n\n`;
    md += `## Key Points\n`;
    notesData.keyPoints.forEach((kp) => {
      md += `### ${kp.theme}\n`;
      kp.points.forEach((p) => (md += `- ${p}\n`));
      md += `\n`;
    });
    md += `## Glossary\n`;
    notesData.glossary.forEach((g) => {
      md += `- **${g.term}**: ${g.definition}\n`;
    });
    md += `\n## Quiz\n`;
    notesData.quiz.forEach((q, idx) => {
      md += `**Q${idx + 1}: ${q.question}**\n*Answer:* ${q.answer}\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Lecture_Notes.md';
    a.click();
  };

  const Section = ({ key, title, icon, label, children, defaultOpen = true }) => {
    const open = isExpanded(key);
    return (
      <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/50 shadow-sm overflow-hidden">
        <button
          onClick={() => toggleSection(key)}
          className="flex w-full items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800 transition"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <span className="font-semibold text-slate-200">{label}</span>
          </div>
          <span className="text-xs text-slate-500">{open ? '▲' : '▼'}</span>
        </button>
        {open && (
          <div className="border-t border-slate-800/50 p-4">
            <div className="text-sm font-semibold text-slate-400 mb-2 uppercase tracking-wider">{title}</div>
            <div className="text-slate-300 text-[15px] leading-relaxed">{children}</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-2 md:p-4 max-w-[1600px] mx-auto">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-800 pb-3 mb-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent tracking-tight">
            🧠 StudySync
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Turn lecture text into structured, detailed study notes using AI.
          </p>
        </div>
        {notesData && (
          <button
            onClick={handleExportMarkdown}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-md"
          >
            📄 Export Markdown
          </button>
        )}
      </header>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/20 border border-red-800 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 h-[calc(100vh-140px)]">

        {/* Left Panel: Input */}
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl xl:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-indigo-400 font-bold text-sm">1</span>
            <h2 className="text-lg font-semibold text-slate-200">Add Source Material</h2>
          </div>

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setInputType('text')}
              className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium transition ${inputType === 'text' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              📝 Paste Text
            </button>
            <button
              onClick={() => setInputType('youtube')}
              className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium transition ${inputType === 'youtube' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              🎬 YouTube
            </button>
            <button
              onClick={() => setInputType('file')}
              className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium transition ${inputType === 'file' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              📎 Upload File
            </button>
          </div>

          {inputType === 'text' && (
            <textarea
              value={lectureText}
              onChange={(e) => setLectureText(e.target.value)}
              placeholder="Paste your lecture text or transcript here..."
              className="w-full min-h-[200px] p-4 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500 resize-none text-base leading-relaxed"
            />
          )}

          {inputType === 'youtube' && (
            <div className="flex-grow flex flex-col gap-3">
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full p-4 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500 text-base"
              />
              <p className="text-slate-500 text-xs">English captions required</p>
            </div>
          )}

          {inputType === 'file' && (
            <div className="flex-grow flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-xl p-8 bg-slate-950/50 hover:border-indigo-500/50 transition">
              <input
                type="file"
                accept=".pdf,.ppt,.pptx,.doc,.docx,.txt"
                onChange={(e) => setFile(e.target.files[0])}
                className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
              />
              {file && <p className="mt-4 text-emerald-400 text-sm font-medium">Selected: {file.name}</p>}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 mt-3">
            <select
              value={summaryMode}
              onChange={(e) => setSummaryMode(e.target.value)}
              className="flex-1 p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 text-sm"
            >
              <option value="quick">Quick Revision</option>
              <option value="detailed">Detailed Notes</option>
            </select>
            <button
              onClick={handleGenerate}
              disabled={loading || (inputType === 'text' && !lectureText.trim()) || (inputType === 'youtube' && !youtubeUrl.trim()) || (inputType === 'file' && !file)}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white py-3 rounded-xl font-bold transition shadow-lg"
            >
              {loading ? 'Generating...' : 'Generate Study Notes'}
            </button>
          </div>
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </div>

        {/* Right Panel: Output */}
        <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl overflow-hidden xl:col-span-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 flex-shrink-0">
            <h2 className="text-lg font-semibold text-slate-200">
              {activeTab === 'notes' ? '2. Study Notes' : activeTab === 'flashcards' ? '2. Flashcards' : '2. AI Tutor'}
            </h2>
            {notesData && (
              <div className="flex gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                <button
                  onClick={() => setActiveTab('notes')}
                  className={`px-3 py-1.5 rounded-md font-medium transition ${activeTab === 'notes' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  📄 Notes
                </button>
                <button
                  onClick={() => setActiveTab('flashcards')}
                  className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ${activeTab === 'flashcards' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  <span>🃏 Cards</span>
                  <span className="bg-indigo-900/80 text-indigo-300 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                    {(notesData.glossary?.length || 0) + (notesData.quiz?.length || 0)}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`px-3 py-1.5 rounded-md font-medium transition ${activeTab === 'chat' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  💬 AI Tutor
                </button>
              </div>
            )}
          </div>

          <div className="flex-grow overflow-y-auto pr-2">
            {!notesData && !loading && (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 text-center p-12">
                <p className="text-5xl mb-3">📂</p>
                <p className="text-lg">Your study notes, flashcards, and AI tutor will appear here.</p>
                <p className="text-xs text-slate-600 mt-2">Upload a file, paste text, or add a YouTube link to get started.</p>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center h-full text-indigo-400 gap-4 text-center p-12">
                <div className="animate-spin rounded-full h-14 w-14 border-b-4 border-indigo-500"></div>
                <div>
                  <p className="text-xl font-bold animate-pulse text-indigo-300 mb-2">Generating Notes...</p>
                  <p className="text-sm text-slate-400 max-w-sm">Processing your content into detailed notes.</p>
                </div>
              </div>
            )}

            {notesData && activeTab === 'notes' && (
              <div className="space-y-5">
                {notesData.apiNotice && (
                  <div className="bg-amber-900/30 border border-amber-800/50 text-amber-300 px-4 py-3 rounded-lg text-sm flex items-center gap-3">
                    <span className="text-lg">⚡</span>
                    <span><strong>Offline Mode:</strong> {notesData.apiNotice}</span>
                  </div>
                )}

                <Section
                  key="summary"
                  label="Summary"
                  icon="🎯"
                  defaultOpen
                >
                  <p className="text-base leading-relaxed text-slate-300 whitespace-pre-wrap">
                    {notesData.summary || notesData.dlSummary || ''}
                  </p>
                </Section>

                {notesData.keyPoints?.length > 0 && (
                  <Section
                    key="keyPoints"
                    label="Key Points"
                    icon="📌"
                    defaultOpen
                  >
                    <div className="space-y-3">
                      {notesData.keyPoints.map((kp, index) => (
                        <div key={index} className="p-3 rounded-lg border border-slate-800 bg-slate-950/50">
                          <div className="font-semibold text-slate-200 mb-2">{kp.theme}</div>
                          <ul className="list-disc list-inside space-y-1 text-slate-300 text-sm">
                            {kp.points.map((pt, pIdx) => (
                              <li key={pIdx}>{pt}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {notesData.glossary?.length > 0 && (
                  <Section key="glossary" label="Critical Vocabulary" icon="📖">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {notesData.glossary.map((item, idx) => (
                        <div key={idx} className="border-b border-slate-900 pb-3 flex justify-between items-start gap-3 last:border-0 last:pb-0">
                          <div>
                            <span className="font-semibold text-slate-200">{item.term}: </span>
                            <span className="text-slate-400">{item.definition}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setActiveTab('flashcards')}
                      className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 font-semibold underline flex items-center gap-1"
                    >
                      Practice as Flashcards →
                    </button>
                  </Section>
                )}

                {notesData.quiz?.length > 0 && (
                  <Section key="quiz" label="Active Recall Quiz" icon="❓">
                    <div className="space-y-3">
                      {notesData.quiz.map((q, idx) => (
                        <div key={idx} className="bg-slate-900 p-3 rounded border border-slate-800">
                          <p className="font-medium text-slate-200 mb-1">Q{idx + 1}: {q.question}</p>
                          <details className="text-slate-400 text-xs cursor-pointer">
                            <summary className="text-indigo-400 hover:underline font-semibold">Reveal Answer</summary>
                            <p className="mt-1 text-slate-300 bg-slate-950 p-2 rounded">{q.answer}</p>
                          </details>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setActiveTab('flashcards')}
                      className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 font-semibold underline flex items-center gap-1"
                    >
                      Practice in Deck Mode →
                    </button>
                  </Section>
                )}

                {notesData.detailedExplanations?.length > 0 && (
                  <Section key="explanations" label="Chapter-wise Explanations" icon="📚">
                    <div className="space-y-3">
                      {notesData.detailedExplanations.map((d, idx) => (
                        <div key={idx} className="bg-slate-900/50 p-3 rounded border border-slate-800/50">
                          <div className="font-semibold text-slate-200 mb-1">{d.topic}</div>
                          <p className="text-slate-300 leading-relaxed text-sm">{d.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {notesData.formulas?.length > 0 && (
                  <Section key="formulas" label="Formulas" icon="🧮">
                    <div className="space-y-2">
                      {notesData.formulas.map((f, idx) => (
                        <div key={idx} className="bg-slate-900/50 p-3 rounded border border-slate-800/50">
                          <div className="font-semibold text-slate-200 mb-1">{f.formula}</div>
                          <p className="text-slate-300 leading-relaxed text-sm">{f.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {notesData.comparisonTables?.length > 0 && (
                  <Section key="tables" label="Comparison Tables" icon="⚖️">
                    <div className="space-y-3 overflow-x-auto">
                      {notesData.comparisonTables.map((t, idx) => (
                        <div key={idx} className="bg-slate-900/50 p-3 rounded border border-slate-800/50 whitespace-pre-wrap">
                          <div className="font-semibold text-slate-200 mb-2">{t.title}</div>
                          <div className="text-sm text-slate-300">{t.markdown}</div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {notesData.examPoints?.length > 0 && (
                  <Section key="exam" label="Exam-focused Points" icon="⚠️">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(notesData.examPoints || []).map((p, idx) => (
                        <div key={idx} className="bg-slate-900/50 p-2 rounded border border-slate-800/50 text-slate-300 text-sm">
                          • {p}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {notesData.keyTakeaways?.length > 0 && (
                  <Section key="takeaways" label="Key Takeaways" icon="🎯">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(notesData.keyTakeaways || []).map((p, idx) => (
                        <div key={idx} className="bg-slate-900/50 p-2 rounded border border-slate-800/50 text-slate-300 text-sm">
                          • {p}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {notesData.processingInfo && (
                  <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-800 text-xs text-slate-500">
                    <strong>Processing:</strong> {notesData.processingInfo.chunksProcessed}/{notesData.processingInfo.chunksCreated} chunks processed
                    {notesData.processingInfo.chunksSkipped > 0 && `, ${notesData.processingInfo.chunksSkipped} skipped`}
                    &nbsp;|&nbsp; Input {notesData.processingInfo.inputChars} chars
                    &nbsp;|&nbsp; Output {notesData.processingInfo.outputChars} chars
                  </div>
                )}
              </div>
            )}

            {notesData && activeTab === 'flashcards' && (
              <FlashcardDeck glossary={notesData.glossary} quiz={notesData.quiz} />
            )}

            {notesData && activeTab === 'chat' && (
              <ChatTutor
                lectureText={lectureText}
                notesData={notesData}
                initialPrompt={tutorInitialPrompt}
                onClearInitialPrompt={() => setTutorInitialPrompt('')}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
