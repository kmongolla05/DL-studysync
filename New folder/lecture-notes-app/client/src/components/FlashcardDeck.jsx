import React, { useState, useEffect, useMemo } from 'react';

export default function FlashcardDeck({ glossary = [], quiz = [] }) {
  const [deckType, setDeckType] = useState('all'); // 'all', 'glossary', 'quiz'
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [masteredIds, setMasteredIds] = useState(new Set());
  const [needsReviewIds, setNeedsReviewIds] = useState(new Set());
  const [isCompleted, setIsCompleted] = useState(false);
  const [deckCards, setDeckCards] = useState([]);

  // Compile raw cards based on selection
  const rawCards = useMemo(() => {
    let cards = [];
    if (deckType === 'all' || deckType === 'glossary') {
      const vocabCards = (glossary || []).map((item, idx) => ({
        id: `glossary-${idx}`,
        category: 'Vocabulary',
        front: item.term,
        back: item.definition,
        type: 'term'
      }));
      cards = [...cards, ...vocabCards];
    }

    if (deckType === 'all' || deckType === 'quiz') {
      const quizCards = (quiz || []).map((item, idx) => ({
        id: `quiz-${idx}`,
        category: 'Active Recall',
        front: item.question,
        back: item.answer,
        type: 'question'
      }));
      cards = [...cards, ...quizCards];
    }
    return cards;
  }, [deckType, glossary, quiz]);

  // Reset deck state when deck type or raw cards change
  useEffect(() => {
    setDeckCards([...rawCards]);
    setCurrentIndex(0);
    setIsFlipped(false);
    setMasteredIds(new Set());
    setNeedsReviewIds(new Set());
    setIsCompleted(false);
  }, [rawCards]);

  // Keyboard navigation support
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isCompleted || deckCards.length === 0) return;

      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        setIsFlipped(prev => !prev);
      } else if (e.key === 'ArrowRight' || e.key === '2') {
        e.preventDefault();
        handleMarkMastered();
      } else if (e.key === 'ArrowLeft' || e.key === '1') {
        e.preventDefault();
        handleMarkNeedsReview();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, isFlipped, isCompleted, deckCards]);

  if (!deckCards || deckCards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
        <p className="text-4xl mb-2">🃏</p>
        <p className="text-base font-semibold">No cards available in this deck.</p>
      </div>
    );
  }

  const currentCard = deckCards[currentIndex];

  const handleNextCard = () => {
    setIsFlipped(false);
    if (currentIndex + 1 < deckCards.length) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setIsCompleted(true);
    }
  };

  const handleMarkMastered = () => {
    if (!currentCard) return;
    setMasteredIds(prev => new Set(prev).add(currentCard.id));
    setNeedsReviewIds(prev => {
      const next = new Set(prev);
      next.delete(currentCard.id);
      return next;
    });
    handleNextCard();
  };

  const handleMarkNeedsReview = () => {
    if (!currentCard) return;
    setNeedsReviewIds(prev => new Set(prev).add(currentCard.id));
    setMasteredIds(prev => {
      const next = new Set(prev);
      next.delete(currentCard.id);
      return next;
    });
    handleNextCard();
  };

  const handleShuffle = () => {
    const shuffled = [...deckCards].sort(() => Math.random() - 0.5);
    setDeckCards(shuffled);
    setCurrentIndex(0);
    setIsFlipped(false);
    setIsCompleted(false);
  };

  const handleRestart = (onlyNeedsReview = false) => {
    if (onlyNeedsReview) {
      const filtered = rawCards.filter(card => needsReviewIds.has(card.id));
      setDeckCards(filtered.length > 0 ? filtered : [...rawCards]);
    } else {
      setDeckCards([...rawCards]);
      setMasteredIds(new Set());
      setNeedsReviewIds(new Set());
    }
    setCurrentIndex(0);
    setIsFlipped(false);
    setIsCompleted(false);
  };

  const handleExportAnkiCsv = () => {
    const rows = rawCards.map(c => `"${c.front.replace(/"/g, '""')}","${c.back.replace(/"/g, '""')}"`);
    const csvContent = "Front,Back\n" + rows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Lecture_Flashcards_${deckType}.csv`;
    link.click();
  };

  // Progress calculations
  const total = deckCards.length;
  const progressPercent = Math.round(((currentIndex + (isCompleted ? 1 : 0)) / total) * 100);
  const masteredCount = masteredIds.size;
  const reviewCount = needsReviewIds.size;

  return (
    <div className="flex flex-col h-full gap-4 text-slate-200">
      
      {/* Top Deck Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        {/* Deck Filters */}
        <div className="flex gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setDeckType('all')}
            className={`px-3 py-1.5 rounded-md font-medium transition ${
              deckType === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({rawCards.length})
          </button>
          <button
            onClick={() => setDeckType('glossary')}
            className={`px-3 py-1.5 rounded-md font-medium transition ${
              deckType === 'glossary' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Vocab ({glossary.length})
          </button>
          <button
            onClick={() => setDeckType('quiz')}
            className={`px-3 py-1.5 rounded-md font-medium transition ${
              deckType === 'quiz' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Quiz ({quiz.length})
          </button>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleShuffle}
            title="Shuffle deck"
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-2.5 py-1.5 rounded-md transition"
          >
            <span>🔀</span> Shuffle
          </button>
          <button
            onClick={handleExportAnkiCsv}
            title="Download CSV for Anki / Quizlet"
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs px-2.5 py-1.5 rounded-md transition"
          >
            <span>📥</span> Export Anki
          </button>
        </div>
      </div>

      {/* Completion View */}
      {isCompleted ? (
        <div className="flex-grow flex flex-col items-center justify-center bg-slate-950/70 border border-slate-800 rounded-xl p-6 text-center space-y-5 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-3xl">
            🎉
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-100">Deck Completed!</h3>
            <p className="text-slate-400 text-sm mt-1">Great study session! Here is your mastery breakdown:</p>
          </div>

          {/* Score badges */}
          <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
            <div className="bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg text-center">
              <span className="block text-2xl font-bold text-emerald-400">{masteredCount}</span>
              <span className="text-xs text-emerald-300/80 font-medium">Mastered</span>
            </div>
            <div className="bg-amber-950/40 border border-amber-800/40 p-3 rounded-lg text-center">
              <span className="block text-2xl font-bold text-amber-400">{reviewCount}</span>
              <span className="text-xs text-amber-300/80 font-medium">Needs Review</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
            {reviewCount > 0 && (
              <button
                onClick={() => handleRestart(true)}
                className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition shadow-lg"
              >
                Review Missed Cards ({reviewCount})
              </button>
            )}
            <button
              onClick={() => handleRestart(false)}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition shadow-lg"
            >
              Study All Again 🔄
            </button>
          </div>
        </div>
      ) : (
        /* Active Card View */
        <div className="flex flex-col flex-grow justify-between gap-4">
          
          {/* Progress Header */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300">
                Card {currentIndex + 1} of {total}
              </span>
              <div className="flex gap-3">
                <span className="text-emerald-400 font-medium">✓ {masteredCount} Mastered</span>
                <span className="text-amber-400 font-medium">⚡ {reviewCount} Review</span>
              </div>
            </div>
            {/* Visual Progress Bar */}
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* 3D Flippable Card Stage */}
          <div 
            onClick={() => setIsFlipped(prev => !prev)}
            className="perspective-1000 flex-grow min-h-[300px] lg:min-h-[360px] cursor-pointer group select-none"
          >
            <div 
              className={`w-full h-full relative transition-transform duration-500 transform-style-preserve-3d rounded-2xl ${
                isFlipped ? 'rotate-y-180' : ''
              }`}
            >
              {/* Card FRONT */}
              <div className="absolute inset-0 backface-hidden flex flex-col justify-between p-6 bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-700/80 rounded-2xl shadow-2xl group-hover:border-indigo-500/50 transition">
                <div className="flex justify-between items-center">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                    currentCard.type === 'term' 
                      ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' 
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                    {currentCard.category}
                  </span>
                  <span className="text-slate-500 text-xs flex items-center gap-1">
                    🔄 Click or Space to flip
                  </span>
                </div>

                <div className="my-auto text-center px-4">
                  <p className="text-base md:text-lg lg:text-xl font-bold text-slate-100 leading-snug">
                    {currentCard.front}
                  </p>
                </div>

                <div className="text-center text-xs text-slate-500">
                  <span>Front • Tap to reveal definition</span>
                </div>
              </div>

              {/* Card BACK */}
              <div className="absolute inset-0 backface-hidden rotate-y-180 flex flex-col justify-between p-6 bg-gradient-to-b from-indigo-950/40 via-slate-900 to-slate-950 border border-indigo-500/50 rounded-2xl shadow-2xl">
                <div className="flex justify-between items-center">
                  <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {currentCard.type === 'term' ? 'Definition' : 'Answer'}
                  </span>
                  <span className="text-slate-500 text-xs">
                    Flip back (Space)
                  </span>
                </div>

                <div className="my-auto text-center px-4 overflow-y-auto max-h-[200px] lg:max-h-[240px]">
                  <p className="text-sm md:text-base lg:text-lg text-slate-200 leading-relaxed font-medium">
                    {currentCard.back}
                  </p>
                </div>

                <div className="text-center text-xs text-slate-500">
                  <span>Back • Rate your recall below</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Recall Rating Actions */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleMarkNeedsReview}
              className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-amber-950/30 border border-slate-700 hover:border-amber-600/50 text-slate-300 hover:text-amber-300 py-2.5 px-4 rounded-xl text-sm font-semibold transition"
            >
              <span>❌</span> Needs Practice <kbd className="hidden sm:inline bg-slate-800 text-[10px] px-1.5 py-0.5 rounded text-slate-400">←</kbd>
            </button>
            <button
              onClick={handleMarkMastered}
              className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-emerald-600 text-white py-2.5 px-4 rounded-xl text-sm font-semibold transition shadow-lg"
            >
              <span>✅</span> Mastered <kbd className="hidden sm:inline bg-indigo-700 text-[10px] px-1.5 py-0.5 rounded text-indigo-200">→</kbd>
            </button>
          </div>

          {/* Keyboard shortcut hint banner */}
          <div className="text-center text-[11px] text-slate-500">
            <span>Shortcuts: </span>
            <kbd className="bg-slate-800 px-1 rounded text-slate-400">Space</kbd> Flip &nbsp;|&nbsp; 
            <kbd className="bg-slate-800 px-1 rounded text-slate-400">←</kbd> Review &nbsp;|&nbsp; 
            <kbd className="bg-slate-800 px-1 rounded text-slate-400">→</kbd> Mastered
          </div>

        </div>
      )}

    </div>
  );
}
