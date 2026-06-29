export type Role = "student" | "teacher" | "admin";

export interface UserOut {
  id: number;
  full_name: string;
  role: Role;
  email: string;
  group_id: number | null;
  login?: string | null;
  avatar_url?: string | null;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  auth_session_id?: string | null;
  user: UserOut;
}

export interface DisciplineWithTest {
  discipline_id: number;
  discipline_name: string;
  description: string | null;
  image_url?: string | null;
  test_mode?: "discipline" | "topic";
  question_count: number;
  time_limit_minutes: number;
  topics_count?: number;
  available_topic_tests_count?: number;
  enabled_topic_tests_count?: number;
  general_test_available?: boolean;
  has_active_session: boolean;
  active_session_id: number | null;
  completed_topic_tests_count?: number;
  average_score_percent?: number | null;
  attempts_left?: number | null;
  available_from?: string | null;
  available_until?: string | null;
}

export interface StudentDisciplinesOut {
  disciplines: DisciplineWithTest[];
}

export interface TestStartOption {
  option_id: number;
  option_number: number;
  option_text: string;
  match_left?: string | null;
  match_right?: string | null;
}

export interface TestStartQuestion {
  question_id: number;
  question_text: string;
  image_url?: string | null;
  options: TestStartOption[];
  points?: number;
  qtype?: QuestionType;
  qmeta?: {
    qtype: QuestionType;
    short_pattern?: string | null;
    numeric_tolerance?: number | null;
    match_pairs?: Array<{ left: string; right: string }>;
    acceptable_answers?: string[];
    correct_bool?: boolean | null;
    explanation?: string | null;
    case_sensitive?: boolean;
    trim_whitespace?: boolean;
    normalize_universal?: boolean;
    text_mode?: "string" | "number";
    allow_partial?: boolean;
    cloze_blanks?: Array<{
      index: number;
      kind: "select" | "input";
      options: string[] | null;
      correct_index: number | null;
      acceptable_answers: string[] | null;
      case_sensitive: boolean;
      trim_whitespace: boolean;
      normalize_universal: boolean;
    }>;
    file_allowed_types?: string[] | null;
    file_max_size_bytes?: number | null;
    file_max_count?: number | null;
    options_meta?: Array<{
      option_id: number;
      text: string;
      is_correct: boolean;
      match_left: string | null;
      match_right: string | null;
      correct_position: number | null;
    }>;
  } | null;
}

export interface TopicTestMetadata {
  discipline_title: string;
  topic_title: string;
  max_attempts: number;
  current_attempt: number;
  time_limit_minutes: number | null;
  passing_score_percent: number | null;
  show_question_points: boolean;
  grading_method: "best" | "last" | "average" | "first";
  shuffle_questions: boolean;
  grade_scale: string;
}

export interface TestStartOut {
  session_id: number;
  started_at: string;
  time_limit_minutes: number;
  expires_at: string;
  questions: TestStartQuestion[];
  topic_metadata?: TopicTestMetadata | null;
}

export interface SessionSummary {
  id: number;
  attempt_number: number;
  started_at: string | null;
  finished_at: string | null;
  score: number | null;
  max_score: number | null;
  percent: number | null;
  status: string;
  duration_seconds: number | null;
  is_best: boolean;
}

export interface TopicGradeResponse {
  topic_id: number;
  topic_title: string;
  discipline_title: string;
  grading_method: string;
  final_grade_percent: number | null;
  final_grade_score: number | null;
  max_score: number | null;
  is_passed: boolean | null;
  passing_score_percent: number | null;
  attempts_used: number;
  max_attempts: number;
  attempts_remaining: number | null;
  next_attempt_available_at: string | null;
  sessions: SessionSummary[];
  grade_scale: string;
}

export interface AnswerIn {
  question_id: number;
  chosen_option_id?: number | null;
  chosen_option_ids?: number[];
  short_answer?: string;
  numeric_answer?: number;
  match_answer?: Array<{ left: string; right: string }> | number[];
  text_answer?: string;
  order_answer?: number[];
  bool_answer?: boolean | null;
  cloze_answer?: Record<string, string> | null;
}

