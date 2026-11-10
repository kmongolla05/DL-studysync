import React, { useState, useRef, useEffect } from 'react';

// Lightweight markdown renderer for bold, lists, code, and paragraphs
function FormattedMessage({ text }) {
  if (!text) return null;

  // Split lines into structured blocks
  const lines = text.split('\n');
  const elements = [];
  let currentList = null;

  const parseInline = (lineText) => {
    // Basic inline code `code`
    const parts = [];
    let remaining = lineText;

    // Split by inline code first
    const codeRegex = /`([^`]+)`/g;
    let lastIdx = 0;
    let match;

    while ((match = codeRegex.exec(lineText)) !== null) {
      if (match.index > lastIdx) {
        parts.push(renderBoldItalic(lineText.slice(lastIdx, match.index)));
      }
      parts.push(
        <code key={match.index} className="bg-slate-800 text-indigo-300 px-1.5 py-0.5 rounded text-xs font-mono">
          {match[1]}
        </code>
      );
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < lineText.length) {
      parts.push(renderBoldItalic(lineText.slice(lastIdx)));
    }
    return parts;
  };

  const renderBoldItalic = (segment) => {
    // Bold **text**
    const boldRegex = /\*\*([^*]+)\*\*/g;
    const items = [];
    let last = 0;
    let bMatch;

    while ((bMatch = boldRegex.exec(segment)) !== null) {
      if (bMatch.index > last) {
        items.push(segment.slice(last, bMatch.index));
      }
      items.push(
        <strong key={bMatch.index} className="text-white font-semibold">
          {bMatch[1]}
        </strong>
      );
      last = bMatch.index + bMatch[0].length;
    }
    if (last < segment.length) {
      items.push(segment.slice(last));
    }
    return items;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      if (currentList) {
        elements.push(currentList);
        currentList = null;
      }
      return;
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      if (currentList) { elements.push(currentList); currentList = null; }
      elements.push(
        <h4 key={index} className="text-sm font-bold text-indigo-400 mt-2 mb-1">
          {parseInline(trimmed.replace(/^###\s+/, ''))}
        </h4>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      if (currentList) { elements.push(currentList); currentList = null; }
      elements.push(
        <h3 key={index} className="text-base font-bold text-indigo-300 mt-3 mb-1">
          {parseInline(trimmed.replace(/^##\s+/, ''))}
        </h3>
      );
      return;
    }

    // Bullet points
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const content = trimmed.replace(/^[-*]\s+/, '');
      if (!currentList || currentList.type !== 'ul') {
        if (currentList) elements.push(currentList);
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(
        <li key={index} className="ml-4 list-disc text-slate-300">
          {parseInline(content)}
        </li>
      );
      return;
    }

    // Numbered lists
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      if (!currentList || currentList.type !== 'ol') {
        if (currentList) elements.push(currentList);
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(
        <li key={index} className="ml-4 list-decimal text-slate-300">
          {parseInline(numMatch[2])}
        </li>
      );
      return;
    }

    // Regular paragraph
    if (currentList) {
      elements.push(currentList);
      currentList = null;
    }

    elements.push(
      <p key={index} className="text-slate-300 leading-relaxed my-1">
        {parseInline(trimmed)}
      </p>
    );
  });

  if (currentList) {
    elements.push(currentList);
  }

  return (
    <div className="space-y-1 text-sm">
      {elements.map((el, i) => {
        if (el?.type === 'ul') {
          return <ul key={i} className="space-y-1 my-1.5">{el.items}</ul>;
        }
        if (el?.type === 'ol') {
          return <ol key={i} className="space-y-1 my-1.5">{el.items}</ol>;
        }
        return el;
      })}
    </div>
  );
}

export default function ChatTutor({ lectureText = '', notesData = null, initialPrompt = '', onClearInitialPrompt }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "👋 Hello! I'm your **StudySync AI Tutor**, tuned specifically to this lecture.\n\nAsk me anything! I can explain confusing concepts, provide real-world analogies, or quiz you to test your knowledge.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Handle triggered initial prompt from outside (e.g. clicking a theme or term)
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      handleSend(initialPrompt);
      if (onClearInitialPrompt) onClearInitialPrompt();
    }
  }, [initialPrompt]);

  const quickPrompts = [
    { label: "💡 Explain like I'm 5", prompt: "Can you explain the central idea of this lecture using a simple, everyday analogy?" },
    { label: "🎯 Quiz me", prompt: "Ask me a challenging conceptual question based on this lecture to test my understanding. Don't reveal the answer until I try!" },
    { label: "⚠️ Common Exam Traps", prompt: "What are the most common misconceptions or exam pitfalls students fall into with this material?" },
    { label: "⚡ 3 Main Takeaways", prompt: "What are the 3 most crucial takeaways from this lecture that I absolutely need to remember?" },
  ];

  const handleSend = async (textToSend) => {
    const query = typeof textToSend === 'string' ? textToSend : input;
    if (!query || !query.trim() || loading) return;

    const userMessage = { role: 'user', content: query.trim() };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      // Build summary snapshot context
      const summaryContext = notesData ? `
