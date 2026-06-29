import React, { useRef, useEffect, useState } from "react";
import { Sparkles, Send, Square, RotateCcw, Download, ChevronDown } from "lucide-react";
import { AiMessage as MessageType, AiUsage } from "../../types/ai";
import AiMessage from "./AiMessage";
import AiTypingIndicator from "./AiTypingIndicator";
import AiPromptPalette from "./AiPromptPalette";
import { useAuth } from "../../store/auth";
import { downloadBlob } from "../../api/downloads";
import { getAiUsage } from "../../api/ai";
import { useToasts } from "../ui/Toast";

interface AiChatWindowProps {
  chatId: number | null;
  messages: MessageType[];
  onSendMessage: (content: string) => void;
  streaming: boolean;
  onStopStreaming: () => void;
  onResendLast: () => void;
  onEditMessage: (messageId: number, content: string) => void;
  onRegenerateMessage: (messageId: number) => void;
  allowedModels: string[];
  selectedModel: string;
  onModelChange: (model: string) => void;
}

const getPresetsForRole = (role: string) => {
  if (role === "student") {
    return [
      "Объясни мне тему нормализации баз данных простыми словами с примерами",
      "Помоги мне разобраться с решением сложной задачи по программированию",
      "Подготовь меня к тесту по реляционным базам данных",
    ];
  }
  return [
    "Составь подробный план лекции или семинарского занятия по Web-разработке",
    "Придумай 5 сложных вопросов по языку SQL и реляционным базам данных",
    "Сформулируй критерии оценивания практической работы по базам данных",
  ];
};