export interface AnswerSubmitBatch {
  answers: AnswerIn[];
}

export interface FinishOut {
  session_id: number;
  score: number;
  max_score: number;
  started_at: string;
  completed_at: string;
  status: string;
}

export interface SessionListItem {
  session_id: number;
  discipline_id: number;
  discipline_name: string;
  started_at: string;
  completed_at: string | null;
  score: number;
  max_score: number;
  status: string;
  topic_id?: number | null;
  topic_name?: string | null;
}

export interface SessionHistoryOut {
  sessions: SessionListItem[];
}

export interface TeacherDisciplineRow {
  discipline_id: number;
  name: string;
  description: string | null;
  time_limit_minutes: number;
  question_count: number;
}

export interface TeacherDisciplinesOut {
  disciplines: TeacherDisciplineRow[];
}

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface DiagnosticProblem {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  scope: "discipline" | "students" | "questions" | "test" | "topic";
  topic_id?: number | null;
}

export interface DiagnosticTopic {
  topic_id: number;
  name: string;
  questions_count: number;
  archived_questions_count: number;
  test_configured: boolean;
  test_enabled: boolean;
  test_question_count: number | null;
  time_limit_minutes: number | null;
  available_from: string | null;
  available_until: string | null;
  status: "available" | "scheduled" | "closed" | "blocked" | "disabled" | "not_configured";
  problems: DiagnosticProblem[];
}

export interface DisciplineDiagnostics {
  discipline_id: number;
  name: string;
  description: string | null;
  test_mode: "discipline" | "topic";
  active_questions_count: number;
  untopiced_questions_count: number;
  archived_questions_count: number;
  topics_count: number;
  enabled_topic_tests_count: number;
  assigned_groups_count: number;
  individually_assigned_students_count: number;
  assigned_students_count: number;
  general_question_count: number;
  general_time_limit_minutes: number;
  general_test_available: boolean;
  topics: DiagnosticTopic[];
  problems: DiagnosticProblem[];
}

export interface TeacherDiagnosticsOut {
  generated_at: string;
  disciplines: DisciplineDiagnostics[];
}

export interface OptionIn {
  option_number: number;
  text: string;
  is_correct: boolean;
}

export interface QuestionWithOptions {
  question_id: number;
  discipline_id: number;
  text: string;
  difficulty: number;
  options: OptionIn[];
}

export interface QuestionIn {
  discipline_id: number;
  text: string;
  difficulty: number;
  options: OptionIn[];
}

export interface GroupOut {
  group_id: number;
  name: string;
  student_count: number;
}

export interface GroupStudentRow {
  student_id: number;
  full_name: string;
  email: string;
  average_score: number | null;
  sessions_count: number;
}

export interface GroupStudentsOut {
  group_id: number;
  group_name: string;
  students: GroupStudentRow[];
}

export interface StudentAnswerDetail {
  question_id: number;
  question_text: string;
  chosen_option_text: string;
  is_answer_correct: boolean;
  comment?: string | null;
}

export interface StudentDetailSession {
  session_id: number;
  started_at: string;
  completed_at: string | null;
  score: number;
  max_score: number;
  status: string;
  answers: StudentAnswerDetail[];
  score_overridden?: boolean;
  override_reason?: string | null;
  topic_id?: number | null;
  topic_name?: string | null;
  comment?: string | null;
}

export interface StudentDetailDiscipline {
  discipline_id: number;
  discipline_name: string;
  sessions: StudentDetailSession[];
}

export interface StudentDetailOut {
  student_id: number;
  full_name: string;
  email: string;
  group_name: string | null;
  disciplines: StudentDetailDiscipline[];
}

export interface ResumeOut {
  session_id: number;
  started_at: string;
  time_limit_minutes: number;
  expires_at: string;
  questions: TestStartQuestion[];
  saved_answers: Record<string, number>;
  saved_extras: Record<string, {
    short?: string;
    numeric?: string;
    match?: Array<{ left: string; right: string }> | number[];
    files?: Array<{ upload_id: number; original_name: string; size_bytes: number; uploaded_at: string }>;
  }>;
  proctor_min_level?: number;
  topic_metadata?: TopicTestMetadata | null;
}


