import { Route, Routes, Navigate, useNavigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { lazy, Suspense, useState, useEffect, useRef } from "react";
import { useAuth } from "./store/auth";
import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "./components/ui/Button";
import { isTauri, tauriCommands, tauriEvents, parseStsDeepLink } from "./lib/tauri";
import { useToasts } from "./components/ui/Toast";

const Login = lazy(() => import("./pages/auth/Login"));
const ResetRequest = lazy(() => import("./pages/auth/ResetRequest"));
const StudentHome = lazy(() => import("./pages/student/StudentHome"));
const TestRunner = lazy(() => import("./pages/student/TestRunner"));
const Results = lazy(() => import("./pages/student/Results"));
const StudentDashboard = lazy(() => import("./pages/student/StudentDashboard"));
const StudentTopicDetail = lazy(() => import("./pages/student/StudentTopicDetail"));
const StudentSessionDetail = lazy(() => import("./pages/student/StudentSessionDetail"));
const StudentNotifications = lazy(() => import("./pages/student/StudentNotifications"));
const StudentActivity = lazy(() => import("./pages/student/StudentActivity"));
const StudentProfile = lazy(() => import("./pages/student/StudentProfile"));
const StudentDocs = lazy(() => import("./pages/student/Docs"));
const GroupGradebook = lazy(() => import("./pages/teacher/GroupGradebook"));
const StudentDetail = lazy(() => import("./pages/teacher/StudentDetail"));
const Dashboard = lazy(() => import("./pages/teacher/Dashboard"));
const DisciplineDiagnostics = lazy(() => import("./pages/teacher/DisciplineDiagnostics"));
const TopicAnalytics = lazy(() => import("./pages/teacher/TopicAnalytics"));
const Questions = lazy(() => import("./pages/teacher/QuestionBank"));
const TestEditor = lazy(() => import("./pages/teacher/TestEditor"));
const NotificationsPage = lazy(() => import("./pages/teacher/Notifications"));
const TeacherProfile = lazy(() => import("./pages/teacher/TeacherProfile"));
const TeacherAudit = lazy(() => import("./pages/teacher/TeacherAudit"));
const Reference = lazy(() => import("./pages/teacher/Reference"));
const ReferenceDisciplines = lazy(() => import("./pages/teacher/ReferenceDisciplines"));
const ReferenceGroups = lazy(() => import("./pages/teacher/ReferenceGroups"));
const ReferenceStudents = lazy(() => import("./pages/teacher/ReferenceStudents"));
const ReferenceTags = lazy(() => import("./pages/teacher/ReferenceTags"));
const ReferenceGroupDetail = lazy(() => import("./pages/teacher/ReferenceGroupDetail"));
const TeacherDocs = lazy(() => import("./pages/teacher/Docs"));
const AiQuestionReview = lazy(() => import("./pages/teacher/AiQuestionReview"));
const PendingFileReviews = lazy(() => import("./pages/teacher/PendingFileReviews"));
const SessionFileReview = lazy(() => import("./pages/teacher/SessionFileReview"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminGroups = lazy(() => import("./pages/admin/Groups"));
const AdminDisciplines = lazy(() => import("./pages/admin/Disciplines"));
const AdminAssignmentsMatrix = lazy(() => import("./pages/admin/AssignmentsMatrix"));
const AdminStructureImportExport = lazy(() => import("./pages/admin/StructureImportExport"));
const AdminEvents = lazy(() => import("./pages/admin/Events"));
const AdminAudit = lazy(() => import("./pages/admin/Audit"));
const AdminSessions = lazy(() => import("./pages/admin/Sessions"));
const AdminHealth = lazy(() => import("./pages/admin/Health"));
const AdminDocs = lazy(() => import("./pages/admin/Docs"));
const BrandingSettings = lazy(() => import("./pages/admin/BrandingSettings"));
const AdminProfile = lazy(() => import("./pages/common/Profile"));
const SettingsDesktop = lazy(() => import("./pages/settings/Desktop"));
const AiAssistant = lazy(() => import("./pages/ai/AiAssistant"));
const NotFound = lazy(() => import("./pages/NotFound"));

function RouteFallback() {
  return (
    <div className="min-h-[100vh] grid place-items-center bg-[var(--color-bg)] text-[var(--color-text-muted)]">
      <RefreshCw className="w-5 h-5 animate-spin" />
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const pushToast = useToasts((s) => s.push);
  const backendError = useAuth((s) => s.backendError);
  const backendErrorDetail = useAuth((s) => s.backendErrorDetail);
  const hydrate = useAuth((s) => s.hydrate);
  const resetBackendError = useAuth((s) => s.resetBackendError);
  const [retrying, setRetrying] = useState(false);

  const navigateRef = useRef(navigate);
  const pushToastRef = useRef(pushToast);

  useEffect(() => {
    navigateRef.current = navigate;
    pushToastRef.current = pushToast;
  });

  useEffect(() => {
    if (!isTauri()) return;

    let active = true;
    const cleanups: (() => void)[] = [];

    // Check for updates on startup
    const checkUpdates = async () => {
      try {
        const status = await tauriCommands.updateStatus();
        if (status.available && active) {
          pushToastRef.current({
            tone: "info",
            title: "Доступно обновление",
            body: `Доступна новая версия ${status.version}.`,
            action: {
              label: "Обновить",
              onClick: async () => {
                try {
                  await tauriCommands.triggerUpdate();
                } catch (e: any) {
                  pushToastRef.current("error", `Ошибка обновления: ${e.message || e}`);
                }
              }
            }
          });
        }
      } catch (err) {
        console.error("Failed to check for updates on startup", err);
      }
    };

    checkUpdates();

    // Listen to deep-link events
    tauriEvents.onDeepLink((urls) => {
      for (const url of urls) {
        const parsed = parseStsDeepLink(url);
        if (!parsed) continue;

        const { route, id } = parsed;
        const user = useAuth.getState().user;

        if (route === "test") {
          if (id) {
            navigateRef.current(`/student/test/${id}`);
          }
        } else if (route === "results") {
          if (id) {
            navigateRef.current(`/student/results/${id}`);
          }
        } else if (route === "notification" || route === "notifications") {
          const target = user?.role === "teacher" ? "/teacher/notifications" : "/student/notifications";
          navigateRef.current(target);
        } else {
          const path = id ? `/${route}/${id}` : `/${route}`;
          navigateRef.current(path);
        }
      }
    }).then((unsub) => {
      if (active) cleanups.push(unsub);
      else unsub();
    });

    // Listen to tray actions
    tauriEvents.onTrayAction((action) => {
      if (action === "notifications") {
        const user = useAuth.getState().user;
        const target = user?.role === "teacher" ? "/teacher/notifications" : "/student/notifications";
        navigateRef.current(target);
      }
    }).then((unsub) => {
      if (active) cleanups.push(unsub);
      else unsub();
    });

    // Listen to installed updates
    tauriEvents.onUpdateInstalled((version) => {
      pushToastRef.current({
        tone: "success",
        title: "Обновление установлено",
        body: `Успешно установлено обновление до версии ${version}. Перезапустите приложение.`,
      });
    }).then((unsub) => {
      if (active) cleanups.push(unsub);
      else unsub();
    });

    return () => {
      active = false;
      cleanups.forEach((unsub) => unsub());
    };
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    resetBackendError();
    await hydrate();
    setRetrying(false);
  };

  if (backendError) {
    return (
      <div className="min-h-[100vh] w-full grid place-items-center p-6 bg-[var(--color-bg)] text-[var(--color-text-primary)]" style={{ minHeight: "100svh" }}>
        <div className="max-w-[480px] w-full bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-2xl shadow-xl p-8 text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-950/30 text-red-500 dark:text-red-400 flex items-center justify-center mb-5 animate-pulse">
            <WifiOff className="w-8 h-8" strokeWidth={1.5} />
          </div>
          
          <h1 className="text-xl font-bold tracking-tight mb-2">Сервер недоступен</h1>
          <p className="text-sm text-[var(--color-text-muted)] mb-6 leading-relaxed">
            Не удалось подключиться к серверу Верифика. Пожалуйста, проверьте подключение к сети или запустите сервер.
          </p>

          {backendErrorDetail && (
            <div className="w-full text-left bg-neutral-50 dark:bg-neutral-900 border border-[var(--color-border)] rounded-lg p-3.5 mb-6">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-muted)] block mb-1">Детали ошибки</span>
              <code className="text-xs text-red-600 dark:text-red-400 font-mono break-all leading-normal">
                {backendErrorDetail}
              </code>
            </div>
          )}

          <Button
            onClick={handleRetry}
            variant="primary"
            size="lg"
            loading={retrying}
            className="w-full"
            iconLeft={<RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />}
          >
            {retrying ? "Подключение..." : "Повторить попытку"}
          </Button>
        </div>
      </div>
    );
  }

  const ReferenceWrapper = ({ children }: { children: React.ReactNode }) => (
    <ProtectedRoute role="teacher">{children}</ProtectedRoute>
  );
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route path="/reset" element={<ResetRequest />} />
      <Route
        path="/student"
        element={
          <ProtectedRoute role="student">
            <StudentHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/dashboard"
        element={
          <ProtectedRoute role="student">
            <StudentDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/topics/:topicId"
        element={
          <ProtectedRoute role="student">
            <StudentTopicDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/test/:sessionId"
        element={
          <ProtectedRoute anyOf={["student", "teacher"]}>
            <TestRunner />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/results"
        element={
          <ProtectedRoute role="student">
            <Results />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/results/:sessionId"
        element={
          <ProtectedRoute anyOf={["student", "teacher"]}>
            <StudentSessionDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/notifications"
        element={
          <ProtectedRoute role="student">
            <StudentNotifications />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/activity"
        element={
          <ProtectedRoute role="student">
            <StudentActivity />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/profile"
        element={
          <ProtectedRoute role="student">
            <StudentProfile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/docs"
        element={
          <ProtectedRoute role="student">
            <StudentDocs />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher"
        element={
          <ProtectedRoute role="teacher">
            <Navigate to="/teacher/reference/disciplines" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/dashboard"
        element={
          <ProtectedRoute role="teacher">
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/diagnostics"
        element={
          <ProtectedRoute role="teacher">
            <DisciplineDiagnostics />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/topic-analytics"
        element={
          <ProtectedRoute role="teacher">
            <TopicAnalytics />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/docs"
        element={
          <ProtectedRoute role="teacher">
            <TeacherDocs />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/bank"
        element={
          <ProtectedRoute role="teacher">
            <Questions />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/ai-review"
        element={
          <ProtectedRoute role="teacher">
            <AiQuestionReview />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/policy/:disciplineId"
        element={
          <ProtectedRoute role="teacher">
            <TestEditor />
          </ProtectedRoute>
        }
      />
      {/* Legacy groups routes → редирект в Справочники. */}
      <Route path="/teacher/groups" element={<Navigate to="/teacher/reference/groups" replace />} />
      <Route path="/teacher/groups/:groupId/students" element={<LegacyGroupStudentsRedirect />} />
      <Route
        path="/teacher/groups/:groupId/gradebook"
        element={
          <ProtectedRoute role="teacher">
            <GroupGradebook />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/notifications"
        element={
          <ProtectedRoute role="teacher">
            <NotificationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/profile"
        element={
          <ProtectedRoute role="teacher">
            <TeacherProfile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/audit"
        element={
          <ProtectedRoute role="teacher">
            <TeacherAudit />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/students/:studentId"
        element={
          <ProtectedRoute role="teacher">
            <StudentDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/pending-file-reviews"
        element={
          <ProtectedRoute role="teacher">
            <PendingFileReviews />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/sessions/:sessionId/file-review"
        element={
          <ProtectedRoute role="teacher">
            <SessionFileReview />
          </ProtectedRoute>
        }
      />
      {/* Admin routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute role="admin">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute role="admin">
            <AdminUsers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/groups"
        element={
          <ProtectedRoute role="admin">
            <AdminGroups />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/disciplines"
        element={
          <ProtectedRoute role="admin">
            <AdminDisciplines />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/assignments"
        element={
          <ProtectedRoute role="admin">
            <AdminAssignmentsMatrix />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/structure"
        element={
          <ProtectedRoute role="admin">
            <AdminStructureImportExport />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/events"
        element={
          <ProtectedRoute role="admin">
            <AdminEvents />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/audit"
        element={
          <ProtectedRoute role="admin">
            <AdminAudit />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/sessions"
        element={
          <ProtectedRoute role="admin">
            <AdminSessions />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/health"
        element={
          <ProtectedRoute role="admin">
            <AdminHealth />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/profile"
        element={
          <ProtectedRoute role="admin">
            <AdminProfile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/docs"
        element={
          <ProtectedRoute role="admin">
            <AdminDocs />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/branding"
        element={
          <ProtectedRoute role="admin">
            <BrandingSettings />
          </ProtectedRoute>
        }
      />
      {/* Desktop settings — available to every role, including guest.
          In the web build, this page degrades gracefully (most controls
          are disabled and a banner is shown at the top). */}
      <Route
        path="/settings/desktop"
        element={<SettingsDesktop />}
      />
      <Route
        path="/ai"
        element={
          <ProtectedRoute anyOf={["student", "teacher", "admin"]}>
            <AiAssistant />
          </ProtectedRoute>
        }
      />
      {/* Новый раздел «Справочники». */}
      <Route
        path="/teacher/reference"
        element={
          <ProtectedRoute role="teacher">
            <Reference />
          </ProtectedRoute>
        }
      >
        <Route index element={<ReferenceDisciplines />} />
        <Route path="disciplines" element={<ReferenceDisciplines />} />
        <Route path="groups" element={<ReferenceGroups />} />
        <Route path="students" element={<ReferenceStudents />} />
        <Route path="tags" element={<ReferenceTags />} />
      </Route>
      <Route
        path="/teacher/reference/groups/:groupId"
        element={
          <ProtectedRoute role="teacher">
            <ReferenceGroupDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/reference/students/:studentId"
        element={
          <ProtectedRoute role="teacher">
            <StudentDetail />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
      {/* Helper unused-aliases guard */}
      <>{ReferenceWrapper}</>
      </Routes>
    </Suspense>
  );
}

function LegacyGroupStudentsRedirect() {
  const params = (window.location.pathname.match(/\/groups\/(\d+)\/students/) || [])[1];
  const to = params ? `/teacher/reference/groups/${params}` : "/teacher/reference";
  return <Navigate to={to} replace />;
}
