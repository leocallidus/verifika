import React from "react";

export default function AiTypingIndicator() {
  return (
    <div className="flex items-center space-x-1.5 px-4 py-3 bg-neutral-100 dark:bg-neutral-800 rounded-2xl max-w-[80px] justify-center">
      <style>{`
        @keyframes ai-dot-bounce {
          0%, 80%, 100% { transform: scale(0.3); opacity: 0.4; }
          40%           { transform: scale(1); opacity: 1; }
        }
        .ai-dot {
          animation: ai-dot-bounce 1.4s infinite ease-in-out both;
        }
        .ai-dot:nth-child(1) { animation-delay: -0.32s; }
        .ai-dot:nth-child(2) { animation-delay: -0.16s; }
      `}</style>
      <div className="ai-dot w-2 h-2 bg-neutral-500 rounded-full" />
      <div className="ai-dot w-2 h-2 bg-neutral-500 rounded-full" />
      <div className="ai-dot w-2 h-2 bg-neutral-500 rounded-full" />
    </div>
  );
}
