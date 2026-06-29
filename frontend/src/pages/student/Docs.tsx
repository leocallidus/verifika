import { useState } from "react";
import {
  Activity,
  AlertCircle,
  Bell,
  BookOpen,
  ChevronDown,
  Clock,
  FileText,
  Flag,
  HelpCircle,
  History,
  LineChart,
  ListChecks,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Upload,
  User,
  WifiOff,
} from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { cn } from "../../lib/cn";

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
            isOpen ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>
      {isOpen && <div className="p-5 space-y-4 text-sm text-[var(--color-text-secondary)] leading-relaxed">{children}</div>}
    </Card>
  );
}

export default function StudentDocs() {
  const sections = [
    { id: "intro", label: "Кабинет", icon: <Rocket className="w-5 h-5" /> },
    { id: "disciplines", label: "Дисциплины", icon: <BookOpen className="w-5 h-5" /> },
    { id: "topic", label: "Карточка темы", icon: <FileText className="w-5 h-5" /> },
    { id: "start", label: "Перед стартом", icon: <ListChecks className="w-5 h-5" /> },
    { id: "taking", label: "Прохождение", icon: <Clock className="w-5 h-5" /> },
    { id: "question-types", label: "Типы вопросов", icon: <Flag className="w-5 h-5" /> },
    { id: "file-upload", label: "Файлы", icon: <Upload className="w-5 h-5" /> },
    { id: "proctoring", label: "Прокторинг", icon: <ShieldCheck className="w-5 h-5" /> },
    { id: "prep-ai", label: "Подготовка и ИИ", icon: <Sparkles className="w-5 h-5" /> },
    { id: "results", label: "История и разбор", icon: <History className="w-5 h-5" /> },
    { id: "dashboard", label: "Дашборд", icon: <LineChart className="w-5 h-5" /> },
    { id: "activity", label: "Активность", icon: <Activity className="w-5 h-5" /> },
    { id: "notifications", label: "Уведомления", icon: <Bell className="w-5 h-5" /> },
    { id: "profile", label: "Профиль", icon: <User className="w-5 h-5" /> },
    { id: "issues", label: "Проблемы", icon: <HelpCircle className="w-5 h-5" /> },
  ];

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <AppShell>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <HelpCircle className="w-8 h-8 text-[var(--color-accent)]" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Справка для студента</h1>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                Подробное руководство по дисциплинам, тестам, подготовке, результатам, уведомлениям и действиям при ошибках.
              </p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
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

          <div className="lg:col-span-3 space-y-6">
            <CollapsibleSection id="intro" title="1. Личный кабинет студента" icon={<Rocket className="w-5 h-5" />}>
              <p>
                В личном кабинете вы видите назначенные дисциплины, доступные темы, активные попытки, историю результатов,
                уведомления и рекомендации по повторению. Доступ к дисциплинам настраивается преподавателем или администратором:
                если дисциплины нет в списке, сначала проверьте группу и назначения через преподавателя.
              </p>
              <div className="overflow-x-auto mt-4 border border-[var(--color-border)] rounded-md">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--color-bg-muted)] border-b border-[var(--color-border)]">
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Раздел</th>
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Для чего нужен</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    <tr><td className="p-3 font-medium">Дисциплины</td><td className="p-3">Список предметов, тем, доступных тестов и активных попыток.</td></tr>
                    <tr><td className="p-3 font-medium">Дашборд</td><td className="p-3">Сводка успеваемости, ближайшие дедлайны, активные сессии и последние результаты.</td></tr>
                    <tr><td className="p-3 font-medium">История</td><td className="p-3">Все завершенные попытки, детализация ответов, PDF-отчеты и рекомендации.</td></tr>
                    <tr><td className="p-3 font-medium">Активность</td><td className="p-3">Хронология учебных действий: тесты, оценки, комментарии и события.</td></tr>
                    <tr><td className="p-3 font-medium">Уведомления</td><td className="p-3">Новые тесты, дедлайны, оценки и комментарии преподавателя.</td></tr>
                    <tr><td className="p-3 font-medium">Профиль</td><td className="p-3">Ваши данные, фото профиля, смена пароля и активные сеансы входа.</td></tr>
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>

            <CollapsibleSection id="disciplines" title="2. Дисциплины и доступные тесты" icon={<BookOpen className="w-5 h-5" />}>
              <p>
                На странице дисциплин отображаются предметы, назначенные вам лично или вашей группе. Внутри дисциплины находятся
                темы. У каждой темы может быть тест, режим подготовки, история попыток и ограничения по времени.
              </p>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Что означают статусы темы</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li><strong>Доступно:</strong> тест можно начать сейчас.</li>
                <li><strong>Есть активная попытка:</strong> тест уже начат, его нужно продолжить.</li>
                <li><strong>Недоступно:</strong> тест закрыт по срокам, исчерпаны попытки или тема еще не опубликована.</li>
                <li><strong>Следующая попытка позже:</strong> преподаватель настроил паузу между попытками.</li>
              </ul>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-5">Параметры, которые стоит проверить перед стартом</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Количество доступных попыток и номер текущей попытки.</li>
                <li>Ограничение времени на прохождение.</li>
                <li>Окно доступности: дата начала и дата окончания.</li>
                <li>Пауза между попытками, если вы уже сдавали эту тему.</li>
                <li>Проходной балл и шкала оценивания, если они показаны.</li>
              </ul>
            </CollapsibleSection>

            <CollapsibleSection id="topic" title="3. Карточка темы и подготовка к старту" icon={<FileText className="w-5 h-5" />}>
              <p>
                Карточка темы показывает правила тестирования, историю ваших попыток по этой теме и блок подготовки. Перед стартом
                внимательно прочитайте параметры: после начала попытки таймер уже будет запущен.
              </p>
              <ol className="list-decimal pl-5 mt-2 space-y-2">
                <li>Откройте нужную дисциплину и выберите тему.</li>
                <li>Проверьте доступность, окно времени, попытки и паузу между попытками.</li>
                <li>Если есть активная попытка, нажмите «Продолжить», а не начинайте новую.</li>
                <li>Если тест недоступен, прочитайте причину в карточке темы.</li>
                <li>Если доступен ИИ-помощник, используйте его до начала теста для повторения материала.</li>
              </ol>
            </CollapsibleSection>

            <CollapsibleSection id="start" title="4. Перед началом теста" icon={<ListChecks className="w-5 h-5" />}>
              <p>
                После нажатия «Начать тест» система может показать окно подтверждения. Оно напоминает о попытках, времени,
                дедлайнах и правилах прохождения. Закройте лишние вкладки и подготовьте файлы, если в тесте могут быть задания
                с загрузкой ответа.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-hover)]">
                  <div className="flex items-center gap-2 font-semibold text-[var(--color-text-primary)]">
                    <Clock className="w-4 h-4 text-[var(--color-accent)]" />
                    <span>Проверьте время</span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mt-2">
                    Таймер идет с момента старта попытки. Если закрыть вкладку, время продолжит расходоваться.
                  </p>
                </div>
                <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-hover)]">
                  <div className="flex items-center gap-2 font-semibold text-[var(--color-text-primary)]">
                    <WifiOff className="w-4 h-4 text-amber-400" />
                    <span>Проверьте интернет</span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mt-2">
                    Ответы автосохраняются, но при нестабильной сети отправка может временно ожидать восстановления соединения.
                  </p>
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection id="taking" title="5. Прохождение теста" icon={<Clock className="w-5 h-5" />}>
              <p>
                В режиме тестирования доступны вопрос, карта вопросов, таймер, индикатор сохранения и кнопки навигации.
                Перед отправкой результатов открывается экран проверки, где видно, на какие вопросы вы ответили.
              </p>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Как работает сохранение</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Ответы отправляются на сервер автоматически при изменении.</li>
                <li>Если сеть пропала, часть ответов может временно храниться локально и отправиться позже.</li>
                <li>Индикатор сохранения показывает состояние: сохранено, идет сохранение, ожидает отправки или ошибка.</li>
                <li>Перед завершением теста система принудительно отправляет актуальные ответы.</li>
              </ul>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-5">Карта вопросов</h3>
              <p>
                Карта помогает быстро перейти к нужному вопросу, увидеть пропущенные ответы и отметить вопрос флагом для повторной проверки.
              </p>
              <div className="p-4 rounded-lg bg-amber-950/20 border border-amber-800 text-amber-300 text-xs mt-4 flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <div>
                  Не закрывайте страницу сразу после выбора ответа, если индикатор показывает ошибку сохранения. Дождитесь восстановления
                  соединения или попробуйте обновить страницу и продолжить активную попытку.
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection id="question-types" title="6. Типы вопросов" icon={<Flag className="w-5 h-5" />}>
              <p>
                В тесте могут встретиться разные форматы заданий. Интерфейс вопроса меняется в зависимости от типа.
              </p>
              <div className="overflow-x-auto mt-3 border border-[var(--color-border)] rounded-md">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--color-bg-muted)] border-b border-[var(--color-border)]">
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Тип</th>
                      <th className="p-3 font-semibold text-[var(--color-text-primary)]">Как отвечать</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    <tr><td className="p-3 font-medium">Один вариант</td><td className="p-3">Выберите один ответ из списка.</td></tr>
                    <tr><td className="p-3 font-medium">Несколько вариантов</td><td className="p-3">Отметьте все варианты, которые считаете правильными.</td></tr>
                    <tr><td className="p-3 font-medium">Краткий / текстовый ответ</td><td className="p-3">Введите слово, фразу, число или формулу в поле ответа.</td></tr>
                    <tr><td className="p-3 font-medium">Сопоставление</td><td className="p-3">Соотнесите элементы из двух списков.</td></tr>
                    <tr><td className="p-3 font-medium">Порядок</td><td className="p-3">Расставьте элементы в правильной последовательности.</td></tr>
                    <tr><td className="p-3 font-medium">Верно / неверно</td><td className="p-3">Выберите, является ли утверждение правильным.</td></tr>
                    <tr><td className="p-3 font-medium">Пропуски</td><td className="p-3">Заполните пропуски вводом текста или выбором из вариантов.</td></tr>
                    <tr><td className="p-3 font-medium">Загрузка файла</td><td className="p-3">Прикрепите файл с решением, отчетом, кодом или архивом.</td></tr>
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>

            <CollapsibleSection id="file-upload" title="7. Загрузка файлов в ответах" icon={<Upload className="w-5 h-5" />}>
              <p>
                В файловом вопросе нужно загрузить один или несколько файлов. Преподаватель проверит их вручную и выставит баллы.
                Итоговая оценка может появиться не сразу, если в попытке есть непроверенные файловые ответы.
              </p>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Практические правила</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Проверьте ограничение по размеру и количеству файлов.</li>
                <li>Загружайте поддерживаемый формат. Если формат не подходит, система покажет понятное сообщение.</li>
                <li>Для кода или проекта лучше загрузить архив, если преподаватель просит несколько файлов.</li>
                <li>После загрузки убедитесь, что файл появился в списке прикрепленных.</li>
                <li>Если нужно заменить файл, удалите старый и загрузите новый до завершения попытки.</li>
              </ul>
            </CollapsibleSection>

            <CollapsibleSection id="proctoring" title="8. Прокторинг и честное прохождение" icon={<ShieldCheck className="w-5 h-5" />}>
              <p>
                Для некоторых тестов преподаватель может включить контроль прохождения. Система фиксирует события, которые помогают
                преподавателю разобраться в спорных ситуациях.
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Может фиксироваться потеря фокуса окна, переходы между вкладками или выход из полноэкранного режима.</li>
                <li>При более строгом режиме может потребоваться камера и полноэкранный режим.</li>
                <li>Если браузер запрашивает доступ к камере, разрешите его до начала работы с вопросами.</li>
                <li>Не запускайте сторонние средства записи, скриншотов или удаленного доступа во время теста.</li>
              </ul>
              <div className="p-4 rounded-lg bg-red-950/20 border border-red-800 text-red-300 text-xs mt-4 flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <div>
                  Прокторинг не заменяет преподавателя, но события попадают в журнал и могут учитываться при разборе попытки.
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection id="prep-ai" title="9. Подготовка и ИИ-помощник" icon={<Sparkles className="w-5 h-5" />}>
              <p>
                Если ИИ включен для темы, вы можете задать вопрос по материалу до начала теста. Помощник подходит для повторения
                терминов, разбора типовых ошибок, примеров и подготовки к теме.
              </p>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Как задавать полезные вопросы</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Пишите конкретно: «объясни разницу между ...», «приведи пример ...», «проверь мое понимание ...».</li>
                <li>Просите короткие тренировочные вопросы, если хотите проверить себя перед стартом.</li>
                <li>Не вставляйте персональные данные и пароли.</li>
                <li>Не рассчитывайте получить ответы активного теста: помощник не предназначен для списывания.</li>
              </ul>
            </CollapsibleSection>

            <CollapsibleSection id="results" title="10. История, результаты и разбор ошибок" icon={<History className="w-5 h-5" />}>
              <p>
                В истории хранятся все завершенные попытки. В карточке попытки можно увидеть баллы, процент, оценку, ответы,
                комментарии преподавателя, статус файловых заданий и рекомендации по повторению.
              </p>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Что смотреть после теста</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Итоговый результат и шкалу оценки.</li>
                <li>Какие вопросы были отвечены неверно или частично.</li>
                <li>Комментарии преподавателя к попытке или конкретному ответу.</li>
                <li>Проверены ли файловые ответы.</li>
                <li>Рекомендации по повторению и темы, которые стоит разобрать.</li>
              </ul>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-5">Жалоба или вопрос по попытке</h3>
              <p>
                Если вы считаете, что в вопросе ошибка или результат выставлен некорректно, используйте кнопку обращения в карточке
                попытки. Опишите проблему конкретно: номер вопроса, что именно не совпадает, и почему вы считаете ответ корректным.
              </p>
            </CollapsibleSection>

            <CollapsibleSection id="dashboard" title="11. Дашборд успеваемости" icon={<LineChart className="w-5 h-5" />}>
              <p>
                Дашборд показывает вашу учебную траекторию: средний результат, активные сессии, ближайшие дедлайны,
                последние попытки, прогресс по темам и уведомления.
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li><strong>Активные сессии:</strong> попытки, которые нужно продолжить.</li>
                <li><strong>Дедлайны:</strong> темы, по которым скоро закроется доступ.</li>
                <li><strong>История:</strong> последние завершенные тесты и быстрый переход к деталям.</li>
                <li><strong>Прогресс тем:</strong> где результат стабильный, а где нужно повторение.</li>
              </ul>
            </CollapsibleSection>

            <CollapsibleSection id="activity" title="12. Активность" icon={<Activity className="w-5 h-5" />}>
              <p>
                Раздел активности помогает восстановить последовательность событий: когда вы начали тест, завершили попытку,
                получили комментарий, оценку или уведомление.
              </p>
              <p>
                Используйте фильтры по периоду, если нужно найти конкретное событие для разговора с преподавателем или проверки
                собственной истории действий.
              </p>
            </CollapsibleSection>

            <CollapsibleSection id="notifications" title="13. Уведомления" icon={<Bell className="w-5 h-5" />}>
              <p>
                Уведомления помогают не пропустить новые тесты, дедлайны, оценки и комментарии. Значок в шапке показывает количество
                непрочитанных сообщений.
              </p>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Фильтры уведомлений</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li><strong>Непрочитанные:</strong> все события, которые вы еще не открывали.</li>
                <li><strong>Тесты:</strong> новые доступные тесты.</li>
                <li><strong>Дедлайны:</strong> приближающиеся сроки.</li>
                <li><strong>Оценки:</strong> завершение проверки и изменение результата.</li>
                <li><strong>Комментарии:</strong> новые замечания преподавателя.</li>
              </ul>
            </CollapsibleSection>

            <CollapsibleSection id="profile" title="14. Профиль" icon={<User className="w-5 h-5" />}>
              <p>
                В профиле отображаются ваши основные данные, email, группа, фото профиля, смена пароля и список активных
                сеансов. Если ФИО, email или группа указаны неверно, обратитесь к преподавателю или администратору.
              </p>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-4">Фото профиля</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Можно загрузить изображение JPG, PNG или WebP размером до 5 МБ.</li>
                <li>Перед сохранением показывается предпросмотр; после загрузки изображение обрезается в квадрат 256x256 пикселей.</li>
                <li>Предыдущие аватары остаются в истории: их можно снова выбрать или удалить, если они больше не нужны.</li>
              </ul>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-5">Активные сеансы</h3>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Блок «Активные сеансы» показывает текущее устройство, тип клиента, примерное местоположение, IP и время последней активности.</li>
                <li>Для веб-входа отображается информация о браузере, для desktop-приложения - данные клиента Tauri и ОС, если они доступны.</li>
                <li>Чужой или забытый сеанс можно завершить отдельной кнопкой после подтверждения.</li>
                <li>Кнопка «Завершить все другие» оставляет текущий вход активным и отключает остальные устройства.</li>
                <li>При смене пароля можно сразу выйти из аккаунта на других устройствах.</li>
              </ul>
              <p>
                Если вы работаете на чужом компьютере, после завершения обязательно выйдите из системы.
              </p>
            </CollapsibleSection>

            <CollapsibleSection id="issues" title="15. Типовые проблемы и решения" icon={<HelpCircle className="w-5 h-5" />}>
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Не вижу дисциплину или тему</h3>
                  <ol className="list-decimal pl-5 mt-2 space-y-1.5">
                    <li>Проверьте, что вы вошли под правильным аккаунтом.</li>
                    <li>Проверьте профиль и группу.</li>
                    <li>Уточните у преподавателя, назначена ли дисциплина вашей группе.</li>
                    <li>Если тема есть, но тест недоступен, откройте карточку темы и прочитайте причину.</li>
                  </ol>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Пропал интернет во время теста</h3>
                  <ol className="list-decimal pl-5 mt-2 space-y-1.5">
                    <li>Не закрывайте вкладку, если видите ошибку сохранения.</li>
                    <li>Восстановите соединение и дождитесь повторной отправки ответов.</li>
                    <li>Если страница закрылась, снова войдите и продолжите активную попытку.</li>
                    <li>Помните, что таймер продолжает идти.</li>
                  </ol>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Файл не загружается</h3>
                  <ol className="list-decimal pl-5 mt-2 space-y-1.5">
                    <li>Проверьте размер файла и ограничение в вопросе.</li>
                    <li>Проверьте расширение файла.</li>
                    <li>Переименуйте файл без специальных символов, если загрузка продолжает падать.</li>
                    <li>Если формат не поддерживается, сохраните работу в разрешенном формате или архиве.</li>
                  </ol>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Оценка не появилась сразу</h3>
                  <ol className="list-decimal pl-5 mt-2 space-y-1.5">
                    <li>Проверьте, были ли в тесте файловые вопросы.</li>
                    <li>Дождитесь ручной проверки преподавателя.</li>
                    <li>Откройте карточку попытки позже: статус файловых ответов обновится после проверки.</li>
                  </ol>
                </div>
              </div>
              <div className="p-4 rounded-lg bg-slate-900/20 border border-[var(--color-border)] text-xs mt-4 flex items-start gap-2.5">
                <RefreshCw className="w-5 h-5 shrink-0 text-[var(--color-accent)]" />
                <div>
                  При любой спорной ситуации сначала зафиксируйте номер попытки, дисциплину, тему и время события. Так преподавателю
                  будет проще найти запись в журнале.
                </div>
              </div>
            </CollapsibleSection>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
