import { useState } from "react";
import {
  BookOpen,
  Rocket,
  Database,
  Sparkles,
  MessageSquare,
  BarChart3,
  ChevronDown,
  HelpCircle,
  Users,
  Tags,
  Upload,
  Bell,
  ShieldCheck,
  AlertTriangle,
  History,
  FileSpreadsheet,
  Settings,
  Eye,
  ClipboardList,
  User,
} from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { cn } from "../../lib/cn";

// Collapsible Card для разделов документации
interface CollapsibleSectionProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function CollapsibleSection({ id, title, icon, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Card id={id} className="scroll-mt-20 overflow-hidden p-0 border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 text-left border-b border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] transition-colors focus:outline-none"
      >
        <div className="flex items-center gap-3">
          <div className="text-[var(--color-accent)]">{icon}</div>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">{title}</h2>
        </div>
        <ChevronDown
          className={cn(
            "w-5 h-5 text-[var(--color-text-muted)] transition-transform duration-200",
            isOpen ? "transform rotate-0" : "transform -rotate-90"
          )}
        />
      </button>
      {isOpen && <div className="p-5 space-y-4 text-sm text-[var(--color-text-secondary)] leading-relaxed">{children}</div>}
    </Card>
  );
}

export default function TeacherDocs() {
  const sections = [
    { id: "intro", label: "Кабинет", icon: <Rocket className="w-5 h-5" /> },
    { id: "workflow", label: "Рабочий цикл", icon: <ClipboardList className="w-5 h-5" /> },
    { id: "reference", label: "Справочники", icon: <Database className="w-5 h-5" /> },
    { id: "topics", label: "Темы и политика", icon: <Settings className="w-5 h-5" /> },
    { id: "questions", label: "Банк вопросов", icon: <Sparkles className="w-5 h-5" /> },
    { id: "ai", label: "ИИ и проверка", icon: <Eye className="w-5 h-5" /> },
    { id: "file-answers", label: "Файловые ответы", icon: <Upload className="w-5 h-5" /> },
    { id: "gradebook", label: "Журнал и отчеты", icon: <FileSpreadsheet className="w-5 h-5" /> },
    { id: "reviews", label: "Оценка и обратная связь", icon: <MessageSquare className="w-5 h-5" /> },
    { id: "analytics", label: "Аналитика", icon: <BarChart3 className="w-5 h-5" /> },
    { id: "notifications", label: "Уведомления и аудит", icon: <Bell className="w-5 h-5" /> },
    { id: "profile", label: "Профиль", icon: <User className="w-5 h-5" /> },
    { id: "incidents", label: "Типовые ситуации", icon: <HelpCircle className="w-5 h-5" /> },
  ];

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <AppShell>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Шапка страницы */}
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-[var(--color-accent)]" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Руководство преподавателя</h1>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                Подробные инструкции по созданию тестов, оценке результатов, комментированию ответов и использованию ИИ-ассистента.
              </p>
            </div>
          </div>
        </header>

        {/* Двухколоночный макет */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Боковая навигация (Sticky TOC) */}
          <aside className="hidden lg:block lg:col-span-1">
            <div className="sticky top-24 space-y-4">
              <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Содержание
                </h3>
                <nav className="space-y-1">
                  {sections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => scrollToSection(section.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-all text-left"
                    >
                      {section.icon}
                      <span>{section.label}</span>
                    </button>
                  ))}
                </nav>
              </div>
            </div>
          </aside>

          {/* Список разделов */}
          <div className="lg:col-span-3 space-y-6">
            <CollapsibleSection
              id="intro"
              title="1. Кабинет преподавателя"
              icon={<Rocket className="w-5 h-5" />}
            >
              <p>
                Кабинет преподавателя в <strong>Verifika</strong> предназначен для подготовки учебных материалов,
                настройки тестов, контроля попыток, проверки ответов и анализа результатов студентов. Преподаватель
                работает только с теми дисциплинами и группами, которые назначены администратором.
              </p>

              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Основные разделы меню</h3>
              <div className="overflow-x-auto mt-4 border border-[var(--color-border)] rounded-md">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--color-bg-muted)] border-b border-[var(--color-border)]">
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Раздел</th>
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Что здесь делать</th>
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Когда открывать</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    <tr>
                      <td className="p-3 font-medium">Справочники</td>
                      <td className="p-3">Просматривать назначенные дисциплины, группы, студентов и теги.</td>
                      <td className="p-3">Когда нужно проверить состав группы или перейти к ведомости.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium">Банк</td>
                      <td className="p-3">Создавать темы, вопросы, импортировать и экспортировать банк, запускать AI-генерацию.</td>
                      <td className="p-3">При подготовке теста или корректировке материалов.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium">Журнал</td>
                      <td className="p-3">Смотреть группы, студентов, попытки, отчеты и комментарии.</td>
                      <td className="p-3">После проведения тестирования и при разборе результатов.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium">Проверка файлов</td>
                      <td className="p-3">Оценивать ответы, которые студенты загрузили файлами.</td>
                      <td className="p-3">Когда в тесте есть задания типа «Загрузка файла».</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium">Диагностика и аналитика</td>
                      <td className="p-3">Находить проблемы публикации, сложные вопросы и слабые темы.</td>
                      <td className="p-3">Перед публикацией теста и после получения результатов.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              id="workflow"
              title="2. Рабочий цикл преподавателя"
              icon={<ClipboardList className="w-5 h-5" />}
            >
              <p>
                Оптимальный сценарий работы строится вокруг дисциплины: сначала структура и темы, затем банк вопросов,
                после этого политика теста, публикация, проверка и анализ.
              </p>
              <ol className="list-decimal pl-5 mt-2 space-y-2">
                <li>Откройте назначенную дисциплину в справочниках или в банке вопросов.</li>
                <li>Проверьте темы: названия, порядок, изображения и архивный статус.</li>
                <li>Наполните каждую тему вопросами разных типов и укажите баллы.</li>
                <li>Запустите диагностику дисциплины: система подсветит нехватку вопросов, неготовые тесты и проблемные настройки.</li>
                <li>Настройте тест по теме: количество вопросов, время, попытки, проходной балл, шкалу оценивания и сроки.</li>
                <li>После тестирования откройте журнал группы или карточку студента, прокомментируйте ошибки и проверьте файловые ответы.</li>
                <li>Используйте аналитику тем, чтобы решить, какие материалы нужно повторить или переработать.</li>
              </ol>
              <div className="p-4 rounded-lg bg-amber-950/20 border border-amber-800 text-amber-300 text-xs mt-4 flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <div>
                  Не публикуйте тест сразу после массового импорта вопросов. Сначала откройте предпросмотр, проверьте варианты ответов,
                  изображения, правильные ответы и настройки случайного перемешивания.
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              id="reference"
              title="3. Справочники: дисциплины, группы, студенты и теги"
              icon={<Database className="w-5 h-5" />}
            >
              <p>
                Справочники показывают рабочую структуру, доступную преподавателю. Если нужной дисциплины или группы нет в списке,
                ее должен назначить администратор.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-hover)]">
                  <div className="flex items-center gap-2 font-semibold text-[var(--color-text-primary)]">
                    <BookOpen className="w-4 h-4 text-[var(--color-accent)]" />
                    <span>Дисциплины</span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mt-2">
                    Карточки дисциплин ведут к настройке политики, банку вопросов и диагностике. Архивные дисциплины скрываются
                    из обычного рабочего потока.
                  </p>
                </div>
                <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-hover)]">
                  <div className="flex items-center gap-2 font-semibold text-[var(--color-text-primary)]">
                    <Users className="w-4 h-4 text-sky-400" />
                    <span>Группы и студенты</span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mt-2">
                    В карточке группы доступны список студентов, переход к ведомости, массовый обзор результатов и экспорт отчетов.
                  </p>
                </div>
                <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-hover)]">
                  <div className="flex items-center gap-2 font-semibold text-[var(--color-text-primary)]">
                    <Tags className="w-4 h-4 text-emerald-400" />
                    <span>Теги</span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mt-2">
                    Теги помогают фильтровать вопросы по навыкам, разделам, сложности, практическим работам или экзаменационным темам.
                  </p>
                </div>
                <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-hover)]">
                  <div className="flex items-center gap-2 font-semibold text-[var(--color-text-primary)]">
                    <FileSpreadsheet className="w-4 h-4 text-purple-400" />
                    <span>Ведомость</span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mt-2">
                    Ведомость группы показывает прогресс по студентам и позволяет выгружать результаты в CSV, XLSX или PDF.
                  </p>
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              id="topics"
              title="4. Темы и политика тестирования"
              icon={<Settings className="w-5 h-5" />}
            >
              <p>
                Тема является основной единицей тестирования. Вопросы привязываются к теме, а тест по теме определяет,
                сколько вопросов студент увидит, сколько времени получит и как будет рассчитан итог.
              </p>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Ключевые настройки теста по теме</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li><strong>Тест включен:</strong> без этого флага тема не станет доступным тестом.</li>
                <li><strong>Количество вопросов:</strong> не должно превышать число активных вопросов в теме.</li>
                <li><strong>Время:</strong> лимит в минутах для одной попытки.</li>
                <li><strong>Попытки:</strong> 0 обычно означает отсутствие доступных попыток, задавайте значение осознанно.</li>
                <li><strong>Проходной балл:</strong> зависит от выбранной шкалы: проценты, пятибалльная или десятибалльная.</li>
                <li><strong>Метод оценивания:</strong> лучшая, последняя, первая или средняя попытка.</li>
                <li><strong>Задержка попыток:</strong> пауза между повторными прохождениями.</li>
                <li><strong>Перемешивание:</strong> снижает риск списывания, но требует аккуратных формулировок вопросов.</li>
                <li><strong>Показывать ответы и баллы:</strong> управляет тем, что студент увидит после завершения.</li>
              </ul>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-5">Сроки по группам</h3>
              <p>
                Для разных групп можно задать отдельные окна доступности. Используйте это, если группы проходят тему в разные недели
                или если одной группе нужно продлить срок.
              </p>
              <div className="overflow-x-auto mt-3 border border-[var(--color-border)] rounded-md">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--color-bg-muted)] border-b border-[var(--color-border)]">
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Поле</th>
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Смысл</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    <tr>
                      <td className="p-3 font-medium">Доступен с</td>
                      <td className="p-3">Раньше этой даты студент не сможет начать тест.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium">Доступен до</td>
                      <td className="p-3">После этой даты старт новой попытки закрывается.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium">Правило группы</td>
                      <td className="p-3">Переопределяет общие сроки для конкретной группы.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              id="questions"
              title="5. Банк вопросов"
              icon={<Sparkles className="w-5 h-5" />}
            >
              <p>
                Банк вопросов поддерживает ручное создание, импорт, экспорт, архивирование, восстановление, дублирование,
                массовые операции, фильтры по теме, тегам, сложности, типу и AI-статусу.
              </p>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Типы вопросов</h3>
              <div className="overflow-x-auto mt-2 border border-[var(--color-border)] rounded-md">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--color-bg-muted)] border-b border-[var(--color-border)]">
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Тип</th>
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Когда использовать</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    <tr><td className="p-3 font-medium">Один вариант</td><td className="p-3">Классический тестовый вопрос с одним правильным ответом.</td></tr>
                    <tr><td className="p-3 font-medium">Несколько вариантов</td><td className="p-3">Вопрос, где правильных ответов больше одного.</td></tr>
                    <tr><td className="p-3 font-medium">Краткий / текстовый ответ</td><td className="p-3">Термины, числа, формулы, короткие фразы с эталонами.</td></tr>
                    <tr><td className="p-3 font-medium">Числовой ответ</td><td className="p-3">Расчеты с допустимой погрешностью.</td></tr>
                    <tr><td className="p-3 font-medium">Сопоставление</td><td className="p-3">Пары «понятие - определение», «команда - результат».</td></tr>
                    <tr><td className="p-3 font-medium">Порядок</td><td className="p-3">Алгоритмы, этапы процесса, последовательность действий.</td></tr>
                    <tr><td className="p-3 font-medium">Верно / неверно</td><td className="p-3">Быстрая проверка факта или утверждения.</td></tr>
                    <tr><td className="p-3 font-medium">Пропуски</td><td className="p-3">Текстовые задания с выбором или вводом ответа в нескольких местах.</td></tr>
                    <tr><td className="p-3 font-medium">Загрузка файла</td><td className="p-3">Практические работы, код, архивы, документы и другие проверяемые вручную материалы.</td></tr>
                  </tbody>
                </table>
              </div>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-5">Чек-лист качественного вопроса</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Формулировка проверяет один конкретный навык или факт.</li>
                <li>Варианты ответа не дублируют друг друга и не выдают правильный ответ длиной или стилем.</li>
                <li>Указаны баллы, сложность, тема и при необходимости теги.</li>
                <li>Пояснение к правильному ответу написано так, чтобы студент мог разобрать ошибку после теста.</li>
                <li>Для файлового вопроса задан понятный набор расширений, лимит размера и максимальное количество файлов.</li>
              </ul>
            </CollapsibleSection>

            <CollapsibleSection
              id="ai"
              title="6. ИИ-генерация и проверка вопросов"
              icon={<Eye className="w-5 h-5" />}
            >
              <p>
                ИИ помогает подготовить черновики вопросов, варианты ответов, пояснения и оценку сложности. Сгенерированные
                вопросы попадают в состояние проверки: преподаватель должен просмотреть их перед использованием в тесте.
              </p>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Как безопасно использовать ИИ</h3>
              <ol className="list-decimal pl-5 mt-2 space-y-2">
                <li>Запускайте генерацию из банка вопросов по конкретной дисциплине и теме.</li>
                <li>Откройте список «На проверке (AI)» или отдельный раздел AI-review.</li>
                <li>Проверьте фактическую корректность, сложность, варианты ответов и пояснение.</li>
                <li>Отредактируйте спорные формулировки вручную.</li>
                <li>Только после проверки используйте вопрос в опубликованном тесте.</li>
              </ol>
              <div className="p-4 rounded-lg bg-amber-950/20 border border-amber-800 text-amber-300 text-xs mt-4 flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <div>
                  ИИ не является источником истины. Он ускоряет черновую подготовку, но ответственность за корректность вопроса,
                  правильный ответ и соответствие программе остается за преподавателем.
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              id="file-answers"
              title="7. Файловые ответы и ручная проверка"
              icon={<Upload className="w-5 h-5" />}
            >
              <p>
                Тип вопроса «Загрузка файла» подходит для лабораторных, программного кода, отчетов, презентаций и архивов.
                Такие задания не оцениваются автоматически: они попадают в очередь проверки файлов.
              </p>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Настройка файлового вопроса</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Укажите максимальное количество файлов и размер одного файла.</li>
                <li>Ограничьте расширения, если задание ожидает конкретный формат: например, <code className="px-1 py-0.5 rounded bg-[var(--color-bg-muted)] text-xs">.zip, .docx, .py</code>.</li>
                <li>В тексте вопроса явно напишите, что должно быть внутри файла или архива.</li>
                <li>Используйте баллы вопроса как максимум для ручной оценки.</li>
              </ul>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-5">Проверка файлов</h3>
              <ol className="list-decimal pl-5 mt-2 space-y-2">
                <li>Откройте раздел <code className="px-1.5 py-0.5 rounded bg-[var(--color-bg-muted)] text-xs">Проверка файлов</code>.</li>
                <li>Выберите попытку, скачайте вложения и проверьте работу.</li>
                <li>Введите баллы и комментарий по каждому файловому вопросу.</li>
                <li>Сохраните оценку. Когда все файловые вопросы проверены, итоговая оценка попытки пересчитывается.</li>
              </ol>
            </CollapsibleSection>

            <CollapsibleSection
              id="gradebook"
              title="8. Журнал, ведомости и отчеты"
              icon={<FileSpreadsheet className="w-5 h-5" />}
            >
              <p>
                Журнал и карточки студентов позволяют перейти от общей картины группы к деталям конкретной попытки.
                Ведомость группы подходит для регулярной проверки прогресса и экспорта результатов.
              </p>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Что доступно в журнале</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Список групп и студентов, назначенных на ваши дисциплины.</li>
                <li>Карточка студента с историей попыток, активностью и прокторинг-событиями.</li>
                <li>Экспорт ведомости группы в CSV, XLSX и PDF.</li>
                <li>PDF-отчет по студенту или отдельной попытке.</li>
                <li>Переход к комментариям, ручной корректировке и файловой проверке.</li>
              </ul>
            </CollapsibleSection>

            <CollapsibleSection
              id="reviews"
              title="9. Оценка, комментарии и обратная связь"
              icon={<MessageSquare className="w-5 h-5" />}
            >
              <p>
                Обратная связь нужна не только для спорных оценок. Комментарии помогают студенту понять ошибку, а преподавателю -
                зафиксировать причину ручного решения.
              </p>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Где оставлять комментарии</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li><strong>Комментарий к попытке:</strong> общий вывод по работе студента.</li>
                <li><strong>Комментарий к ответу:</strong> пояснение по конкретному вопросу.</li>
                <li><strong>Комментарий к файловому ответу:</strong> причина выставленного балла и замечания по приложенному файлу.</li>
              </ul>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-5">Ручная корректировка балла</h3>
              <p>
                Используйте ручную корректировку, если автоматическая оценка не учитывает валидный ответ, была спорная формулировка
                или преподаватель принимает решение по апелляции. Указывайте понятный комментарий: он остается в истории.
              </p>
            </CollapsibleSection>

            <CollapsibleSection
              id="analytics"
              title="10. Аналитика и диагностика"
              icon={<BarChart3 className="w-5 h-5" />}
            >
              <p>
                Аналитика помогает понять, где проблема: в теме, вопросе, группе или настройке теста.
              </p>
              <div className="overflow-x-auto mt-3 border border-[var(--color-border)] rounded-md">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--color-bg-muted)] border-b border-[var(--color-border)]">
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Инструмент</th>
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Что показывает</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    <tr>
                      <td className="p-3 font-medium">Дашборд</td>
                      <td className="p-3">Средние результаты, динамику, последние попытки и новые комментарии.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium">Аналитика тем</td>
                      <td className="p-3">Успеваемость по темам, группам и выбранной теме.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium">Диагностика</td>
                      <td className="p-3">Проблемы публикации, нехватку вопросов, слабые места дисциплины и качество банка.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium">Качество вопросов</td>
                      <td className="p-3">Сигналы о вопросах, которые стоит перепроверить или переработать.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-5">Как использовать результаты</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Если тема массово провалена, добавьте разбор или тренировочные материалы.</li>
                <li>Если один вопрос часто вызывает ошибки, проверьте формулировку и правильный ответ.</li>
                <li>Если у группы резко ниже результат, сравните сроки, количество попыток и доступность темы.</li>
              </ul>
            </CollapsibleSection>

            <CollapsibleSection
              id="notifications"
              title="11. Уведомления и журнал действий"
              icon={<Bell className="w-5 h-5" />}
            >
              <p>
                Уведомления показывают события, требующие внимания: новые комментарии, проблемные попытки, файлы на проверке
                и другие рабочие сигналы. Журнал действий фиксирует изменения, выполненные преподавателем.
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li><strong>Уведомления:</strong> используйте фильтры и отметку «прочитано», чтобы не пропускать новые события.</li>
                <li><strong>Журнал действий:</strong> помогает восстановить, когда был добавлен комментарий, изменена оценка или выполнено другое действие.</li>
              </ul>
              <div className="p-4 rounded-lg bg-slate-900/20 border border-[var(--color-border)] text-xs mt-4 flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 shrink-0 text-[var(--color-accent)]" />
                <div>
                  Если вы работаете с общим компьютером, выходите из профиля после завершения работы. В журнале сохраняются
                  действия под вашей учетной записью.
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              id="profile"
              title="12. Профиль преподавателя"
              icon={<User className="w-5 h-5" />}
            >
              <p>
                Профиль доступен из верхнего меню пользователя и из боковой навигации. В нем находятся данные учетной записи,
                фото профиля, смена пароля и управление активными сеансами.
              </p>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Фото профиля</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Загружайте JPG, PNG или WebP до 5 МБ; система сохраняет аватар в квадратном размере 256x256 пикселей.</li>
                <li>Перед сохранением показывается предпросмотр выбранного изображения.</li>
                <li>Ранее загруженные аватары доступны в истории: их можно вернуть активными или удалить.</li>
              </ul>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-5">Устройства и входы</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Список сеансов показывает текущее устройство, тип клиента, браузер или Tauri-клиент, ОС, примерное местоположение и последнюю активность.</li>
                <li>Незнакомый сеанс можно завершить отдельной кнопкой после подтверждения.</li>
                <li>Кнопка завершения всех других сеансов удобна после работы за чужим компьютером или при подозрении на доступ с лишнего устройства.</li>
                <li>При смене пароля можно включить выход из аккаунта на остальных устройствах.</li>
              </ul>
            </CollapsibleSection>

            <CollapsibleSection
              id="incidents"
              title="13. Типовые ситуации"
              icon={<HelpCircle className="w-5 h-5" />}
            >
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Студент не видит дисциплину или тест</h3>
                  <ol className="list-decimal pl-5 mt-2 space-y-1.5">
                    <li>Проверьте, назначена ли дисциплина студенту или его группе. Если назначения нет, обратитесь к администратору.</li>
                    <li>Проверьте, включен ли тест по теме.</li>
                    <li>Проверьте сроки доступности и правила группы.</li>
                    <li>Проверьте количество разрешенных попыток и не исчерпал ли студент лимит.</li>
                  </ol>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Тест не публикуется или выглядит пустым</h3>
                  <ol className="list-decimal pl-5 mt-2 space-y-1.5">
                    <li>Откройте диагностику дисциплины.</li>
                    <li>Проверьте, что в теме достаточно активных вопросов.</li>
                    <li>Убедитесь, что вопросы не находятся в архиве или на AI-проверке.</li>
                    <li>Проверьте, что количество вопросов в политике не больше доступного количества.</li>
                  </ol>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Файловый ответ не повлиял на итог</h3>
                  <ol className="list-decimal pl-5 mt-2 space-y-1.5">
                    <li>Откройте раздел проверки файлов.</li>
                    <li>Проверьте, есть ли непроверенные файловые вопросы в попытке.</li>
                    <li>Выставьте баллы и сохраните комментарий.</li>
                    <li>После проверки всех файловых вопросов обновите карточку студента или ведомость.</li>
                  </ol>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Нужно изменить результат после апелляции</h3>
                  <ol className="list-decimal pl-5 mt-2 space-y-1.5">
                    <li>Откройте карточку студента и нужную попытку.</li>
                    <li>Проверьте ответы, комментарии и прокторинг-события.</li>
                    <li>Внесите ручную корректировку балла.</li>
                    <li>Оставьте комментарий с причиной изменения.</li>
                  </ol>
                </div>
              </div>
            </CollapsibleSection>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
