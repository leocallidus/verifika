import React, { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AiChatSidebar from "../../components/ai/AiChatSidebar";
import AiChatWindow from "../../components/ai/AiChatWindow";
import { AiChat, AiMessage, AiStatus } from "../../types/ai";
import {
  getAiStatus,
  getChats,
  createChat,
  deleteChat,
  renameChat,
  getChatMessages,
  streamChatMessage,
  deleteMessageCascade,
  togglePinChat,
} from "../../api/ai";
import { Sparkles, AlertCircle } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { useToasts } from "../../components/ui/Toast";

export default function AiAssistant() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [chats, setChats] = useState<AiChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("");

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    localStorage.setItem("ai_selected_chat_model", model);
  };

  const abortControllerRef = useRef<AbortController | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const prefillRef = useRef<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const stat = await getAiStatus();
        setStatus(stat);
        if (stat.enabled) {
          if (stat.chat_models_allowed && stat.chat_models_allowed.length > 0) {
            const savedModel = localStorage.getItem("ai_selected_chat_model");
            const modelToSet = (savedModel && stat.chat_models_allowed.includes(savedModel))
              ? savedModel
              : (stat.chat_model || stat.chat_models_allowed[0]);
            setSelectedModel(modelToSet);
          } else if (stat.chat_model) {
            setSelectedModel(stat.chat_model);
          }

          setSidebarLoading(true);
          const activeChats = await getChats();
          setChats(activeChats);
          
          // Check route state for prefill
          const state = location.state as { prefill?: string; autoCreate?: boolean } | null;
          if (state?.prefill && state?.autoCreate) {
            // Clear history state to avoid re-triggering on reload
            navigate(location.pathname, { replace: true, state: {} });
            
            prefillRef.current = state.prefill;
            // Create chat
            const newChat = await createChat();
            setChats((prev) => [newChat, ...prev]);
            setActiveChatId(newChat.chat_id);
          } else if (activeChats.length > 0) {
            setActiveChatId(activeChats[0].chat_id);
          }
          setSidebarLoading(false);
        }
      } catch (err: any) {
        console.error(err);
        setErrorMsg(err.message || "Ошибка при подключении к ИИ-модулю");
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }
    const currentChatId = activeChatId;
    async function loadMessages() {
      try {
        const msgs = await getChatMessages(currentChatId);
        setMessages(msgs);
        
        if (prefillRef.current) {
          const text = prefillRef.current;
          prefillRef.current = null;
          handleSendMessage(text, currentChatId);
        }
      } catch (err: any) {
        console.error(err);
        useToasts.getState().push("error", "Не удалось загрузить историю сообщений");
      }
    }
    loadMessages();
  }, [activeChatId]);

  const handleSelectChat = (id: number) => {
    if (streaming) handleStopStreaming();
    setActiveChatId(id);
  };

  const handleNewChat = async () => {
    try {
      const newChat = await createChat();
      setChats((prev) => [newChat, ...prev]);
      setActiveChatId(newChat.chat_id);
    } catch (err: any) {
      console.error(err);
      useToasts.getState().push("error", err.message || "Ошибка создания чата");
    }
  };

  const handleDeleteChat = async (id: number) => {
    try {
      await deleteChat(id);
      setChats((prev) => prev.filter((c) => c.chat_id !== id));
      if (activeChatId === id) {
        setActiveChatId(null);
      }
    } catch (err: any) {
      console.error(err);
      useToasts.getState().push("error", err.message || "Ошибка удаления чата");
    }
  };

  const handleRenameChat = async (id: number, title: string) => {
    try {
      const updated = await renameChat(id, title);
      setChats((prev) => prev.map((c) => (c.chat_id === id ? updated : c)));
    } catch (err: any) {
      console.error(err);
      useToasts.getState().push("error", err.message || "Ошибка изменения названия чата");
    }
  };

  const handleTogglePinChat = async (id: number) => {
    try {
      const updated = await togglePinChat(id);
      setChats((prev) => prev.map((c) => (c.chat_id === id ? { ...c, is_pinned: updated.is_pinned } : c)));
      const activeChats = await getChats();
      setChats(activeChats);
    } catch (err: any) {
      console.error(err);
      useToasts.getState().push("error", err.message || "Ошибка изменения статуса закрепления");
    }
  };


  const handleSendMessage = async (content: string, chatIdOverride?: number) => {
    const targetChatId = chatIdOverride || activeChatId;
    if (!targetChatId || streaming) return;

    const tempUserMsg: AiMessage = {
      message_id: Date.now(),
      chat_id: targetChatId,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);
    setStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const tempAssistantMsg: AiMessage = {
      message_id: Date.now() + 1,
      chat_id: targetChatId,
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempAssistantMsg]);

    let assistantText = "";

    try {
      await streamChatMessage(
        targetChatId,
        content,
        (delta) => {
          assistantText += delta;
          setMessages((prev) => {
            const copy = [...prev];
            const idx = copy.findIndex((m) => m.message_id === tempAssistantMsg.message_id);
            if (idx !== -1) {
              copy[idx] = { ...copy[idx], content: assistantText };
            }
            return copy;
          });
        },
        (title) => {
          setChats((prev) =>
            prev.map((c) => (c.chat_id === targetChatId ? { ...c, title } : c))
          );
        },
        (meta) => {
          setMessages((prev) => {
            const copy = [...prev];
            const idx = copy.findIndex((m) => m.message_id === tempAssistantMsg.message_id);
            if (idx !== -1) {
              copy[idx] = {
                ...copy[idx],
                content: assistantText,
                model_used: meta.model,
                tokens_used: meta.tokens_used,
              };
            }
            return copy;
          });
          getChats().then(setChats).catch(console.error);
        },
        controller.signal,
        false,
        selectedModel
      );
    } catch (err: any) {
      if (err.name === "AbortError" || err.message?.includes("aborted")) {
        console.log("Streaming aborted by user");
      } else {
        console.error("Streaming error", err);
        useToasts.getState().push("error", err.message || "Ошибка генерации ответа");
        setMessages((prev) => {
          const copy = [...prev];
          const idx = copy.findIndex((m) => m.message_id === tempAssistantMsg.message_id);
          if (idx !== -1) {
            copy[idx] = {
              ...copy[idx],
              content: assistantText + `\n\n*[Ошибка: ${err.message || "Генерация прервана"}]*`,
            };
          }
          return copy;
        });
      }
    } finally {
      setStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setStreaming(false);
    }
  };

  const handleResendLast = () => {
    const userMsgs = messages.filter((m) => m.role === "user");
    if (userMsgs.length > 0) {
      const lastContent = userMsgs[userMsgs.length - 1].content;
      setMessages((prev) => {
        let idx = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].role === "user") {
            idx = i;
            break;
          }
        }
        if (idx !== -1) {
          return prev.slice(0, idx);
        }
        return prev;
      });
      handleSendMessage(lastContent);
    }
  };

  const handleEditMessage = async (messageId: number, newContent: string) => {
    if (!activeChatId || streaming) return;
    try {
      await deleteMessageCascade(activeChatId, messageId, "after");
      const idx = messages.findIndex((m) => m.message_id === messageId);
      if (idx !== -1) {
        setMessages((prev) => prev.slice(0, idx));
      }
      await handleSendMessage(newContent);
    } catch (err: any) {
      console.error(err);
      useToasts.getState().push("error", err.message || "Не удалось изменить сообщение");
    }
  };

  const handleRegenerateMessage = async (messageId: number) => {
    if (!activeChatId || streaming) return;

    const idx = messages.findIndex((m) => m.message_id === messageId);
    if (idx === -1) return;

    if (idx < messages.length - 1) {
      const nextMsg = messages[idx + 1];
      try {
        await deleteMessageCascade(activeChatId, nextMsg.message_id, "after");
      } catch (err: any) {
        console.error(err);
        useToasts.getState().push("error", err.message || "Не удалось удалить последующие сообщения");
        return;
      }
    }

    const messagesBefore = messages.slice(0, idx);
    setMessages(messagesBefore);
    setStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const tempAssistantMsg: AiMessage = {
      message_id: Date.now() + 1,
      chat_id: activeChatId,
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
    };

    setMessages([...messagesBefore, tempAssistantMsg]);

    let assistantText = "";

    try {
      await streamChatMessage(
        activeChatId,
        "",
        (delta) => {
          assistantText += delta;
          setMessages((prev) => {
            const copy = [...prev];
            const i = copy.findIndex((m) => m.message_id === tempAssistantMsg.message_id);
            if (i !== -1) {
              copy[i] = { ...copy[i], content: assistantText };
            }
            return copy;
          });
        },
        (title) => {
          setChats((prev) =>
            prev.map((c) => (c.chat_id === activeChatId ? { ...c, title } : c))
          );
        },
        (meta) => {
          setMessages((prev) => {
            const copy = [...prev];
            const i = copy.findIndex((m) => m.message_id === tempAssistantMsg.message_id);
            if (i !== -1) {
              copy[i] = {
                ...copy[i],
                content: assistantText,
                model_used: meta.model,
                tokens_used: meta.tokens_used,
              };
            }
            return copy;
          });
          getChats().then(setChats).catch(console.error);
        },
        controller.signal,
        true,
        selectedModel
      );
    } catch (err: any) {
      if (err.name === "AbortError" || err.message?.includes("aborted")) {
        console.log("Streaming aborted by user");
      } else {
        console.error("Streaming error during regeneration", err);
        useToasts.getState().push("error", err.message || "Ошибка при регенерации");
        setMessages((prev) => {
          const copy = [...prev];
          const i = copy.findIndex((m) => m.message_id === tempAssistantMsg.message_id);
          if (i !== -1) {
            copy[i] = {
              ...copy[i],
              content: assistantText + `\n\n*[Ошибка: ${err.message || "Генерация прервана"}]*`,
            };
          }
          return copy;
        });
      }
    } finally {
      setStreaming(false);
      abortControllerRef.current = null;
    }
  };

  if (errorMsg) {
    return (
      <AppShell>
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-neutral-950 h-full">
          <AlertCircle className="w-12 h-12 text-red-500 mb-3" />
          <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
            Ошибка модуля ИИ
          </h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-md">{errorMsg}</p>
        </div>
      </AppShell>
    );
  }

  if (status && !status.enabled) {
    return (
      <AppShell>
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-neutral-950 h-full">
          <Sparkles className="w-12 h-12 text-neutral-400 dark:text-neutral-600 mb-3 animate-pulse" />
          <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
            ИИ-Ассистент отключён
          </h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-450 max-w-md">
            ИИ-Ассистент в данный момент отключён в конфигурации системы или недоступен для вашей роли.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex-1 flex overflow-hidden h-full">
        <AiChatSidebar
          chats={chats}
          activeChatId={activeChatId}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
          onRenameChat={handleRenameChat}
          onTogglePinChat={handleTogglePinChat}
          loading={sidebarLoading}
        />
        <AiChatWindow
          chatId={activeChatId}
          messages={messages}
          onSendMessage={handleSendMessage}
          streaming={streaming}
          onStopStreaming={handleStopStreaming}
          onResendLast={handleResendLast}
          onEditMessage={handleEditMessage}
          onRegenerateMessage={handleRegenerateMessage}
          allowedModels={status?.chat_models_allowed || []}
          selectedModel={selectedModel}
          onModelChange={handleModelChange}
        />
      </div>
    </AppShell>
  );
}
