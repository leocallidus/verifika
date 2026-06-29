import React, { useState } from "react";
import { Plus, Trash2, Edit2, Check, X, MessageSquare, Pin, Search } from "lucide-react";
import { AiChat } from "../../types/ai";
import { motion, AnimatePresence } from "motion/react";

interface AiChatSidebarProps {
  chats: AiChat[];
  activeChatId: number | null;
  onSelectChat: (id: number) => void;
  onNewChat: () => void;
  onDeleteChat: (id: number) => void;
  onRenameChat: (id: number, title: string) => void;
  onTogglePinChat?: (id: number) => void;
  loading: boolean;
}

export default function AiChatSidebar({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onRenameChat,
  onTogglePinChat,
  loading,
}: AiChatSidebarProps) {
  const [editingChatId, setEditingChatId] = useState<number | null>(null);
  const [deletingChatId, setDeletingChatId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const startEditing = (chat: AiChat, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(chat.chat_id);
    setEditTitle(chat.title || "Новый чат");
  };

  const saveRename = (chatId: number) => {
    if (editTitle.trim()) {
      onRenameChat(chatId, editTitle.trim());
    }
    setEditingChatId(null);
  };

  const cancelRename = () => {
    setEditingChatId(null);
  };

  // Filter chats by search query
  const filteredChats = chats.filter((c) =>
    (c.title || "Новый чат").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group chats helper
  const groupChats = (chatsList: AiChat[]) => {
    const pinned: AiChat[] = [];
    const today: AiChat[] = [];
    const yesterday: AiChat[] = [];
    const older: AiChat[] = [];

    const now = new Date();
    const todayStr = now.toDateString();
    
    const yesterdayDate = new Date();
    yesterdayDate.setDate(now.getDate() - 1);
    const yesterdayStr = yesterdayDate.toDateString();

    chatsList.forEach((chat) => {
      if (chat.is_pinned) {
        pinned.push(chat);
      } else {
        const chatDate = new Date(chat.updated_at);
        const chatDateStr = chatDate.toDateString();
        if (chatDateStr === todayStr) {
          today.push(chat);
        } else if (chatDateStr === yesterdayStr) {
          yesterday.push(chat);
        } else {
          older.push(chat);
        }
      }
    });

    return { pinned, today, yesterday, older };
  };

  const { pinned, today, yesterday, older } = groupChats(filteredChats);

  const renderChatListSection = (title: string, list: AiChat[]) => {
    if (list.length === 0) return null;
    return (
      <div className="space-y-1">
        <h4 className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase px-3 py-2 tracking-wider">
          {title}
        </h4>
        {list.map((chat) => {
          const isActive = chat.chat_id === activeChatId;
          const displayTitle = chat.title || "Новый чат";
          const formattedDate = new Date(chat.updated_at).toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          });

          return (
            <motion.div
              key={chat.chat_id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              onClick={() => onSelectChat(chat.chat_id)}
              className={`group relative flex flex-col items-start p-3 rounded-xl cursor-pointer transition duration-150 ${
                isActive
                  ? "bg-indigo-50/80 dark:bg-indigo-950/30 text-indigo-900 dark:text-indigo-200 border-l-3 border-indigo-600"
                  : "hover:bg-neutral-100/70 dark:hover:bg-neutral-800/70 text-neutral-700 dark:text-neutral-300 border-l-3 border-transparent"
              }`}
            >
              {editingChatId === chat.chat_id ? (
                <div
                  className="flex items-center space-x-1.5 w-full"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="flex-1 bg-white dark:bg-neutral-800 border border-indigo-300 dark:border-indigo-800 px-2 py-0.5 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename(chat.chat_id);
                      if (e.key === "Escape") cancelRename();
                    }}
                  />
                  <button
                    onClick={() => saveRename(chat.chat_id)}
                    className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20 rounded cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={cancelRename}
                    className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center w-full pr-16">
                    <span className="font-medium text-sm truncate block">
                      {displayTitle}
                    </span>
                    {chat.is_pinned && !isActive && (
                      <Pin className="w-3 h-3 text-indigo-500 rotate-[45deg] flex-shrink-0 ml-1.5" />
                    )}
                  </div>
                  <div className="flex justify-between items-center w-full mt-1">
                    <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                      {formattedDate}
                    </span>
                    {chat.messages_count > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-200/60 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 flex items-center space-x-1">
                        <MessageSquare className="w-2.5 h-2.5" />
                        <span>{chat.messages_count}</span>
                      </span>
                    )}
                  </div>

                  {/* Deletion Confirmation Overlays */}
                  {deletingChatId === chat.chat_id ? (
                    <div
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1 bg-white dark:bg-neutral-800 p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 shadow-sm z-15"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          onDeleteChat(chat.chat_id);
                          setDeletingChatId(null);
                        }}
                        className="text-[10px] px-2 py-1 bg-red-650 hover:bg-red-700 text-white rounded font-medium cursor-pointer"
                      >
                        Удалить
                      </button>
                      <button
                        onClick={() => setDeletingChatId(null)}
                        className="text-[10px] px-2 py-1 bg-neutral-100 dark:bg-neutral-750 hover:bg-neutral-200 text-neutral-700 dark:text-neutral-200 rounded font-medium cursor-pointer"
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    /* Action buttons */
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-neutral-50 dark:bg-neutral-900 pl-2 rounded-lg py-0.5">
                      {onTogglePinChat && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onTogglePinChat(chat.chat_id);
                          }}
                          className={`p-1.5 rounded-lg text-neutral-400 hover:text-indigo-650 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 cursor-pointer ${
                            chat.is_pinned ? "text-indigo-500 rotate-[45deg]" : ""
                          }`}
                          title={chat.is_pinned ? "Открепить" : "Закрепить"}
                        >
                          <Pin className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => startEditing(chat, e)}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 cursor-pointer"
                        title="Переименовать"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingChatId(chat.chat_id);
                        }}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                        title="Удалить чат"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="w-80 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 flex flex-col h-full">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-neutral-200/60 dark:border-neutral-800/60 space-y-3">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl shadow-sm font-medium transition duration-200 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Новый чат</span>
        </button>

        {/* Local Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-450 dark:text-neutral-550" />
          <input
            type="text"
            placeholder="Поиск диалогов..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-850 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-neutral-800 dark:text-neutral-200 placeholder-neutral-450"
          />
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="w-full h-12 bg-neutral-200/50 dark:bg-neutral-800/50 animate-pulse rounded-xl"
            />
          ))
        ) : filteredChats.length === 0 ? (
          <div className="text-center text-neutral-400 dark:text-neutral-500 py-10 px-4 text-sm">
            {searchQuery ? "Совпадений не найдено." : "Нет активных диалогов. Создайте новый!"}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            <div className="space-y-4">
              {renderChatListSection("Закрепленные", pinned)}
              {renderChatListSection("Сегодня", today)}
              {renderChatListSection("Вчера", yesterday)}
              {renderChatListSection("Раньше", older)}
            </div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