export interface SessionDetailAnswer {
  question_text: string;
  chosen_option_text: string;
  is_answer_correct: boolean;
  chosen_option_number: number;
}

export interface SessionDetailOut {
  session_id: number;
  discipline_id: number;
  started_at: string;
  completed_at: string | null;
  score: number;
  max_score: number;
  status: string;
  answers: SessionDetailAnswer[];
  show_correctness: boolean;
}

export type QuestionType = "single" | "multi" | "short" | "numeric" | "match" | "text" | "order" | "bool" | "cloze" | "file_upload";

export interface OptionIn {
  option_number: number;
  text: string;
  is_correct: boolean;
  match_left?: string | null;
  match_right?: string | null;
  correct_position?: number | null; // for qtype='order'
}

export interface ClozeBlankIn {
  index: number;
  kind: "select" | "input";
  options: string[] | null;
  correct_index: number | null;
  acceptable_answers: string[] | null;
  case_sensitive: boolean;
  trim_whitespace: boolean;
  normalize_universal: boolean;
}

export interface QuestionPayload {
  discipline_id: number;
  topic_id?: number | null;
  text: string;
  difficulty: number;
  qtype: QuestionType;
  options: OptionIn[];
  tag_ids: number[];
  short_pattern?: string | null;
  numeric_tolerance?: number | null;
  match_pairs?: Array<{ left: string; right: string }> | null;
  acceptable_answers?: string[] | null;
  correct_bool?: boolean | null;
  explanation?: string | null;
  case_sensitive?: boolean | null;
  trim_whitespace?: boolean | null;
  normalize_universal?: boolean | null;
  text_mode?: "string" | "number" | null;
  allow_partial?: boolean | null;
  cloze_blanks?: ClozeBlankIn[] | null;
  file_allowed_types?: string[] | null;
  file_max_size_bytes?: number | null;
  file_max_count?: number | null;
}

export interface QuestionImageOut {
  image_id: number;
  question_id: number;
  url: string;
  content_type: string;
  size_bytes: number;
  width_px: number | null;
  height_px: number | null;
  original_name: string | null;
}

export interface ClozeBlankOut {
  index: number;
  kind: "select" | "input";
  options: string[] | null;
  correct_index: number | null;
  acceptable_answers: string[] | null;
  case_sensitive: boolean;
  trim_whitespace: boolean;
  normalize_universal: boolean;
}

export interface QuestionWithType {
  question_id: number;
  discipline_id: number;
  topic_id: number | null;
  topic_name: string | null;
  text: string;
  difficulty: number;
  qtype: QuestionType;
  options: OptionIn[];
  tags: string[];
  short_pattern: string | null;
  numeric_tolerance: number | null;
  match_pairs: Array<{ left: string; right: string }>;
  image: QuestionImageOut | null;
  acceptable_answers: string[];
  correct_bool: boolean | null;
  explanation: string | null;
  case_sensitive: boolean;
  trim_whitespace: boolean;
  normalize_universal: boolean;
  created_at?: string | null;
  archived_at?: string | null;
  text_mode: string;
  allow_partial: boolean;
  cloze_blanks: ClozeBlankOut[];
  ai_status?: string | null;
  ai_model_used?: string | null;
  ai_reviewed_by?: number | null;
  ai_reviewed_at?: string | null;
  ai_generated_at?: string | null;
  file_allowed_types?: string[] | null;
  file_max_size_bytes?: number | null;
  file_max_count?: number | null;
}

export type QuestionQualityIssueCode =
  | "missing_correct_answer"
  | "duplicate_text"
  | "short_text"
  | "invalid_options";

export type QuestionQualitySeverity = "error" | "warning";

export interface QuestionQualityIssueOut {
  code: QuestionQualityIssueCode | string;
  severity: QuestionQualitySeverity | string;
  field: string | null;
  message: string;
  duplicate_with: number[];
}