Summary: ${notesData.summary || ''}
Key Themes: ${(notesData.keyPoints || []).map(k => `${k.theme}: ${k.points.join(', ')}`).join('\n')}
Glossary: ${(notesData.glossary || []).map(g => `${g.term} = ${g.definition}`).join('\n')}
      ` : '';

      const response = await fetch('/api/chat-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lectureText: lectureText || notesData?.rawTranscript || '',
          notesSummary: summaryContext,
          messages: updatedMessages.map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response from AI Tutor.');
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ **Error:** ${err.message || 'Something went wrong while consulting the tutor.'}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (content, index) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleClearChat = () => {
    setMessages([
      {
        role: 'assistant',
        content: "Chat cleared! How can I assist you with this lecture now?",
      },
    ]);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top Bar with Context Status & Clear Button */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-slate-400">
            Tutor Grounded in Lecture Material
          </span>
        </div>
        <button
          onClick={handleClearChat}
          className="text-slate-500 hover:text-slate-300 text-xs transition"
          title="Reset conversation"
        >
          🧹 Clear Chat
        </button>
      </div>

      {/* Quick Prompts Carousel */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-none flex-shrink-0">
        {quickPrompts.map((qp, i) => (
          <button
            key={i}
            onClick={() => handleSend(qp.prompt)}
            disabled={loading}
            className="whitespace-nowrap px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-full text-xs font-medium transition disabled:opacity-50 flex-shrink-0"
          >
            {qp.label}
          </button>
        ))}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-grow overflow-y-auto space-y-4 pr-1">
        {messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={index}
              className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <div className="w-7 h-7 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                  🧠
                </div>
              )}

              <div
                className={`group relative max-w-[85%] rounded-xl px-4 py-3 text-sm shadow-md ${
                  isUser
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-slate-950 border border-slate-800 rounded-bl-none'
                }`}
              >
                {isUser ? (
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                ) : (
                  <div>
                    <FormattedMessage text={msg.content} />
                    <button
                      onClick={() => handleCopy(msg.content, index)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2 text-slate-400 hover:text-white text-[11px] bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700"
                    >
                      {copiedIndex === index ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>

              {isUser && (
                <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                  🧑‍🎓
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="w-7 h-7 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-xs flex-shrink-0">
              🧠
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl rounded-bl-none px-4 py-3 text-xs text-indigo-300 flex items-center gap-2">
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-indigo-400"></div>
              <span>AI Tutor is formulating an answer...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input */}
      <div className="mt-3 pt-2 border-t border-slate-800 flex-shrink-0">
        <div className="relative flex items-center bg-slate-950 border border-slate-800 rounded-lg focus-within:border-indigo-500 transition">
          <textarea
            ref={textareaRef}
            rows="1"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your tutor anything about this lecture... (Press Enter)"
            className="w-full bg-transparent px-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none resize-none max-h-28"
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            className="mr-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-md text-xs font-semibold transition flex items-center gap-1 shadow"
          >
            <span>Send</span>
            <span>➤</span>
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mt-1.5 text-center">
          Pro-tip: Ask for analogies, memory mnemonics, or practice exam questions.
        </p>
      </div>
    </div>
  );
}
