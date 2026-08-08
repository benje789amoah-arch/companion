import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Sparkles, User, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTED_PROMPTS = [
  "What suburbs do you service?",
  "How can I track my laundry order?",
  "What scent options do you offer?",
  "Tell me about sneaker restoration.",
  "How do I earn Care Loyalty Points?"
];

export default function ChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Welcome to FreshFold Laundry Co. I am Foldie, your virtual garment concierge. How may I assist you with your premium textile care today?"
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of message list on updates
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: textToSend };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          history: [...messages, userMessage]
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Server returned an error responding to your request.');
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err: any) {
      console.error('Chatbot API Error:', err);
      setErrorMessage(err.message || 'Apologies, but our communication link is temporarily interrupted.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend(inputValue);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end" id="ai-chatbot-widget">
      {/* Animated Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="w-[340px] sm:w-[380px] h-[520px] bg-brand-charcoal border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden mb-4 glass-card text-left"
          >
            {/* Header */}
            <div className="bg-[#121212] px-4 py-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-full bg-brand-sage/20 border border-brand-sage flex items-center justify-center text-brand-gold">
                  <Sparkles className="w-4 h-4 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-serif text-sm font-semibold tracking-wide text-white uppercase">
                    Virtual Concierge
                  </h3>
                  <div className="flex items-center space-x-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-gold animate-ping" />
                    <span className="text-[9px] font-mono uppercase tracking-widest text-[#c5a880] font-bold">
                      Foldie Online
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/5 text-stone-400 hover:text-white transition-colors cursor-pointer"
                id="close-chatbot"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Message Pane */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 font-sans text-xs scrollbar-thin">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex gap-2.5 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    {/* Avatar icon */}
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border text-[10px] ${
                      msg.role === 'user'
                        ? 'bg-brand-sage/20 border-brand-sage text-brand-text-light'
                        : 'bg-brand-gold/10 border-brand-gold/20 text-[#c5a880]'
                    }`}>
                      {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : 'F'}
                    </div>

                    <div className={`p-3 rounded-xl leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-brand-sage text-white text-left font-light rounded-tr-none'
                        : 'bg-brand-card border border-white/5 text-stone-200 text-left font-light rounded-tl-none'
                    }`}>
                      <div className="whitespace-pre-line">{msg.content}</div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Loader */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex gap-2.5 max-w-[85%] flex-row">
                    <div className="w-6 h-6 rounded-full bg-brand-gold/10 border border-brand-gold/20 flex items-center justify-center text-[#c5a880] shrink-0 text-[10px]">
                      F
                    </div>
                    <div className="p-3 bg-brand-card border border-white/5 rounded-xl rounded-tl-none flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 bg-brand-gold rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 bg-brand-gold rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 bg-brand-gold rounded-full animate-bounce" />
                    </div>
                  </div>
                </div>
              )}

              {/* Error Segment */}
              {errorMessage && (
                <div className="bg-brand-gold/5 border border-brand-gold/20 rounded-xl p-3.5 space-y-2 text-stone-300">
                  <div className="flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 text-brand-gold shrink-0 mt-0.5" />
                    <p className="text-[11px] font-light leading-relaxed">{errorMessage}</p>
                  </div>
                  {errorMessage.includes('Settings') && (
                    <div className="bg-black/40 p-2 rounded border border-white/5 font-mono text-[9px] text-stone-400">
                      💡 Tip: Click on <strong>Settings</strong> at the bottom of the screen, open <strong>Secrets</strong>, and define a <code>GEMINI_API_KEY</code> to enable complete interactive AI replies.
                    </div>
                  )}
                  <button
                    onClick={() => handleSend(messages[messages.length - 1].content)}
                    className="flex items-center space-x-1.5 px-2.5 py-1 bg-brand-gold/15 hover:bg-brand-gold/25 border border-brand-gold/30 rounded text-[10px] text-brand-gold-light uppercase tracking-wider font-mono transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Retry Last Message</span>
                  </button>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Prompts Container */}
            <div className="px-4 py-2 border-t border-white/5 bg-black/20 flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto">
              {SUGGESTED_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(prompt)}
                  disabled={isLoading}
                  className="px-2 py-1 text-[10px] bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 rounded-lg hover:text-white transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* Input Form */}
            <form onSubmit={handleFormSubmit} className="p-3 bg-[#121212] border-t border-white/5 flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about care, pricing, scents..."
                disabled={isLoading}
                className="flex-1 bg-[#161616] border border-white/10 text-white placeholder-stone-500 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand-sage transition-colors disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isLoading}
                className="p-2.5 bg-brand-sage hover:bg-brand-sage-light text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-4 bg-brand-gold hover:bg-brand-gold-light text-black rounded-2xl shadow-2xl transition-all duration-300 transform hover:scale-105 cursor-pointer flex items-center justify-center border border-white/10"
        aria-label="Toggle virtual laundry assistant"
        id="chatbot-toggle-button"
      >
        {isOpen ? <X className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
      </button>
    </div>
  );
}
