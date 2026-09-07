import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { askAgronomist } from '@/lib/agronomistChat';
import { useAuth } from '@/hooks/useAuth';
import { t, isRtl } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Bot, X, Send, Loader2, Sprout, Mic, Square, Clock, Plus, Trash2, Globe } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  question: string;
  answer: string;
  disclaimer?: string;
  error?: boolean;
}

interface ChatThread {
  id: string;
  title: string;
  createdAt: string;
  messages: ChatMessage[];
}

const STORAGE_KEY = 'sabz.floatingChat.threads';

function loadThreads(): ChatThread[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveThreads(threads: ChatThread[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  } catch {
    // storage unavailable
  }
}

/**
 * Floating AI agronomist chat available on every authenticated page.
 * Multi-thread: supports history, new chats, and persistence via localStorage.
 * Voice input: uses the Web Speech API (SpeechRecognition) for live transcription.
 */
export function FloatingChatWidget() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;

  // ─── Thread state ─────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>(() => loadThreads());
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // ─── Speech recognition state ─────────────────────────────────
  const [recording, setRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [accumulatedFinal, setAccumulatedFinal] = useState('');
  const [voiceSupported] = useState(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    return !!SR;
  });
  const [voiceLang, setVoiceLang] = useState<'en-US' | 'ur-PK'>('en-US');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const chatEnd = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const hideOnAgronomistPage = pathname.endsWith('/agronomist');

  // Current thread's messages
  const activeThread = threads.find((t) => t.id === activeThreadId);
  const messages = activeThread?.messages ?? [];

  // ─── Initialise SpeechRecognition ─────────────────────────────
  useEffect(() => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = voiceLang;

    recognition.onresult = (event: any) => {
      let finalText = '';
      let currentInterim = '';
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += transcript;
        else currentInterim += transcript;
      }
      setAccumulatedFinal(finalText);
      setLiveTranscript(currentInterim);
      setVoiceError(null);
    };

    recognition.onend = () => {
      setRecording(false);
      // Commit accumulated final text to the input for review before sending
      setAccumulatedFinal((prev) => {
        if (prev) setInput((inp) => (inp ? inp + ' ' + prev : prev));
        return '';
      });
      setLiveTranscript('');
    };
    recognition.onerror = (event: any) => {
      setRecording(false);
      setLiveTranscript('');
      setAccumulatedFinal('');
      if (event.error === 'not-allowed') {
        setVoiceError('Microphone access denied. Please allow mic permission.');
      } else if (event.error === 'no-speech') {
        setVoiceError('No speech detected. Try again.');
      } else if (event.error === 'network') {
        setVoiceError('Network error. Check your connection.');
      } else {
        setVoiceError(`Voice error: ${event.error}`);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      try { recognition.abort(); } catch { /* ignore */ }
    };
  }, [voiceLang]);

  // ─── Load active thread messages on switch ────────────────────
  useEffect(() => {
    if (activeThreadId) {
      setShowHistory(false);
    }
  }, [activeThreadId]);

  useEffect(() => {
    if (open) chatEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Persist threads to localStorage ──────────────────────────
  useEffect(() => {
    saveThreads(threads.map((t) => ({ ...t, messages: t.messages.slice(-50) })));
  }, [threads]);

  // ─── Clear on logout ──────────────────────────────────────────
  const prevUserId = useRef<string | undefined>(undefined);
  useEffect(() => {
    const wasLoggedIn = prevUserId.current != null;
    prevUserId.current = userId;
    if (!wasLoggedIn || userId != null) return;
    setThreads([]);
    setActiveThreadId(null);
    setInput('');
    setLiveTranscript('');
    setAccumulatedFinal('');
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, [userId]);

  if (!user || hideOnAgronomistPage) return null;

  // ─── Send message ─────────────────────────────────────────────
  const sendMessage = async (msg: string) => {
    if (!msg || sending) return;
    setSending(true);

    const threadId = activeThreadId ?? crypto.randomUUID();
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(), role: 'user', question: msg, answer: '',
    };

    let workingThread: ChatThread | undefined;
    setThreads((prev) => {
      const existing = prev.find((t) => t.id === threadId);
      if (existing) {
        workingThread = { ...existing, messages: [...existing.messages, userMsg] };
        return prev.map((t) => (t.id === threadId ? workingThread! : t));
      }
      workingThread = {
        id: threadId,
        title: msg.slice(0, 40) + (msg.length > 40 ? '…' : ''),
        createdAt: new Date().toISOString(),
        messages: [userMsg],
      };
      return [workingThread, ...prev];
    });

    if (!activeThreadId) setActiveThreadId(threadId);

    const history = (workingThread?.messages ?? [])
      .filter((m) => !m.error && m.answer)
      .map((m) => ({ question: m.question, answer: m.answer }));

    try {
      const result = await askAgronomist('', msg, history);
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        question: result.question,
        answer: result.answer,
        disclaimer: result.disclaimer ?? undefined,
      };
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId ? { ...t, messages: [...t.messages, assistantMsg] } : t,
        ),
      );
    } catch {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant', question: msg, answer: t('agronomist.error'), error: true,
      };
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId ? { ...t, messages: [...t.messages, errorMsg] } : t,
        ),
      );
    } finally {
      setSending(false);
    }
  };

  const handleSend = () => {
    const msg = input.trim();
    if (!msg) return;
    setInput('');
    sendMessage(msg);
  };

  // ─── Voice controls ───────────────────────────────────────────
  const startRecording = () => {
    if (recording || !recognitionRef.current) return;
    setVoiceError(null);
    recognitionRef.current.lang = voiceLang;
    setLiveTranscript('');
    setAccumulatedFinal('');
    try {
      recognitionRef.current.start();
      setRecording(true);
    } catch {
      // already started or error
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current && recording) {
      recognitionRef.current.stop();
    }
  };

  // ─── Thread management ────────────────────────────────────────
  const startNewChat = () => {
    setActiveThreadId(null);
    setInput('');
    setLiveTranscript('');
    setAccumulatedFinal('');
    setShowHistory(false);
    // Focus the input so the user can start typing immediately
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const switchToThread = (id: string) => {
    setActiveThreadId(id);
    setShowHistory(false);
    // Focus the input so the user can continue the conversation
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const deleteThread = (id: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== id));
    if (activeThreadId === id) setActiveThreadId(null);
  };

  const formatThreadDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000 && now.getDate() === d.getDate()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 604800000) {
      return d.toLocaleDateString([], { weekday: 'short' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // ─── Display messages (only from active thread; blank when no active session) ────
  const displayMessages = activeThread ? activeThread.messages : [];

  // ═══════════════════════════════════════════════════════════════
  // JSX
  // ═══════════════════════════════════════════════════════════════
  return (
    <>
      {/* Chat panel */}
      {open && (
      <div className="fixed bottom-24 right-4 sm:right-5 z-50 w-[calc(100vw-2rem)] sm:w-96 h-[28rem] max-h-[70vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white shadow-2xl overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="shrink-0 bg-gradient-to-r from-indigo-500 to-purple-600 px-4 pt-3.5 pb-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white leading-tight">{t('chat.title')}</p>
            <p className="text-[10px] text-indigo-100 truncate">{t('chat.subtitle')}</p>
          </div>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className={cn(
              'p-1.5 rounded-lg transition-colors shrink-0',
              showHistory ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/15 hover:text-white',
            )}
            title="Recent Chats"
          >
            <Clock className="h-4 w-4" />
          </button>
          <button
            onClick={startNewChat}
            className="p-1.5 rounded-lg text-white/70 hover:bg-white/15 hover:text-white transition-colors shrink-0"
            title="New Chat"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-white/70 hover:bg-white/15 hover:text-white transition-colors shrink-0"
            aria-label={t('chat.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* History panel overlay */}
        {showHistory && (
          <div className="absolute inset-0 top-[52px] z-10 bg-white/95 backdrop-blur-sm flex flex-col animate-fade-in">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                Recent Chats
              </h3>
              <button
                onClick={() => setShowHistory(false)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {threads.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <Clock className="h-10 w-10 text-gray-200 mb-3" />
                  <p className="text-xs text-gray-400">No chat history yet</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {threads.map((thread) => (
                    <div
                      key={thread.id}
                      className={cn(
                        'group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-colors',
                        thread.id === activeThreadId
                          ? 'bg-indigo-50 border border-indigo-200'
                          : 'hover:bg-gray-50 border border-transparent',
                      )}
                      onClick={() => switchToThread(thread.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {thread.title}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {formatThreadDate(thread.createdAt)} · {thread.messages.length} messages
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteThread(thread.id); }}
                        className="p-1 rounded-md text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 transition-all"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Messages / states */}
        <div className="flex-1 overflow-y-auto bg-gray-50 p-3 space-y-3">
          {!activeThreadId && displayMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Bot className="h-12 w-12 text-gray-300 mb-3" />
              <p className="text-xs text-gray-500">{t('agronomist.noMessages')}</p>
              <div className="flex flex-col gap-2 mt-4 w-full max-w-[16rem]">
                {[t('agronomist.qFertilizer'), t('agronomist.qPest'), t('agronomist.qWater')].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => sendMessage(prompt)}
                    disabled={sending}
                    className="px-3 py-1.5 rounded-full bg-white border border-gray-200 text-xs text-gray-600 hover:border-primary-300 hover:text-primary-700 hover:bg-primary-50 transition-colors disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {displayMessages.map((msg) => (
                <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'user' ? (
                    <div className="bg-primary-600 text-white rounded-2xl rounded-br-md px-3.5 py-2.5 max-w-[85%]">
                      <p className="text-sm whitespace-pre-wrap">{msg.question}</p>
                    </div>
                  ) : (
                    <div className="max-w-[85%] space-y-1">
                      <div className={cn(
                        'rounded-2xl rounded-bl-md px-3.5 py-2.5 border',
                        msg.error ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100',
                      )}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Bot className="h-3 w-3 text-indigo-500" />
                          <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider">
                            {t('agronomist.aiAnswer')}
                          </span>
                        </div>
                        <p className={cn('text-sm whitespace-pre-wrap', msg.error ? 'text-red-600' : 'text-gray-700')}>
                          {msg.answer}
                        </p>
                      </div>
                      {msg.disclaimer && (
                        <p className="text-[10px] text-gray-400 px-2">{msg.disclaimer}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-white rounded-2xl rounded-bl-md px-3.5 py-2.5 border border-gray-100">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                      <span className="text-xs text-gray-500">{t('agronomist.sending')}</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEnd} />
            </>
          )}
        </div>

        {/* Input area */}
        <>
          {(recording || liveTranscript || accumulatedFinal) && (
            <div className="shrink-0 px-3 py-1.5 bg-indigo-50 border-t border-indigo-100 flex items-center gap-2">
              <Mic className={cn('h-3.5 w-3.5 shrink-0', recording ? 'text-red-500 animate-pulse' : 'text-indigo-400')} />
              <span className="text-[11px] text-indigo-600 italic truncate">
                {recording
                  ? (liveTranscript || accumulatedFinal || 'Listening… Speak now')
                  : (accumulatedFinal || liveTranscript)}
              </span>
            </div>
          )}
          {voiceError && (
            <div className="shrink-0 px-3 py-1.5 bg-red-50 border-t border-red-100 flex items-center gap-2">
              <Mic className="h-3 w-3 text-red-500 shrink-0" />
              <span className="text-[11px] text-red-600">{voiceError}</span>
            </div>
          )}
          {!voiceSupported && (
            <div className="shrink-0 px-3 py-1 bg-amber-50 border-t border-amber-100">
              <span className="text-[10px] text-amber-600">Voice input is not supported on this browser. Use Chrome or Edge.</span>
            </div>
          )}
          <div className="shrink-0 border-t border-gray-100 p-2.5 flex items-center gap-2 bg-white">
            <input
              ref={inputRef}
              type="text"
              value={recording ? (accumulatedFinal + (liveTranscript ? (accumulatedFinal ? ' ' : '') + liveTranscript : '')) || (recording ? '' : input) : input}
              onChange={(e) => { if (!recording) setInput(e.target.value); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={recording ? 'Listening…' : t('agronomist.askPlaceholder')}
              disabled={sending}
              className={cn(
                'flex-1 px-3 py-2 rounded-xl border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-50 transition-colors',
                recording ? 'border-red-300 bg-red-50/50' : 'border-gray-200',
              )}
            />
            {voiceSupported && (
              <button
                type="button"
                onClick={() => setVoiceLang((l) => (l === 'en-US' ? 'ur-PK' : 'en-US'))}
                className="h-9 w-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors shrink-0"
                title={`Language: ${voiceLang === 'en-US' ? 'English' : 'اردو'}`}
              >
                <Globe className="h-4 w-4" />
              </button>
            )}
            {voiceSupported && (
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                className={cn(
                  'h-9 w-9 rounded-xl flex items-center justify-center transition-all shrink-0',
                  recording
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700',
                )}
                aria-label={recording ? t('chat.recording') : t('chat.voice')}
                title={recording ? t('chat.recording') : t('chat.voice')}
              >
                {recording ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
              </button>
            )}
            <button
              onClick={handleSend}
              disabled={sending || recording || !input.trim()}
              className="h-9 w-9 rounded-xl bg-primary-600 flex items-center justify-center text-white hover:bg-primary-700 transition-colors disabled:opacity-50 shrink-0"
              aria-label={t('agronomist.send')}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </>
      </div>
      )}

      {/* Floating action button */}
      <button
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            // Fresh session every time the widget is opened
            setActiveThreadId(null);
            setInput('');
            setLiveTranscript('');
            setAccumulatedFinal('');
            setShowHistory(false);
            setOpen(true);
          }
        }}
        className={cn(
          'fixed bottom-5 right-5 z-50 h-14 w-14 rounded-full flex items-center justify-center text-white shadow-xl transition-all hover:scale-105',
          open
            ? 'bg-gray-700 hover:bg-gray-800'
            : 'bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700',
        )}
        aria-label={open ? t('chat.close') : t('chat.open')}
        title={open ? t('chat.close') : t('chat.open')}
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
        {!open && (
          <span className={`absolute -top-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-white ${isRtl() ? '-left-0.5' : '-right-0.5'}`} />
        )}
      </button>
    </>
  );
}
