import React, { useState } from "react";
import {
  BookOpen,
  Calendar,
  ClipboardCheck,
  GraduationCap,
  HelpCircle,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Modal } from "../ui/Modal";
import { promptTemplates, PromptTemplate } from "../../data/ai-prompt-templates";

interface AiPromptPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: string;
  onSelect: (prompt: string) => void;
}

const templateIcons: Record<PromptTemplate["icon"], LucideIcon> = {
  BookOpen,
  Calendar,
  ClipboardCheck,
  GraduationCap,
  HelpCircle,
  Sparkles,
};

export default function AiPromptPalette({
  isOpen,
  onClose,
  userRole,
  onSelect,
}: AiPromptPaletteProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTemplates = promptTemplates.filter((t) => {
    const matchesRole = t.role === "all" || t.role === userRole;
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesRole && matchesSearch;
  });

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center space-x-2">
          <Sparkles className="w-5 h-5 text-indigo-500" />
          <span>Шаблоны запросов</span>
        </div>
      }
      size="lg"
    >
      <div className="space-y-4">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-450 dark:text-neutral-500" />
          <input
            type="text"
            placeholder="Поиск по названию или описанию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-neutral-800 dark:text-neutral-100"
          />
        </div>

        {/* Templates Grid */}
        {filteredTemplates.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pr-1">
            {filteredTemplates.map((template) => {
              const IconComponent = templateIcons[template.icon] || HelpCircle;
              return (
                <button
                  key={template.id}
                  onClick={() => {
                    onSelect(template.prompt);
                    onClose();
                  }}
                  className="flex items-start text-left p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:border-indigo-500 dark:hover:border-indigo-850 hover:bg-indigo-50/10 dark:hover:bg-indigo-950/10 transition group cursor-pointer"
                >
                  <div className="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 mr-3 shadow-sm border border-indigo-100/5 group-hover:scale-105 transition-transform duration-200">
                    <IconComponent className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center space-x-1.5">
                      <h4 className="font-semibold text-sm text-neutral-800 dark:text-neutral-200 truncate">
                        {template.title}
                      </h4>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 capitalize">
                        {template.category}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                      {template.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-neutral-500 dark:text-neutral-450 text-sm">
            Шаблоны не найдены.
          </div>
        )}
      </div>
    </Modal>
  );
}
