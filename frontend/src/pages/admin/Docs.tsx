import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Rocket,
  Server,
  Database,
  Sprout,
  HardDrive,
  RotateCcw,
  Settings,
  ChevronDown,
  Copy,
  Check,
  ShieldCheck,
  Table2,
  FileSpreadsheet,
  Bell,
  Activity,
  History,
  AlertTriangle,
  UserPlus,
  Building2,
  ClipboardList,
  LifeBuoy,
  User,
  Palette,
} from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Skeleton } from "../../components/ui/Feedback";
import { adminApi } from "../../api/admin";
import { cn } from "../../lib/cn";

// Компонент для копирования кода/команд
function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Не удалось скопировать текст:", err);
    }
  };

  return (
    <div className="relative group my-2">
      <pre className="bg-[var(--color-bg-muted)] rounded-md p-3 text-sm font-mono overflow-x-auto border border-[var(--color-border)] pr-12 text-slate-300 dark:text-slate-200">
        <code>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2.5 right-2.5 p-1.5 rounded bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-hover)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
        title="Копировать команду"
      >
        {copied ? (
          <Check className="w-4 h-4 text-emerald-500" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}

// Компонент раскрывающегося контейнера (Collapsible Card)
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

export default function AdminDocs() {
  // Запрос динамической информации об окружении
  const envQuery = useQuery({
    queryKey: ["admin", "docs", "env-info"],
    queryFn: () => adminApi.docsEnvInfo().then((r) => r.data),
  });

  const sections = [
    { id: "quickstart", label: "Быстрый старт", icon: <Rocket className="w-5 h-5" /> },
    { id: "workflow", label: "Рабочий цикл", icon: <ClipboardList className="w-5 h-5" /> },
    { id: "users", label: "Пользователи", icon: <UserPlus className="w-5 h-5" /> },
    { id: "groups", label: "Группы", icon: <Building2 className="w-5 h-5" /> },
    { id: "assignments", label: "Назначения", icon: <Table2 className="w-5 h-5" /> },
    { id: "structure", label: "Импорт и экспорт", icon: <FileSpreadsheet className="w-5 h-5" /> },
    { id: "monitoring", label: "Мониторинг", icon: <Activity className="w-5 h-5" /> },
    { id: "branding", label: "Брендинг", icon: <Palette className="w-5 h-5" /> },
    { id: "profile", label: "Профиль", icon: <User className="w-5 h-5" /> },
    { id: "incidents", label: "Типовые ситуации", icon: <LifeBuoy className="w-5 h-5" /> },
    { id: "startup", label: "Запуск системы", icon: <Server className="w-5 h-5" /> },
    { id: "migrations", label: "Миграции базы данных", icon: <Database className="w-5 h-5" /> },
    { id: "seeding", label: "Seed-данные", icon: <Sprout className="w-5 h-5" /> },
    { id: "backup", label: "Резервное копирование", icon: <HardDrive className="w-5 h-5" /> },
    { id: "restore", label: "Восстановление БД", icon: <RotateCcw className="w-5 h-5" /> },
    { id: "environment", label: "Текущее окружение", icon: <Settings className="w-5 h-5" /> },
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
        {/* Заголовок страницы */}
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-[var(--color-accent)]" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Документация администратора</h1>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                Руководство по запуску, администрированию, резервному копированию и развертыванию платформы Verifika.
              </p>
            </div>
          </div>
        </header>

        {/* Основной контент с двухколоночным макетом */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Боковая панель навигации (Sticky Table of Contents) */}
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

          {/* Список разделов документации */}
          <div className="lg:col-span-3 space-y-6">
            {/* Раздел 1: Быстрый старт */}
            <CollapsibleSection
              id="quickstart"
              title="1. Быстрый старт"
              icon={<Rocket className="w-5 h-5" />}
            >
              <p>
                Добро пожаловать в административный раздел системы тестирования <strong>Verifika</strong>!
                Платформа представляет собой современное клиент-серверное веб-приложение, а также кроссплатформенное десктопное приложение.
              </p>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Требования к окружению</h3>
              <ul className="list-disc pl-5 mt-2 space-y-1.5">
                <li>
                  <strong className="text-[var(--color-text-primary)]">PostgreSQL 15+</strong> — реляционная СУБД для хранения данных пользователей, тестов, сессий и статистики.
                </li>
                <li>
                  <strong className="text-[var(--color-text-primary)]">Python 3.11+</strong> — среда выполнения для бэкенда на базе FastAPI и SQLAlchemy.
                </li>
                <li>
                  <strong className="text-[var(--color-text-primary)]">Node.js / Bun</strong> — среда выполнения для фронтенда на базе React, Vite и Tailwind CSS.
                </li>
                <li>
                  <strong className="text-[var(--color-text-primary)]">Rust Toolchain</strong> — необходим для компиляции десктопного приложения с помощью Tauri.
                </li>
              </ul>
              <p className="mt-4">
                Для ознакомления со спецификациями установки и первыми шагами обратитесь к файлу{" "}
                <a
                  href="file:///home/leo/verifika/README.md"
                  className="text-[var(--color-accent)] hover:underline"
                >
                  README.md
                </a>{" "}
                в корне проекта.
              </p>
            </CollapsibleSection>

            <CollapsibleSection
              id="workflow"
              title="2. Рабочий цикл администратора"
              icon={<ClipboardList className="w-5 h-5" />}
            >
              <p>
                Администратор отвечает за структуру платформы: пользователей, учебные группы, дисциплины, назначения доступа,
                контроль активных сессий и техническое состояние сервера. Преподаватель работает с темами, вопросами и оцениванием,
                но доступ к дисциплинам и группам обычно подготавливает администратор.
              </p>

              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Рекомендуемый порядок настройки нового учебного потока</h3>
              <ol className="list-decimal pl-5 mt-2 space-y-2">
                <li>
                  Создайте учебные группы в разделе <code className="px-1.5 py-0.5 rounded bg-[var(--color-bg-muted)] text-xs">Группы</code>.
                  Используйте понятные названия: номер группы, год набора или направление.
                </li>
                <li>
                  Добавьте студентов и преподавателей в разделе <code className="px-1.5 py-0.5 rounded bg-[var(--color-bg-muted)] text-xs">Пользователи</code>.
                  Студента сразу привяжите к группе, преподавателя оставьте без группы.
                </li>
                <li>
                  Создайте дисциплины в разделе <code className="px-1.5 py-0.5 rounded bg-[var(--color-bg-muted)] text-xs">Дисциплины</code>.
                  Название дисциплины должно быть стабильным: оно используется в отчетах и истории попыток.
                </li>
                <li>
                  Назначьте преподавателей, группы и отдельных студентов через карточку дисциплины или через раздел{" "}
                  <code className="px-1.5 py-0.5 rounded bg-[var(--color-bg-muted)] text-xs">Назначения</code>.
                </li>
                <li>
                  Проверьте матрицу назначений: у каждой активной дисциплины должен быть хотя бы один преподаватель и целевая группа или студент.
                </li>
                <li>
                  После начала тестирований контролируйте разделы <code className="px-1.5 py-0.5 rounded bg-[var(--color-bg-muted)] text-xs">Сессии</code>,{" "}
                  <code className="px-1.5 py-0.5 rounded bg-[var(--color-bg-muted)] text-xs">Лента</code>,{" "}
                  <code className="px-1.5 py-0.5 rounded bg-[var(--color-bg-muted)] text-xs">Аудит</code> и{" "}
                  <code className="px-1.5 py-0.5 rounded bg-[var(--color-bg-muted)] text-xs">Здоровье</code>.
                </li>
              </ol>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
                <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-hover)]">
                  <div className="flex items-center gap-2 font-semibold text-[var(--color-text-primary)]">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Что можно архивировать</span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mt-2">
                    Пользователей, группы и дисциплины лучше архивировать, а не удалять. Так сохраняются история сессий,
                    оценки, аудит и статистика.
                  </p>
                </div>
                <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-hover)]">
                  <div className="flex items-center gap-2 font-semibold text-[var(--color-text-primary)]">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Что проверять перед тестом</span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mt-2">
                    У студента должна быть активная учетная запись, группа или персональное назначение на дисциплину,
                    а у дисциплины должен быть назначенный преподаватель.
                  </p>
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              id="users"
              title="3. Пользователи и роли"
              icon={<UserPlus className="w-5 h-5" />}
            >
              <p>
                Раздел <code className="px-1.5 py-0.5 rounded bg-[var(--color-bg-muted)] text-xs">Пользователи</code>
                используется для создания аккаунтов, смены ролей, сброса паролей, архивации и восстановления доступа.
                В системе есть три основные роли: студент, преподаватель и администратор.
              </p>

              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Когда какую роль выбирать</h3>
              <div className="overflow-x-auto mt-2 border border-[var(--color-border)] rounded-md">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--color-bg-muted)] border-b border-[var(--color-border)]">
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Роль</th>
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Назначение</th>
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Важные ограничения</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    <tr>
                      <td className="p-3 font-medium">Студент</td>
                      <td className="p-3">Проходит тесты, смотрит историю попыток, получает рекомендации и уведомления.</td>
                      <td className="p-3">Желательно сразу указать группу. Доступ к дисциплинам идет через группу или персональное назначение.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium">Преподаватель</td>
                      <td className="p-3">Создает темы и вопросы, публикует тесты, проверяет файловые ответы, комментирует результаты.</td>
                      <td className="p-3">Видит только назначенные дисциплины.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium">Администратор</td>
                      <td className="p-3">Управляет структурой, пользователями, назначениями, сессиями, аудитом и техническим состоянием.</td>
                      <td className="p-3">Назначайте только сотрудникам, которым нужен полный доступ к системе.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-5">Основные действия</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>
                  <strong className="text-[var(--color-text-primary)]">Создать пользователя:</strong> нажмите «Добавить», выберите роль,
                  заполните ФИО, email и временный пароль. Email должен быть уникальным.
                </li>
                <li>
                  <strong className="text-[var(--color-text-primary)]">Сбросить пароль:</strong> используйте действие сброса в строке пользователя.
                  Новый временный пароль передайте пользователю по защищенному каналу.
                </li>
                <li>
                  <strong className="text-[var(--color-text-primary)]">Сменить роль:</strong> применяйте только после проверки связанных данных.
                  Например, студент с попытками не должен случайно стать преподавателем.
                </li>
                <li>
                  <strong className="text-[var(--color-text-primary)]">Архивировать:</strong> пользователь не сможет войти, но его сессии,
                  оценки и история сохранятся.
                </li>
                <li>
                  <strong className="text-[var(--color-text-primary)]">Восстановить:</strong> вернет доступ архивному пользователю без потери истории.
                </li>
              </ul>

              <div className="p-4 rounded-lg bg-amber-950/20 border border-amber-800 text-amber-300 text-xs mt-4 flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <div>
                  Перед массовыми изменениями ролей или групп сделайте экспорт структуры. Это даст быстрый способ сверить,
                  какие пользователи и назначения были изменены.
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              id="groups"
              title="4. Группы и учебная структура"
              icon={<Building2 className="w-5 h-5" />}
            >
              <p>
                Группы объединяют студентов и позволяют назначать доступ к дисциплине сразу целому потоку. Это основной способ
                выдачи доступа студентам: персональные назначения используйте для исключений.
              </p>

              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Типовой сценарий работы с группами</h3>
              <ol className="list-decimal pl-5 mt-2 space-y-2">
                <li>Создайте группу с коротким и понятным названием.</li>
                <li>Добавьте или импортируйте студентов, указав эту группу.</li>
                <li>Назначьте группу на нужные дисциплины.</li>
                <li>Откройте карточку группы, чтобы проверить список студентов.</li>
                <li>Если студенты переходят в другую группу, используйте массовый перевод, а не ручное редактирование каждого аккаунта.</li>
              </ol>

              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-5">Архивация группы</h3>
              <p>
                Архивация скрывает группу из рабочих списков, но не удаляет студентов и историю тестирования. Перед архивацией проверьте,
                что у студентов нет будущих тестов, доступных только через эту группу.
              </p>
            </CollapsibleSection>

            <CollapsibleSection
              id="assignments"
              title="5. Назначения дисциплин"
              icon={<Table2 className="w-5 h-5" />}
            >
              <p>
                Назначения определяют, кто может работать с дисциплиной. Преподаватель получает доступ к созданию тем и вопросов,
                студент или группа получают доступ к опубликованным тестам.
              </p>

              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Три типа назначений</h3>
              <div className="overflow-x-auto mt-2 border border-[var(--color-border)] rounded-md">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--color-bg-muted)] border-b border-[var(--color-border)]">
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Назначение</th>
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Кому выдает доступ</th>
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Когда использовать</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    <tr>
                      <td className="p-3 font-medium">Преподаватель</td>
                      <td className="p-3">Конкретному преподавателю.</td>
                      <td className="p-3">Когда преподаватель должен вести дисциплину, создавать вопросы и проверять результаты.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium">Группа</td>
                      <td className="p-3">Всем активным студентам группы.</td>
                      <td className="p-3">Основной вариант для учебных потоков.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium">Студент</td>
                      <td className="p-3">Одному студенту независимо от группы.</td>
                      <td className="p-3">Индивидуальный доступ, пересдача, перевод, академическая разница.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-5">Как читать матрицу назначений</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Строка матрицы соответствует дисциплине.</li>
                <li>Чипы преподавателей показывают, кто может управлять материалами этой дисциплины.</li>
                <li>Чипы групп и студентов показывают, кто увидит дисциплину в кабинете студента.</li>
                <li>Удаление чипа отзывает назначение, но не удаляет пользователя, группу или дисциплину.</li>
              </ul>

              <div className="p-4 rounded-lg bg-red-950/20 border border-red-800 text-red-300 text-xs mt-4 flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <div>
                  Если студент не видит дисциплину, сначала проверьте матрицу назначений, затем архивный статус студента,
                  его группу и статус самой дисциплины.
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              id="structure"
              title="6. Импорт и экспорт структуры"
              icon={<FileSpreadsheet className="w-5 h-5" />}
            >
              <p>
                Раздел <code className="px-1.5 py-0.5 rounded bg-[var(--color-bg-muted)] text-xs">Импорт</code>
                помогает быстро загрузить пользователей, группы, дисциплины и назначения из таблицы. Экспорт используйте
                перед массовыми изменениями и для сверки с внешними учебными списками.
              </p>

              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Безопасный порядок импорта</h3>
              <ol className="list-decimal pl-5 mt-2 space-y-2">
                <li>Скачайте шаблон структуры из интерфейса.</li>
                <li>Заполните обязательные поля и не меняйте названия колонок.</li>
                <li>Сначала импортируйте небольшой фрагмент или тестовую группу.</li>
                <li>Проверьте отчет импорта: сколько записей создано, обновлено и пропущено.</li>
                <li>После полного импорта откройте матрицу назначений и сверку пользователей.</li>
              </ol>

              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-5">Что делать с ошибками импорта</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Если email уже существует, система обновляет или пропускает запись в зависимости от сценария импорта.</li>
                <li>Если группа или дисциплина не найдена, проверьте написание: лишние пробелы и разные сокращения создают несоответствия.</li>
                <li>Если часть строк не импортировалась, исправьте только проблемные строки и загрузите файл повторно.</li>
              </ul>
            </CollapsibleSection>

            <CollapsibleSection
              id="monitoring"
              title="7. Мониторинг, сессии, лента и аудит"
              icon={<Activity className="w-5 h-5" />}
            >
              <p>
                Администраторский мониторинг разделен на несколько экранов. Они отвечают на разные вопросы: работает ли сервер,
                что происходит сейчас, кто выполнил действие и какие уведомления были отправлены.
              </p>

              <div className="overflow-x-auto mt-2 border border-[var(--color-border)] rounded-md">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--color-bg-muted)] border-b border-[var(--color-border)]">
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Раздел</th>
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Для чего нужен</th>
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Когда открывать</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    <tr>
                      <td className="p-3 font-medium"><Activity className="inline w-3.5 h-3.5 mr-1" />Сессии</td>
                      <td className="p-3">Активные попытки, принудительное завершение, очистка ответов, ручная корректировка балла.</td>
                      <td className="p-3">Студент завис в тесте, преподаватель просит закрыть попытку, нужна административная корректировка.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium"><Bell className="inline w-3.5 h-3.5 mr-1" />Лента</td>
                      <td className="p-3">События и уведомления системы с фильтрами по типу, важности, роли и пользователю.</td>
                      <td className="p-3">Нужно понять, какие события система показывала пользователям.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium"><History className="inline w-3.5 h-3.5 mr-1" />Аудит</td>
                      <td className="p-3">История административных и пользовательских действий с деталями изменений.</td>
                      <td className="p-3">Нужно выяснить, кто изменил пользователя, дисциплину, назначение или результат.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium"><ShieldCheck className="inline w-3.5 h-3.5 mr-1" />Здоровье</td>
                      <td className="p-3">Проверка базы данных, статистики, активных сессий и технических метрик.</td>
                      <td className="p-3">Пользователи жалуются на ошибки, медленную работу или недоступность данных.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-5">Правила ручного вмешательства в сессии</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Принудительно завершайте попытку только когда студент не может завершить ее сам или попытка явно зависла.</li>
                <li>Очистку ответов используйте как исключение: это влияет на попытку и должно быть понятно по аудиту.</li>
                <li>Ручную корректировку балла сопровождайте комментарием, чтобы преподаватель и администраторы понимали причину.</li>
                <li>Перед спорным действием найдите сессию в аудите и проверьте время старта, дедлайн и последние события.</li>
              </ul>
            </CollapsibleSection>

            <CollapsibleSection
              id="branding"
              title="8. Брендирование приложения"
              icon={<Palette className="w-5 h-5" />}
            >
              <p>
                Раздел <code className="px-1.5 py-0.5 rounded bg-[var(--color-bg-muted)] text-xs">Брендинг</code>
                управляет названием приложения, логотипом в верхнем баре и оформлением экрана входа. По умолчанию используются
                текущие значения системы, поэтому настройки можно менять постепенно.
              </p>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Что можно настроить</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li><strong>Название приложения:</strong> отображается в верхнем баре и на экране входа, например «СТС ГПОУ КПК».</li>
                <li><strong>Логотип верхнего бара:</strong> загружается отдельным изображением и показывается рядом с названием.</li>
                <li><strong>Логотип учреждения:</strong> используется на экране входа; размер задается ползунком в пикселях.</li>
                <li><strong>Нижний правый логотип:</strong> можно полностью скрыть флажком, если он не нужен в окне авторизации.</li>
                <li><strong>Баннер входа:</strong> включается отдельным флажком и показывает выбранное изображение на странице авторизации.</li>
              </ul>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-5">Работа с изображениями</h3>
              <ol className="list-decimal pl-5 mt-2 space-y-2">
                <li>Загрузите изображение в нужном блоке: логотип верхнего бара, логотип учреждения или баннер входа.</li>
                <li>Проверьте предпросмотр справа и выберите нужный вариант из последних загруженных файлов.</li>
                <li>Для логотипа учреждения задайте размер, а для баннера включите показ баннера.</li>
                <li>Нажмите «Сохранить», чтобы применить настройки для всех пользователей.</li>
                <li>Используйте «Сбросить», если нужно вернуться к названию и логотипам по умолчанию.</li>
              </ol>
              <div className="p-4 rounded-lg bg-amber-950/20 border border-amber-800 text-amber-300 text-xs mt-4 flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <div>
                  Перед заменой логотипов проверьте читаемость на темной и светлой темах. Для баннера лучше использовать широкое
                  изображение без мелкого текста, потому что экран входа адаптируется под разные размеры окна.
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              id="profile"
              title="9. Профиль администратора"
              icon={<User className="w-5 h-5" />}
            >
              <p>
                Профиль администратора доступен из меню пользователя в верхнем баре. Возможности такие же, как у остальных ролей:
                фото профиля, смена пароля и управление собственными сеансами входа.
              </p>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Фото профиля</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Поддерживаются изображения JPG, PNG и WebP размером до 5 МБ.</li>
                <li>После выбора файла доступен предпросмотр; сохраненный аватар приводится к квадрату 256x256 пикселей.</li>
                <li>Предыдущие аватары можно выбрать повторно или удалить из истории.</li>
              </ul>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-5">Сеансы администратора</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>В списке видны текущее устройство, web/Tauri-клиент, браузер или ОС, примерное местоположение, IP и время последней активности.</li>
                <li>Незнакомый сеанс завершайте сразу: действие требует подтверждения и отзывает доступ на выбранном устройстве.</li>
                <li>Кнопка завершения всех других сеансов оставляет текущий вход активным и отключает остальные устройства администратора.</li>
                <li>При смене пароля включайте выход с других устройств, если есть риск компрометации учетной записи.</li>
              </ul>
            </CollapsibleSection>

            <CollapsibleSection
              id="incidents"
              title="10. Типовые ситуации и быстрые решения"
              icon={<LifeBuoy className="w-5 h-5" />}
            >
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Студент не может войти</h3>
                  <ol className="list-decimal pl-5 mt-2 space-y-1.5">
                    <li>Проверьте email в разделе пользователей.</li>
                    <li>Убедитесь, что аккаунт не архивирован.</li>
                    <li>Сбросьте пароль и попросите студента войти заново.</li>
                    <li>Если проблема повторяется, проверьте ленту и аудит по этому пользователю.</li>
                  </ol>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Студент не видит тест или дисциплину</h3>
                  <ol className="list-decimal pl-5 mt-2 space-y-1.5">
                    <li>Проверьте, что студент активен и состоит в нужной группе.</li>
                    <li>Откройте матрицу назначений и найдите дисциплину.</li>
                    <li>Убедитесь, что назначена группа студента или сам студент.</li>
                    <li>Попросите преподавателя проверить публикацию темы, сроки доступности и количество попыток.</li>
                  </ol>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Преподаватель не видит дисциплину</h3>
                  <ol className="list-decimal pl-5 mt-2 space-y-1.5">
                    <li>Проверьте роль пользователя: она должна быть «Преподаватель».</li>
                    <li>Проверьте, что преподаватель назначен на дисциплину.</li>
                    <li>Убедитесь, что дисциплина не архивирована.</li>
                    <li>Если назначение только что добавлено, попросите преподавателя обновить страницу.</li>
                  </ol>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Тест завис или студент случайно закрыл окно</h3>
                  <ol className="list-decimal pl-5 mt-2 space-y-1.5">
                    <li>Откройте активные сессии и найдите попытку по студенту или дисциплине.</li>
                    <li>Проверьте, не истек ли таймер и есть ли сохраненные ответы.</li>
                    <li>Если попытка продолжается, студент может вернуться в нее до истечения времени.</li>
                    <li>Если попытку нужно закрыть административно, используйте принудительное завершение с понятным комментарием.</li>
                  </ol>
                </div>
              </div>
            </CollapsibleSection>

            {/* Раздел 2: Запуск системы */}
            <CollapsibleSection
              id="startup"
              title="11. Запуск системы"
              icon={<Server className="w-5 h-5" />}
            >
              <p>
                Запустить систему в режиме разработки можно с помощью готового автоматического скрипта или вручную для каждого компонента.
              </p>

              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Команды запуска</h3>

              <div className="space-y-3 mt-2">
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)]">Запуск бэкенда и веб-фронтенда в режиме разработки:</p>
                  <CodeBlock code="./scripts/dev.sh" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)]">Запуск Tauri-приложения в режиме разработки:</p>
                  <CodeBlock code="./scripts/dev.sh tauri" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)]">Ручной запуск бэкенда (из директории backend):</p>
                  <CodeBlock code="cd backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)]">Ручной запуск фронтенда (из директории frontend):</p>
                  <CodeBlock code="cd frontend && bun run dev" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)]">Компиляция / Сборка десктопного приложения Tauri:</p>
                  <CodeBlock code="cd frontend && bun x tauri build" />
                </div>
              </div>

              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-6">Переменные окружения (.env)</h3>
              <p className="mt-1">
                Файл конфигурации бэкенда расположен в <code className="px-1.5 py-0.5 rounded bg-[var(--color-bg-muted)] text-xs font-mono">backend/.env</code>.
                Основные переменные:
              </p>
              <div className="overflow-x-auto mt-2 border border-[var(--color-border)] rounded-md">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--color-bg-muted)] border-b border-[var(--color-border)]">
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Переменная</th>
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Описание</th>
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Пример значения</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    <tr>
                      <td className="p-3 font-mono">DATABASE_URL</td>
                      <td className="p-3">Строка подключения к СУБД PostgreSQL.</td>
                      <td className="p-3 font-mono">postgresql+asyncpg://postgres:pass@127.0.0.1/verifika</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono">JWT_SECRET</td>
                      <td className="p-3">Секретный ключ для шифрования токенов сессий.</td>
                      <td className="p-3 font-mono">supersecretkeyphrase123!</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono">CORS_ORIGINS</td>
                      <td className="p-3">Разрешенные адреса для запросов к API.</td>
                      <td className="p-3 font-mono">["http://localhost:5173", "tauri://localhost"]</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono">LOG_LEVEL</td>
                      <td className="p-3">Уровень логирования событий.</td>
                      <td className="p-3 font-mono">INFO / DEBUG / WARNING</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono">SMTP_HOST</td>
                      <td className="p-3">Хост почтового сервера для рассылки уведомлений.</td>
                      <td className="p-3 font-mono">smtp.yandex.ru</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono">AI_ENABLED</td>
                      <td className="p-3">Флаг активации встроенного ИИ-ассистента.</td>
                      <td className="p-3 font-mono">True / False</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>

            {/* Раздел 3: Миграции базы данных */}
            <CollapsibleSection
              id="migrations"
              title="12. Миграции базы данных"
              icon={<Database className="w-5 h-5" />}
            >
              <p>
                Управление схемой реляционной базы данных выполняется с помощью инструмента <strong>Alembic</strong>.
                Все изменения в структуре моделей SQLAlchemy должны фиксироваться в файлах миграций.
              </p>

              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Команды Alembic</h3>
              <div className="space-y-3 mt-2">
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)]">Применить все существующие миграции к БД:</p>
                  <CodeBlock code="cd backend && uv run alembic upgrade head" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)]">Откатить последнюю примененную миграцию (-1 шаг):</p>
                  <CodeBlock code="cd backend && uv run alembic downgrade -1" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)]">Сгенерировать файл новой миграции на основе изменений моделей:</p>
                  <CodeBlock code="cd backend && uv run alembic revision --autogenerate -m 'описание изменений моделей'" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)]">Пометить базу данных текущей версией (без применения SQL):</p>
                  <CodeBlock code="cd backend && uv run alembic stamp head" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)]">Показать историю всех зарегистрированных миграций:</p>
                  <CodeBlock code="cd backend && uv run alembic history" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)]">Показать текущее состояние и ревизию базы данных:</p>
                  <CodeBlock code="cd backend && uv run alembic current" />
                </div>
              </div>
            </CollapsibleSection>

            {/* Раздел 4: Seed-данные */}
            <CollapsibleSection
              id="seeding"
              title="13. Seed-данные (Начальное заполнение)"
              icon={<Sprout className="w-5 h-5" />}
            >
              <p>
                Для первоначального заполнения базы данных или создания демонстрационных данных в системе используется сид-скрипт.
                Скрипты разработаны так, чтобы быть идемпотентными: их повторный запуск не приводит к дублированию или перезаписи данных.
              </p>

              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Команды заполнения БД</h3>
              <div className="space-y-3 mt-2">
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)]">Базовое заполнение (создание роли администратора и системных тегов):</p>
                  <CodeBlock code="cd backend && uv run python -m scripts.seed" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)]">Заполнение демонстрационными данными (студенты, группы, преподаватели, тесты):</p>
                  <CodeBlock code="cd backend && SEED_DEMO=1 uv run python -m scripts.seed" />
                </div>
              </div>

              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-6">Демонстрационные учетные записи по умолчанию</h3>
              <p className="mt-1">
                Для тестирования функциональности вы можете использовать следующие учетные записи (при заполнении БД с параметром <code className="px-1.5 py-0.5 rounded bg-[var(--color-bg-muted)] text-xs font-mono">SEED_DEMO=1</code>):
              </p>
              <div className="overflow-x-auto mt-2 border border-[var(--color-border)] rounded-md">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--color-bg-muted)] border-b border-[var(--color-border)]">
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Роль</th>
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Email (Логин)</th>
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Пароль</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    <tr>
                      <td className="p-3 font-medium">Администратор</td>
                      <td className="p-3 font-mono">admin@verifika.ru</td>
                      <td className="p-3 font-mono">adminpass</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium">Преподаватель</td>
                      <td className="p-3 font-mono">teacher@verifika.ru</td>
                      <td className="p-3 font-mono">teacherpass</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium">Студент</td>
                      <td className="p-3 font-mono">student@verifika.ru</td>
                      <td className="p-3 font-mono">studentpass</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>

            {/* Раздел 5: Резервное копирование */}
            <CollapsibleSection
              id="backup"
              title="14. Резервное копирование"
              icon={<HardDrive className="w-5 h-5" />}
            >
              <p>
                Безопасность данных — приоритет при администрировании системы. Настоятельно рекомендуется настроить регулярное автоматическое резервное копирование базы данных PostgreSQL и пользовательских файлов.
              </p>

              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Команды создания бэкапов</h3>
              <div className="space-y-3 mt-2">
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)]">Создание полного сжатого бэкапа базы данных:</p>
                  <CodeBlock code="pg_dump -h localhost -U postgres -d student-testing-system -F c -f backup_$(date +%Y%m%d_%H%M%S).dump" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)]">Резервное копирование только структуры таблиц (без данных):</p>
                  <CodeBlock code="pg_dump -h localhost -U postgres -d student-testing-system --schema-only -f schema.sql" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)]">Резервное копирование только данных:</p>
                  <CodeBlock code="pg_dump -h localhost -U postgres -d student-testing-system --data-only -f data.sql" />
                </div>
              </div>

              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-6">Автоматизация с помощью Cron</h3>
              <p className="mt-1">
                Для автоматического ежедневного создания резервных копий в 3:00 ночи добавьте запись в планировщик задач Linux (<code className="px-1.5 py-0.5 rounded bg-[var(--color-bg-muted)] text-xs font-mono">crontab -e</code>):
              </p>
              <CodeBlock code="0 3 * * * pg_dump -h localhost -U postgres -d student-testing-system -F c -f /path/to/backups/backup_$(date +\%Y\%m\%d).dump" />

              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-6">Резервное копирование медиа-файлов</h3>
              <p className="mt-1 text-red-400 dark:text-red-300 font-medium">
                Внимание! База данных содержит только текстовые ссылки. Сами изображения к вопросам и профилям пользователей сохраняются на диске в директории:
              </p>
              <pre className="bg-[var(--color-bg-muted)] rounded-md p-3 text-xs font-mono border border-[var(--color-border)] text-slate-300 mt-2">
                /home/leo/verifika/backend/uploads/
              </pre>
              <p className="mt-2 text-xs">
                Рекомендуется архивировать эту папку параллельно с базой данных, используя утилиту <code className="px-1 py-0.5 rounded bg-[var(--color-bg-muted)] text-xs font-mono">tar</code>.
              </p>
            </CollapsibleSection>

            {/* Раздел 6: Восстановление */}
            <CollapsibleSection
              id="restore"
              title="15. Восстановление базы данных"
              icon={<RotateCcw className="w-5 h-5" />}
            >
              <p>
                Восстановление структуры и данных выполняется из созданных ранее дампов. Перед восстановлением убедитесь, что соединение с базой данных не удерживается другими процессами.
              </p>

              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Команды восстановления</h3>
              <div className="space-y-3 mt-2">
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)]">Восстановление с заменой данных и очисткой существующих таблиц (дамп в формате Custom):</p>
                  <CodeBlock code="pg_restore -h localhost -U postgres -d student-testing-system -c backup.dump" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)]">Создание новой чистой базы данных для восстановления:</p>
                  <CodeBlock code="createdb -h localhost -U postgres student-testing-system" />
                </div>
              </div>

              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-6">Алгоритм полного восстановления после сбоя</h3>
              <ol className="list-decimal pl-5 mt-2 space-y-2 text-xs">
                <li>
                  Остановите службу бэкенда, чтобы закрыть все активные пул-подключения к БД.
                </li>
                <li>
                  Создайте новую чистую базу данных (или очистите существующую).
                </li>
                <li>
                  Выполните команду восстановления из файла дампа: <code className="px-1 py-0.5 rounded bg-[var(--color-bg-muted)] text-xs font-mono">pg_restore -h localhost -U postgres -d student-testing-system backup.dump</code>.
                </li>
                <li>
                  Перейдите в каталог бэкенда и примените любые возможные пропущенные или новые миграции: <code className="px-1 py-0.5 rounded bg-[var(--color-bg-muted)] text-xs font-mono">uv run alembic upgrade head</code>.
                </li>
                <li>
                  Восстановите резервную копию папки <code className="px-1 py-0.5 rounded bg-[var(--color-bg-muted)] text-xs font-mono">uploads/</code>.
                </li>
                <li>
                  Запустите службу бэкенда и выполните тестовый вход в систему для проверки целостности данных.
                </li>
              </ol>
            </CollapsibleSection>

            {/* Раздел 8: Текущее окружение (Динамический) */}
            <CollapsibleSection
              id="environment"
              title="16. Текущее окружение (Динамические данные)"
              icon={<Settings className="w-5 h-5" />}
            >
              <p className="mb-4">
                Ниже представлены параметры конфигурации и состояния запущенного сервера бэкенда, загруженные в реальном времени.
              </p>

              {envQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-6 w-3/4" />
                </div>
              ) : envQuery.isError ? (
                <div className="p-4 rounded-md bg-red-950/20 border border-red-800 text-red-400 text-xs">
                  Не удалось загрузить параметры окружения с сервера API. Проверьте подключение и авторизацию.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Левая колонка */}
                  <div className="space-y-3">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-[var(--color-border)]">
                      <div className="text-xs text-[var(--color-text-muted)] font-medium">Версия приложения</div>
                      <div className="font-semibold text-sm mt-0.5 text-[var(--color-text-primary)]">
                        {String(envQuery.data?.app_version || "Не определено")}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-[var(--color-border)]">
                      <div className="text-xs text-[var(--color-text-muted)] font-medium">Версия Python</div>
                      <div className="font-mono text-sm mt-0.5 text-[var(--color-text-primary)]">
                        {String(envQuery.data?.python_version || "Не определено")}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-[var(--color-border)] overflow-hidden">
                      <div className="text-xs text-[var(--color-text-muted)] font-medium">База данных (Маскировано)</div>
                      <div className="font-mono text-xs mt-0.5 truncate text-[var(--color-text-primary)]" title={String(envQuery.data?.database_url_masked)}>
                        {String(envQuery.data?.database_url_masked || "Не определено")}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-[var(--color-border)]">
                      <div className="text-xs text-[var(--color-text-muted)] font-medium">Текущая Alembic ревизия</div>
                      <div className="font-mono text-xs mt-0.5 text-[var(--color-text-primary)]">
                        {envQuery.data?.alembic_revision ? (
                          <Badge tone="accent">{String(envQuery.data.alembic_revision)}</Badge>
                        ) : (
                          <span className="text-[var(--color-text-muted)]">Ревизия отсутствует или не считана</span>
                        )}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-[var(--color-border)]">
                      <div className="text-xs text-[var(--color-text-muted)] font-medium">Папка загрузки медиафайлов</div>
                      <div className="font-mono text-xs mt-0.5 text-[var(--color-text-primary)]">
                        {String(envQuery.data?.upload_dir || "Не определено")}
                      </div>
                    </div>
                  </div>

                  {/* Правая колонка */}
                  <div className="space-y-3">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-[var(--color-border)]">
                      <div className="text-xs text-[var(--color-text-muted)] font-medium">ИИ-Ассистент (AI Status)</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {envQuery.data?.ai_enabled ? (
                          <>
                            <Badge tone="success">Включен</Badge>
                            <span className="text-[11px] text-[var(--color-text-muted)]">
                              (Модели: {String(envQuery.data?.ai_chat_model)} / {String(envQuery.data?.ai_generation_model)})
                            </span>
                          </>
                        ) : (
                          <Badge tone="neutral">Выключен</Badge>
                        )}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-[var(--color-border)]">
                      <div className="text-xs text-[var(--color-text-muted)] font-medium">JWT Срок действия сессии</div>
                      <div className="font-semibold text-sm mt-0.5 text-[var(--color-text-primary)]">
                        {String(envQuery.data?.jwt_expire_minutes || "—")} мин
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-[var(--color-border)]">
                      <div className="text-xs text-[var(--color-text-muted)] font-medium">Уровень логирования (LOG_LEVEL)</div>
                      <div className="font-mono text-xs mt-0.5 text-[var(--color-text-primary)]">
                        <Badge tone="info">{String(envQuery.data?.log_level || "INFO")}</Badge>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-[var(--color-border)]">
                      <div className="text-xs text-[var(--color-text-muted)] font-medium">Почта SMTP (Настройка)</div>
                      <div className="mt-0.5">
                        {envQuery.data?.smtp_configured ? (
                          <Badge tone="success">Настроена</Badge>
                        ) : (
                          <Badge tone="warning">Не настроена (письма отключены)</Badge>
                        )}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-[var(--color-border)]">
                      <div className="text-xs text-[var(--color-text-muted)] font-medium">Шифрование bcrypt (Rounds)</div>
                      <div className="font-semibold text-sm mt-0.5 text-[var(--color-text-primary)]">
                        {String(envQuery.data?.bcrypt_rounds || "—")}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CollapsibleSection>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
