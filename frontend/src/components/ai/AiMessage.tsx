import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, Sparkles, User, Edit2, RotateCcw } from "lucide-react";
import { AiMessage as MessageType } from "../../types/ai";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import "highlight.js/styles/github-dark.css";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("plaintext", plaintext);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("tsx", typescript);
hljs.registerLanguage("xml", xml);

interface AiMessageProps {
  message: MessageType;
  onEdit?: (messageId: number, newContent: string) => void;
  onRegenerate?: (messageId: number) => void;
  isRegenerateLoading?: boolean;
}

const CodeBlock = ({ highlighted, codeStr }: { highlighted: string; codeStr: string }) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(codeStr);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (err) {
      console.error("Failed to copy code", err);
    }
  };
  return (
    <div className="relative group/code my-2.5">
      <button
        onClick={handleCopyCode}
        className="absolute top-2 right-2 p-1.5 rounded bg-neutral-800 hover:bg-neutral-750 border border-neutral-700/50 text-neutral-400 hover:text-neutral-200 opacity-0 group-hover/code:opacity-100 transition-opacity duration-200 cursor-pointer z-10"
        title="Копировать код"
      >
        {copiedCode ? (
          <Check className="w-3 h-3 text-green-500" />
        ) : (
          <Copy className="w-3 h-3" />
        )}
      </button>
      <pre className="overflow-x-auto rounded bg-neutral-900 text-neutral-100 p-4 font-mono text-xs leading-relaxed border border-neutral-800">
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  );
};

export default function AiMessage({
  message,
  onEdit,
  onRegenerate,
  isRegenerateLoading = false,
}: AiMessageProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editVal, setEditVal] = useState(message.content);
  const isUser = message.role === "user";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text", err);
    }
  };

  const handleSaveEdit = () => {
    if (editVal.trim() && editVal !== message.content && onEdit) {
      onEdit(message.message_id, editVal.trim());
      setIsEditing(false);
    } else {
      setIsEditing(false);
    }
  };

  return (
    <div className="flex flex-col w-full">
      <div
        className={`flex w-full space-x-3 my-2 group ${
          isUser ? "justify-end" : "justify-start"
        }`}
      >
        {!isUser && (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md">
            <Sparkles className="w-4 h-4" />
          </div>
        )}

        <div
          className={`relative max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm transition-all duration-200 ${
            isUser
              ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-tr-none"
              : "text-neutral-800 dark:text-neutral-100 rounded-tl-none border border-indigo-100/50 dark:border-indigo-950/50"
          }`}
          style={
            isUser
              ? {}
              : {
                  background:
                    "linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.05))",
                  borderLeft: "3px solid rgba(99, 102, 241, 0.5)",
                }
          }
        >
          {/* Action button overlay */}
          <div className="absolute top-2 right-2 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            {isUser && onEdit && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="p-1.5 rounded-lg bg-white/80 dark:bg-neutral-800/80 hover:bg-white dark:hover:bg-neutral-700 shadow-sm border border-neutral-200/50 dark:border-neutral-700/50 text-neutral-500 dark:text-neutral-400 cursor-pointer"
                title="Редактировать сообщение"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}
            {!isUser && onRegenerate && (
              <button
                onClick={() => onRegenerate(message.message_id)}
                disabled={isRegenerateLoading}
                className="p-1.5 rounded-lg bg-white/80 dark:bg-neutral-800/80 hover:bg-white dark:hover:bg-neutral-700 shadow-sm border border-neutral-200/50 dark:border-neutral-700/50 text-neutral-500 dark:text-neutral-400 cursor-pointer disabled:opacity-55"
                title="Регенерировать ответ"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isRegenerateLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg bg-white/80 dark:bg-neutral-800/80 hover:bg-white dark:hover:bg-neutral-700 shadow-sm border border-neutral-200/50 dark:border-neutral-700/50 text-neutral-500 dark:text-neutral-400 cursor-pointer"
              title="Копировать сообщение"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {isEditing ? (
            <div className="flex flex-col space-y-2 w-full min-w-[200px]">
              <textarea
                value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
                rows={3}
                className="w-full text-xs text-neutral-800 bg-neutral-50 border border-neutral-300 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <div className="flex items-center justify-end space-x-1.5">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100 rounded border border-neutral-350 cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-2.5 py-1 text-[11px] font-medium bg-indigo-650 hover:bg-indigo-700 text-white rounded cursor-pointer"
                >
                  Сохранить
                </button>
              </div>
            </div>
          ) : isUser ? (
            <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed break-words">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ node, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const codeStr = String(children).replace(/\n$/, "");
                    const isInline = !className;
                    if (!isInline) {
                      let highlighted = codeStr;
                      try {
                        if (match) {
                          highlighted = hljs.highlight(codeStr, {
                            language: match[1],
                          }).value;
                        } else {
                          highlighted = hljs.highlightAuto(codeStr).value;
                        }
                      } catch (e) {
                        console.error("Syntax highlight failed", e);
                      }
                      return <CodeBlock highlighted={highlighted} codeStr={codeStr} />;
                    }
                    return (
                      <code
                        className="bg-neutral-200/70 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-xs font-mono font-semibold text-neutral-800 dark:text-neutral-200"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  table({ children }) {
                    return (
                      <div className="overflow-x-auto my-3 rounded-lg border border-neutral-200 dark:border-neutral-700">
                        <table className="min-w-full border-collapse text-xs">
                          {children}
                        </table>
                      </div>
                    );
                  },
                  th({ children }) {
                    return (
                      <th className="border-b border-neutral-200 dark:border-neutral-700 px-4 py-2 bg-neutral-100/50 dark:bg-neutral-800/50 font-semibold text-left">
                        {children}
                      </th>
                    );
                  },
                  td({ children }) {
                    return (
                      <td className="border-b border-neutral-150 dark:border-neutral-800 px-4 py-2">
                        {children}
                      </td>
                    );
                  },
                  p({ children }) {
                    return <p className="mb-2 last:mb-0">{children}</p>;
                  },
                  ul({ children }) {
                    return <ul className="list-disc pl-5 mb-2">{children}</ul>;
                  },
                  ol({ children }) {
                    return <ol className="list-decimal pl-5 mb-2">{children}</ol>;
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {isUser && (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-350 shadow-sm border border-neutral-300 dark:border-neutral-600">
            <User className="w-4 h-4" />
          </div>
        )}
      </div>

      {/* Meta metadata row under message */}
      {!isUser && (message.model_used || message.tokens_used) && (
        <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5 mb-2 ml-11 flex items-center space-x-2">
          {message.model_used && <span>Модель: {message.model_used}</span>}
          {message.tokens_used !== undefined && message.tokens_used !== null && (
            <span>• Токены: {message.tokens_used}</span>
          )}
        </div>
      )}
    </div>
  );
}