export interface QuestionQualityItemOut {
  question_id: number;
  discipline_id: number;
  discipline_name: string;
  topic_id: number | null;
  topic_name: string | null;
  qtype: QuestionType;
  text: string;
  archived: boolean;
  issues: QuestionQualityIssueOut[];
}

export interface QuestionQualitySummaryOut {
  total_questions: number;
  checked_questions: number;
  questions_with_issues: number;
  issue_counts: Record<string, number>;
  severity_counts: Record<string, number>;
  duplicate_groups: number;
}

export interface QuestionQualityReportOut {
  summary: QuestionQualitySummaryOut;
  questions: QuestionQualityItemOut[];
}

export interface AssetImageOut {
  image_id: number;
  url: string;
  content_type: string;
  size_bytes: number;
  width_px: number | null;
  height_px: number | null;
  original_name: string | null;
}

export interface QuestionBankDisciplineOut {
  discipline_id: number;
  name: string;
  description: string | null;
  image: AssetImageOut | null;
  topics_count: number;
  questions_count: number;
  untopiced_questions_count: number;
  enabled_topic_tests_count: number;
}

export interface DisciplineTopicOut {
  topic_id: number;
  discipline_id: number;
  name: string;
  description: string | null;
  sort_order: number;
  image: AssetImageOut | null;
  questions_count: number;
  test: {
    is_enabled: boolean;
    question_count: number;
    time_limit_minutes: number;
    available_from: string | null;
    available_until: string | null;
    grade_scale: string;
  } | null;
  archived: boolean;
}

export interface TopicTestDto {
  teacher_id?: number;
  topic_id?: number;
  is_enabled: boolean;
  question_count: number;
  time_limit_minutes: number;
  attempts_allowed: number;
  available_from: string | null;
  available_until: string | null;
  shuffle_seed: boolean;
  show_correct_after_finish: boolean;
  passing_score_percent?: number | null;
  grading_method?: "best" | "last" | "average" | "first";
  show_question_points?: boolean;
  attempt_delay_minutes?: number | null;
  grade_scale: string;
  updated_at?: string | null;
}

export interface StudentTopicOut {
  topic_id: number;
  discipline_id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  question_count: number;
  time_limit_minutes: number;
  has_active_session: boolean;
  active_session_id: number | null;
  attempts_left: number;
  available: boolean;
  unavailable_reason: string | null;
  available_from?: string | null;
  available_until?: string | null;
  attempts_allowed?: number;
  last_score?: number | null;
  best_score?: number | null;
  completed_sessions_count?: number;
}

export interface StudentTopicsOut {
  topics: StudentTopicOut[];
}

export interface TagOut { tag_id: number; name: string }

export interface PolicyDto {
  teacher_id: number;
  discipline_id: number;
  available_from: string | null;
  available_until: string | null;
  attempts_allowed: number;
  shuffle_seed: boolean;
  show_correct_after_finish: boolean;
  allow_study: boolean;
  proctor_min_level: number;
  updated_at?: string | null;
}

export interface DashboardPoint {
  date: string; avg_score: number; attempts_count: number;
}
export interface DashboardItemStat {
  question_id: number; question_text: string; correct_pct: number;
  median_time_sec: number | null;
}
export interface DashboardOut {
  series: DashboardPoint[];
  items: DashboardItemStat[];
  avg_overall: number;
  attempts_total: number;
}

export interface TopicAnalyticsBrief {
  topic_id: number;
  topic_name: string;
  discipline_id: number;
  discipline_name: string;
  attempts_total: number;
  students_total: number;
  avg_score_percent: number | null;
  last_attempt_at: string | null;
}