export default function AiChatWindow({
  chatId,
  messages,
  onSendMessage,
  streaming,
  onStopStreaming,
  onResendLast,
  onEditMessage,
  onRegenerateMessage,
  allowedModels,
  selectedModel,
  onModelChange,
}: AiChatWindowProps) {
  const [input, setInput] = useState("");
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [showScrollDownButton, setShowScrollDownButton] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useAuth();

  // Load and save drafts in localStorage
  useEffect(() => {
    if (chatId) {
      const savedDraft = localStorage.getItem(`ai_draft_${chatId}`);
      setInput(savedDraft || "");
    } else {
      setInput("");
    }
  }, [chatId]);

  // Fetch daily limits usage for student role
  useEffect(() => {
    if (user?.role === "student") {
      getAiUsage().then(setUsage).catch(console.error);
    }
  }, [user, messages, streaming]);

  // Smart auto-scroll
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (isAtBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, streaming]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    setShowScrollDownButton(!isAtBottom);
  };

  const scrollToBottom = () => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || streaming || trimmed.length > 10000) return;
    onSendMessage(trimmed);
    setInput("");
    if (chatId) {
      localStorage.removeItem(`ai_draft_${chatId}`);
    }
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (chatId) {
      localStorage.setItem(`ai_draft_${chatId}`, val);
    }
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 180)}px`;
    }
  };

  const handleExport = async (format: "md" | "pdf") => {
    if (!chatId) return;
    try {
      await downloadBlob(`/api/v2/ai/chats/${chatId}/export?fmt=${format}`, `chat_export_${chatId}.${format}`);
    } catch (err: any) {
      console.error(err);
      useToasts.getState().push("error", err.message || "Ошибка при экспорте диалога");
    }
  };

  const hasMessages = messages.length > 0;
  const lastMessageIsUser = messages[messages.length - 1]?.role === "user";
  const PRESETS = getPresetsForRole(user?.role || "student");
  const isInputOverLimit = input.length > 10000;

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-neutral-950 relative">
      {/* Header */}
      <div className="h-16 border-b border-neutral-200 dark:border-neutral-800 px-6 flex items-center justify-between bg-white/70 dark:bg-neutral-950/70 backdrop-blur-md z-10">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 border border-indigo-100/30">
            <Sparkles className="w-4.5 h-4.5 animate-pulse text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="font-semibold text-sm text-neutral-800 dark:text-neutral-200">
                ИИ-Ассистент
              </h2>
              {/* Daily Limit Badge for Students */}
              {user?.role === "student" && usage && usage.limit_messages > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-900 border border-neutral-250 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 font-medium">
                  Сообщения сегодня: {usage.messages_today} / {usage.limit_messages}
                </span>
              )}
            </div>
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500 block mt-0.5">
              {streaming ? "Печатает ответ..." : "Готов помочь"}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-1.5">
          {allowedModels.length > 0 && (
            <select
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-neutral-250 dark:border-neutral-800 hover:border-indigo-450 dark:hover:border-indigo-850 bg-white dark:bg-neutral-900 text-xs text-neutral-650 dark:text-neutral-350 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer font-medium focus:outline-none"
              title="Выберите модель ассистента"
            >
              {allowedModels.map((m) => (
                <option key={m} value={m} className="bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200">
                  {m}
                </option>
              ))}
            </select>
          )}

          {chatId && hasMessages && (
            <>
              <button
                onClick={() => handleExport("md")}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-neutral-250 dark:border-neutral-800 hover:border-indigo-450 dark:hover:border-indigo-850 bg-white dark:bg-neutral-900 text-xs text-neutral-600 dark:text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer font-medium"
                title="Экспорт в Markdown"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Экспорт MD</span>
              </button>
              <button
                onClick={() => handleExport("pdf")}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-neutral-250 dark:border-neutral-800 hover:border-indigo-450 dark:hover:border-indigo-850 bg-white dark:bg-neutral-900 text-xs text-neutral-600 dark:text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer font-medium"
                title="Экспорт в PDF"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Экспорт PDF</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Message Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
      >
        {!chatId ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-500 dark:text-indigo-400 mb-4 shadow-sm border border-indigo-100/10">
              <Sparkles className="w-8 h-8 text-indigo-500" />
            </div>
            <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
              ИИ-Ассистент Верифика
            </h3>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-sm mb-6">
              Выберите существующий диалог в боковом меню или создайте новый, чтобы начать общение.
            </p>
          </div>
        ) : !hasMessages ? (
          <div className="h-full flex flex-col items-center justify-center p-8 max-w-2xl mx-auto">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-550 mb-4">
              <Sparkles className="w-6 h-6 animate-pulse text-indigo-500" />
            </div>
            <h3 className="text-base font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
              Чем могу помочь?
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 text-center mb-6">
              Задайте любой интересующий вас учебный вопрос или воспользуйтесь подсказками ниже.
            </p>

            <div className="grid grid-cols-1 gap-3 w-full max-w-md">
              {PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => onSendMessage(preset)}
                  className="text-left text-xs p-3.5 rounded-xl border border-neutral-200/80 dark:border-neutral-800 hover:border-indigo-450 dark:hover:border-indigo-850 bg-neutral-50/50 dark:bg-neutral-900/30 hover:bg-indigo-50/20 dark:hover:bg-indigo-950/10 text-neutral-700 dark:text-neutral-350 transition duration-150 cursor-pointer shadow-sm"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <AiMessage
                key={msg.message_id}
                message={msg}
                onEdit={onEditMessage}
                onRegenerate={onRegenerateMessage}
                isRegenerateLoading={streaming}
              />
            ))}

            {streaming && lastMessageIsUser && (
              <div className="flex w-full space-x-3 justify-start my-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex flex-col space-y-1">
                  <AiTypingIndicator />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating Scroll Down Button */}
      {showScrollDownButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-28 left-1/2 -translate-x-1/2 flex items-center space-x-1 px-3.5 py-2 bg-indigo-650 dark:bg-indigo-750 text-white rounded-full shadow-lg border border-indigo-500/20 hover:bg-indigo-700 dark:hover:bg-indigo-700 transition duration-150 text-xs font-medium cursor-pointer z-20 animate-bounce"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          <span>Новые сообщения</span>
        </button>
      )}

      {/* Input Area */}
      {chatId && (
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-950/30 relative">
          <div className="max-w-3xl mx-auto flex flex-col space-y-2">
            <div className="flex items-center justify-start space-x-2">
              {/* Templates Trigger */}
              {!streaming && (
                <button
                  onClick={() => setIsPaletteOpen(true)}
                  className="flex items-center space-x-1.5 py-1 px-3 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/20 dark:hover:bg-indigo-955/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/50 rounded-lg text-xs font-medium transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  <span>⚡ Шаблоны</span>
                </button>
              )}
              {streaming && (
                <button
                  onClick={onStopStreaming}
                  className="flex items-center space-x-1.5 py-1 px-3 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-955/40 text-red-650 dark:text-red-400 border border-red-200 dark:border-red-900/50 rounded-lg text-xs font-medium transition cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Остановить</span>
                </button>
              )}
              {!streaming && hasMessages && !lastMessageIsUser && (
                <button
                  onClick={onResendLast}
                  className="flex items-center space-x-1.5 py-1 px-3 bg-indigo-50 hover:bg-indigo-105/60 dark:bg-indigo-950/20 dark:hover:bg-indigo-955/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/50 rounded-lg text-xs font-medium transition cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Повторить</span>
                </button>
              )}
            </div>

            <div className="relative flex flex-col bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-sm focus-within:ring-1 focus-within:ring-indigo-500 focus-within:border-indigo-500">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Спросите у ИИ-Ассистента..."
                disabled={streaming}
                className="flex-1 w-full bg-transparent resize-none pl-4 pr-12 pt-3.5 pb-2.5 max-h-[180px] text-sm text-neutral-800 dark:text-neutral-100 focus:outline-none placeholder-neutral-450"
              />
              {/* Character Counter & Warning */}
              <div className="flex justify-between items-center text-[10px] px-4 pb-2 text-neutral-450 dark:text-neutral-500 bg-transparent rounded-b-xl">
                <div>
                  {isInputOverLimit && (
                    <span className="text-red-500 font-medium">Превышен лимит в 10 000 символов!</span>
                  )}
                </div>
                <span className={isInputOverLimit ? "text-red-550 font-semibold" : ""}>
                  {input.length} / 10 000
                </span>
              </div>
              <button
                onClick={handleSend}
                disabled={!input.trim() || streaming || isInputOverLimit}
                className={`absolute right-2.5 bottom-8 p-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 disabled:from-neutral-200 disabled:to-neutral-200 disabled:text-neutral-450 dark:disabled:from-neutral-800 dark:disabled:to-neutral-800 dark:disabled:text-neutral-600 transition cursor-pointer shadow-sm`}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Templates Palette Modal */}
      <AiPromptPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        userRole={user?.role || "student"}
        onSelect={(prompt) => {
          setInput(prompt);
          if (chatId) {
            localStorage.setItem(`ai_draft_${chatId}`, prompt);
          }
          setTimeout(() => {
            if (inputRef.current) {
              inputRef.current.style.height = "auto";
              inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 180)}px`;
            }
          }, 50);
        }}
      />
    </div>
  );
}
