export interface PromptTemplate {
  id: string;
  role: 'student' | 'teacher' | 'admin' | 'all';
  icon: string;            // Name of the lucide icon
  title: string;
  description: string;
  prompt: string;
  category: 'study' | 'teaching' | 'generation' | 'general';
}

export const promptTemplates: PromptTemplate[] = [
  {
    id: "explain-topic",
    role: "student",
    icon: "BookOpen",
    title: "Объясни тему",
    description: "Простое объяснение сложной темы с аналогиями и примерами",
    prompt: "Объясни тему \"...\" простыми словами, как для студента. Добавь наглядные жизненные примеры и аналогии для лучшего понимания.",
    category: "study",
  },
  {
    id: "prepare-test",
    role: "student",
    icon: "GraduationCap",
    title: "Подготовка к тесту",
    description: "Чек-лист и ключевые понятия для подготовки по теме",
    prompt: "Составь подробный чек-лист для подготовки к тесту/экзамену по теме \"...\". Выдели ключевые понятия, формулы или концепции, которые обязательно нужно выучить.",
    category: "study",
  },
  {
    id: "solve-exercise",
    role: "student",
    icon: "HelpCircle",
    title: "Помощь с задачей",
    description: "Пошаговый разбор сложного упражнения или примера",
    prompt: "Помоги мне разобраться с решением следующей задачи: \"...\". Напиши пошаговый алгоритм решения и объясни логику каждого шага.",
    category: "study",
  },
  {
    id: "gen-questions",
    role: "teacher",
    icon: "Sparkles",
    title: "Придумай вопросы",
    description: "Разработка тестовых вопросов разной сложности по теме",
    prompt: "Придумай 5 тестовых вопросов разного типа (одиночный выбор, множественный выбор, краткий ответ) по теме \"...\" с разбором и пояснением правильных ответов.",
    category: "generation",
  },
  {
    id: "lesson-plan",
    role: "teacher",
    icon: "Calendar",
    title: "План занятия",
    description: "Структура и тайм-менеджмент лекции или семинара",
    prompt: "Составь подробный план лекции или семинарского занятия (90 минут) по теме \"...\". Разбей занятие на блоки по времени, укажи цели каждого блока и активности для студентов.",
    category: "teaching",
  },
  {
    id: "grading-criteria",
    role: "teacher",
    icon: "ClipboardCheck",
    title: "Критерии оценивания",
    description: "Рубрика оценки для проекта или контрольной работы",
    prompt: "Сформулируй критерии оценивания (рубрику) для практического задания по теме \"...\". Выдели уровни выполнения (отлично, хорошо, удовлетворительно) и соответствующие баллы.",
    category: "teaching",
  },
];