export interface TopicAnalyticsOut {
  summary: {
    topic_id: number;
    topic_name: string;
    discipline_id: number;
    discipline_name: string;
    attempts_total: number;
    students_total: number;
    avg_score_percent: number | null;
    median_score_percent: number | null;
    pass_rate_percent: number | null;
    min_score_percent: number | null;
    max_score_percent: number | null;
    passing_score_percent: number | null;
    last_attempt_at: string | null;
  };
  distribution: Array<{
    label: string;
    min_percent: number;
    max_percent: number;
    count: number;
  }>;
  trend: Array<{
    date: string;
    attempts_count: number;
    avg_score_percent: number | null;
  }>;
  groups: Array<{
    group_id: number | null;
    group_name: string;
    attempts_count: number;
    students_count: number;
    avg_score_percent: number | null;
    pass_rate_percent: number | null;
    last_attempt_at: string | null;
  }>;
  difficult_questions: Array<{
    question_id: number;
    question_text: string;
    qtype: string;
    attempts_count: number;
    correct_percent: number | null;
    wrong_count: number;
  }>;
}

export interface NotificationOut {
  notification_id: number;
  user_role: string;
  user_id: number;
  event_type: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export interface StudentDashboardOut {
  student: {
    student_id: number;
    full_name: string;
    group_name: string | null;
    role: "student";
  };
  stats: {
    disciplines_count: number;
    completed_sessions_count: number;
    active_sessions_count: number;
    average_score_percent: number | null;
  };
  active_sessions: Array<{
    session_id: number;
    discipline_name: string;
    topic_name: string | null;
    started_at: string;
    expires_at: string;
    answered_count: number;
    total_count: number;
  }>;
  upcoming_deadlines: Array<{
    topic_id: number;
    topic_name: string;
    discipline_name: string;
    available_until: string;
    attempts_left: number;
  }>;
  topic_progress: Array<{
    discipline_id: number;
    discipline_name: string;
    topics_total: number;
    topics_completed: number;
    available_topic_tests_count: number;
    average_score_percent: number | null;
    next_topic_id: number | null;
    next_topic_name: string | null;
    next_topic_attempts_left: number | null;
    test_mode: "discipline" | "topic";
  }>;
  recent_history: Array<{
    session_id: number;
    discipline_name: string;
    topic_name: string | null;
    score: number;
    max_score: number;
    completed_at: string | null;
    status: string;
  }>;
  unread_notifications_count: number;
}

export interface StudentActivityItemOut {
  id: string;
  source: "audit" | "notification" | "session";
  category: string;
  type: string;
  title: string;
  body: string | null;
  created_at: string;
  target_type: string | null;
  target_id: number | null;
  session_id: number | null;
  discipline_id: number | null;
  topic_id: number | null;
  ip_addr: string | null;
  is_read: boolean | null;
  severity: number;
  details: Record<string, unknown>;
}

export interface StudentActivityOut {
  items: StudentActivityItemOut[];
  total: number;
  limit: number;
  offset: number;
  audit_count: number;
  notification_count: number;
  session_count: number;
}

export interface StudentTopicDetailOut {
  topic_id: number;
  discipline_id: number;
  discipline_name: string;
  name: string;
  description: string | null;
  image_url: string | null;
  question_count: number;
  actual_questions_count: number;
  time_limit_minutes: number;
  attempts_allowed: number;
  attempts_left: number;
  available: boolean;
  unavailable_reason: string | null;
  available_from: string | null;
  available_until: string | null;
  has_active_session: boolean;
  active_session_id: number | null;
  study_questions: Array<{
    question_id: number;
    question_text: string;
    qtype: QuestionType;
    image_url: string | null;
    options: TestStartOption[];
    qmeta: Record<string, unknown> | null;
  }>;
  history: Array<{
    session_id: number;
    score: number;
    max_score: number;
    completed_at: string | null;
    status: string;
    attempt_number?: number | null;
    started_at?: string | null;
    percent?: number | null;
    duration_seconds?: number | null;
    is_best?: boolean;
  }>;
  passing_score_percent?: number | null;
  grading_method?: "best" | "last" | "average" | "first";
  show_question_points?: boolean;
  show_correct_after_finish?: boolean;
  attempt_delay_minutes?: number | null;
  next_attempt_available_at?: string | null;
  shuffle_questions?: boolean;
  best_percent?: number | null;
  last_percent?: number | null;
  average_percent?: number | null;
  is_passed?: boolean | null;
  grade_scale?: string;
  allow_study?: boolean;
}

export interface StudentSessionDetailOut {
  session_id: number;
  discipline_id: number;
  discipline_name: string;
  topic_id: number | null;
  topic_name: string | null;
  started_at: string;
  completed_at: string | null;
  score: number;
  max_score: number;
  percent: number | null;
  attempt_number: number | null;
  status: string;
  show_correctness: boolean;
  passing_score_percent: number | null;
  is_passed: boolean | null;
  duration_seconds: number | null;
  grade_scale: string;
  answers: Array<{
    question_id: number;
    question_text: string;
    question_type: QuestionType;
    question_image_url: string | null;
    student_answer: string | null;
    student_answer_render: Record<string, unknown> | null;
    correct_answer: string | null;
    correct_answer_render: Record<string, unknown> | null;
    is_correct: boolean | null;
    explanation: string | null;
    comment: string | null;
    score: number;
    max_score: number;
  }>;
  comment?: string | null;
}

export interface RecommendationTopicOut {
  topic_id: number;
  topic_name: string;
  description: string | null;
  image_url: string | null;
  wrong_questions_count: number;
  total_questions_count: number;
  wrong_percent: number;
  reason: "weak_topic" | "related_topic" | "not_started";
  has_active_test: boolean;
  topic_link: string | null;
}

export interface SessionRecommendationsOut {
  session_id: number;
  discipline_id: number;
  discipline_name: string;
  topic_id: number | null;
  score_percent: number | null;
  is_passed: boolean | null;
  weak_topics: RecommendationTopicOut[];
  related_topics: RecommendationTopicOut[];
  review_hints: string[];
  summary_message: string;
}

export interface StudentNotificationOut {
  notification_id: number;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  link: string | null;
  meta: Record<string, unknown>;
}

export interface StudentNotificationsOut {
  items: StudentNotificationOut[];
  total: number;
  unread_count: number;
}

// ----- Admin ------------------------------------------------------------

export interface AdminUserOut {
  id: number;
  role: Role;
  login: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  middle_name: string | null;
  full_name: string;
  department: string | null;
  group_id: number | null;
  group_name: string | null;
  archived: boolean;
  requires_totp: boolean;
  created_at: string | null;
}

export interface AdminUserListOut {
  items: AdminUserOut[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminUserCreate {
  role: Exclude<Role, "admin">;
  login: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  department?: string | null;
  group_id?: number;
}

export interface AdminUserCreateAdmin {
  login: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  department?: string | null;
}

export interface AdminUserPatch {
  first_name?: string;
  last_name?: string;
  middle_name?: string | null;
  email?: string;
  login?: string;
  department?: string | null;
  group_id?: number;
}

export interface AdminUserRoleIn {
  role: Role;
  confirm?: string;
  reason?: string;
}

export interface AdminUserTransferGroupIn {
  target_group_id: number;
}

export interface AdminUserResetPasswordOut {
  user_id: number;
  role: Role;
  new_password: string;
}

export interface AdminUserSessionItemOut {
  session_id: number;
  discipline_id: number;
  discipline_name: string;
  topic_id: number | null;
  started_at: string | null;
  completed_at: string | null;
  score: number;
  max_score: number;
  status: string;
  last_seen_at: string | null;
}

export interface AdminUserSessionsOut {
  sessions: AdminUserSessionItemOut[];
}

export interface AdminGroupOut {
  group_id: number;
  name: string;
  admission_year: number | null;
  students_count: number;
  archived: boolean;
}

export interface AdminGroupCreate {
  name: string;
  admission_year?: number;
}

export interface AdminGroupPatch {
  name?: string;
  admission_year?: number;
}

export interface AdminDisciplineOut {
  discipline_id: number;
  name: string;
  description: string | null;
  credits: number | null;
  total_hours: number | null;
  teachers_count: number;
  topics_count: number;
  questions_count: number;
  archived: boolean;
  created_at: string | null;
}

export interface AdminDisciplineCreate {
  name: string;
  description?: string | null;
  credits?: number | null;
  total_hours?: number | null;
}

export interface AdminDisciplinePatch {
  name?: string;
  description?: string | null;
  credits?: number | null;
  total_hours?: number | null;
}

export interface AdminAssignTeacherIn {
  teacher_id: number;
}

export interface AdminAssignGroupIn {
  group_id: number;
}

export interface AdminAssignStudentIn {
  student_id: number;
}

export interface AdminDisciplineAssignmentOut {
  discipline_id: number;
  target_type: "group" | "student";
  target_id: number;
  target_name: string;
  assigned_at: string;
}

export interface AdminAssignmentTeacherOut {
  teacher_id: number;
  full_name: string;
  department: string | null;
  assigned_at: string;
}

export interface AdminAssignmentGroupOut {
  group_id: number;
  name: string;
  students_count: number;
  assigned_at: string;
}

export interface AdminAssignmentStudentOut {
  student_id: number;
  full_name: string;
  group_id: number | null;
  group_name: string | null;
  assigned_at: string;
}

export interface AdminAssignmentMatrixRowOut {
  discipline_id: number;
  discipline_name: string;
  archived: boolean;
  teachers: AdminAssignmentTeacherOut[];
  groups: AdminAssignmentGroupOut[];
  students: AdminAssignmentStudentOut[];
  effective_students_count: number;
  has_teacher: boolean;
  has_student_access: boolean;
}

export interface AdminAssignmentMatrixOut {
  rows: AdminAssignmentMatrixRowOut[];
}

export interface AdminStructureImportResult {
  created: Record<"groups" | "students" | "disciplines" | "topics" | "questions" | "options", number>;
  updated: Record<"groups" | "students" | "disciplines" | "topics" | "questions" | "options", number>;
  skipped: number;
  errors: Array<{ row: number; type: string; message: string }>;
}

export interface AdminEventOut {
  notification_id: number;
  user_role: string | null;
  user_id: number | null;
  event_type: string;
  severity: number;
  channel: string;
  payload: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AdminEventListOut {
  items: AdminEventOut[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminAuditOut {
  log_id: number;
  actor_role: string | null;
  actor_id: number | null;
  action: string;
  target: string | null;
  target_type: string | null;
  target_id: number | null;
  ip_addr: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  created_at: string;
}

export interface AdminAuditListOut {
  items: AdminAuditOut[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminActiveSessionOut {
  session_id: number;
  student_id: number;
  student_name: string;
  discipline_id: number;
  discipline_name: string;
  topic_id: number | null;
  topic_name: string | null;
  teacher_id: number;
  teacher_name: string;
  started_at: string;
  last_seen_at: string | null;
  status: string;
  questions_total: number;
  questions_answered: number;
}

export interface AdminActiveSessionListOut {
  items: AdminActiveSessionOut[];
  total: number;
}

export interface AdminForceFinishIn {
  reason: string;
}

export interface AdminOverrideScoreIn {
  score: number;
  reason?: string;
}

export interface AdminHealthOut {
  db_ok: boolean;
  last_migration: string | null;
  notifications_count: number;
  audit_count: number;
  active_sessions_count: number;
  db_latency_ms?: number;
  sse_connections_count: number;
  ai_enabled: boolean;
  ai_ok: boolean;
  ai_latency_ms?: number;
  ai_model?: string;
  ai_generation_tasks?: Record<string, number>;
  api_response_stats?: Record<string, number>;
  recent_errors?: Array<{ timestamp: string; level: string; message: string }>;
}

export interface AdminStatsSummaryOut {
  users_total: number;
  students_total: number;
  teachers_total: number;
  admins_total: number;
  groups_total: number;
  disciplines_total: number;
  active_sessions: number;
  attempts_last_24h: number;
  avg_score_last_24h: number | null;
}

export interface AdminDisciplineStat {
  discipline_id: number;
  name: string;
  attempts: number;
  avg_score: number | null;
}

export interface AdminTopErrorQuestion {
  question_id: number;
  text: string;
  discipline_id: number;
  discipline_name: string;
  attempts: number;
  incorrect_pct: number;
}


// ============================================================================
//  TZ: tz-teacher-production-ready.md
// ============================================================================
export interface TeacherProfileTeacher {
  teacher_id: number;
  full_name: string;
  email: string;
  login: string | null;
  role: "teacher";
  department: string | null;
  group_ids: number[];
  group_names: string[];
  discipline_ids: number[];
}

export interface TeacherProfileStats {
  disciplines_count: number;
  students_count: number;
  questions_count: number;
  completed_sessions_last_30d: number;
  active_sessions_now: number;
}

export interface TeacherProfileOut {
  teacher: TeacherProfileTeacher;
  stats: TeacherProfileStats;
}

export interface TeacherNotificationOut {
  notification_id: number;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  link: string | null;
  meta: Record<string, unknown>;
}

export interface TeacherNotificationsOut {
  items: TeacherNotificationOut[];
  total: number;
  unread_count: number;
}

export interface TeacherActiveSessionToday {
  session_id: number;
  student_id: number;
  student_name: string;
  discipline_name: string;
  topic_name: string | null;
  started_at: string;
  expires_at: string;
  answered_count: number;
  total_count: number;
}

export interface TeacherDeadlineToday {
  topic_id: number;
  topic_name: string;
  discipline_name: string;
  available_until: string;
  attempts_overdue_for: number;
  attempts_left: number;
}

export interface TeacherNewCommentToday {
  session_id: number;
  student_id: number;
  student_name: string;
  question_id: number;
  question_text: string;
  comment: string;
  created_at: string;
}

export interface TeacherTodayOut {
  active_sessions: TeacherActiveSessionToday[];
  deadlines: TeacherDeadlineToday[];
  new_comments: TeacherNewCommentToday[];
}

export interface TeacherDashboardStats {
  disciplines_count: number;
  students_count: number;
  questions_count: number;
  active_sessions_now: number;
  completed_sessions_last_30d: number;
  avg_overall_percent: number | null;
}

export interface TeacherDashboardOut {
  teacher_id: number;
  full_name: string;
  range: string;
  discipline_id: number | null;
  stats: TeacherDashboardStats;
  today: TeacherTodayOut;
  unread_notifications_count: number;
}

export interface TeacherSearchItemOut {
  kind: "discipline" | "group" | "student" | "question" | "topic";
  id: number;
  label: string;
  href: string;
  hint: string | null;
}

export interface TeacherSearchOut {
  items: TeacherSearchItemOut[];
  total: number;
}

export interface TeacherAuditItemOut {
  audit_id: number;
  action: string;
  target_type: string;
  target_id: number | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

export interface TeacherAuditOut {
  items: TeacherAuditItemOut[];
  total: number;
}

export interface TeacherStudentActivityOut extends StudentActivityOut {
  student_id: number;
  student_full_name: string;
}

export interface StudentBriefOut {
  student_id: number;
  full_name: string;
  group_name: string;
}

export interface AnswerFileUploadOut {
  upload_id: number;
  original_name: string;
  content_type: string;
  size_bytes: number;
  download_url?: string | null;
  uploaded_at: string;
}

export interface FileUploadGradeOut {
  grade_id: number;
  question_id: number;
  points_earned: number;
  max_points: number;
  comment?: string | null;
  graded_at: string;
  session_now_completed: boolean;
}

export interface FileAnswerQuestionOut {
  question_id: number;
  question_text: string;
  max_points: number;
  uploads: AnswerFileUploadOut[];
  grade?: FileUploadGradeOut | null;
}

export interface SessionFileAnswersOut {
  session_id: number;
  student: StudentBriefOut;
  file_questions: FileAnswerQuestionOut[];
}

export interface PendingFileReviewItem {
  session_id: number;
  student_id: number;
  student_name: string;
  group_name: string;
  discipline_name: string;
  topic_name?: string | null;
  completed_at: string;
  file_upload_count: number;
  graded_count: number;
}

export interface PendingFileReviewsOut {
  items: PendingFileReviewItem[];
  total: number;
}
