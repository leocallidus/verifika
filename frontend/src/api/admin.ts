import { api } from "./client";
import type {
  AdminActiveSessionListOut,
  AdminAssignmentMatrixOut,
  AdminAssignGroupIn,
  AdminAssignStudentIn,
  AdminAssignTeacherIn,
  AdminStructureImportResult,
  AdminAuditListOut,
  AdminDisciplineAssignmentOut,
  AdminDisciplineCreate,
  AdminDisciplineOut,
  AdminDisciplinePatch,
  AdminEventListOut,
  AdminForceFinishIn,
  AdminGroupCreate,
  AdminGroupOut,
  AdminGroupPatch,
  AdminHealthOut,
  AdminOverrideScoreIn,
  AdminStatsSummaryOut,
  AdminUserCreate,
  AdminUserCreateAdmin,
  AdminUserListOut,
  AdminUserOut,
  AdminUserPatch,
  AdminUserResetPasswordOut,
  AdminUserRoleIn,
  AdminUserSessionsOut,
  AdminUserTransferGroupIn,
} from "../types/api";

export interface ListParams {
  role?: "student" | "teacher" | "admin";
  q?: string;
  archived?: boolean | "all";
  page?: number;
  page_size?: number;
}

export const adminApi = {
  // ----- users -----
  listUsers: (params: ListParams = {}) => {
    const qs = new URLSearchParams();
    if (params.role) qs.set("role", params.role);
    if (params.q) qs.set("q", params.q);
    if (typeof params.archived === "boolean") qs.set("archived", String(params.archived));
    if (params.page) qs.set("page", String(params.page));
    if (params.page_size) qs.set("page_size", String(params.page_size));
    const q = qs.toString();
    return api.get<AdminUserListOut>(`/api/admin/users${q ? `?${q}` : ""}`);
  },
  getUser: (role: string, id: number) =>
    api.get<AdminUserOut>(`/api/admin/users/${id}?role=${role}`),
  patchUser: (role: string, id: number, patch: AdminUserPatch) =>
    api.patch<AdminUserOut>(`/api/admin/users/${id}?role=${role}`, patch),
  createStudent: (p: AdminUserCreate) =>
    api.post<AdminUserOut>("/api/admin/users/students", p),
  createTeacher: (p: AdminUserCreate) =>
    api.post<AdminUserOut>("/api/admin/users/teachers", p),
  createAdmin: (p: AdminUserCreateAdmin) =>
    api.post<AdminUserOut>("/api/admin/users/admins", p),
  archiveUser: (role: string, id: number) =>
    api.post<AdminUserOut>(`/api/admin/users/${id}/archive?role=${role}`, {}),
  restoreUser: (role: string, id: number) =>
    api.post<AdminUserOut>(`/api/admin/users/${id}/restore?role=${role}`, {}),
  changeRole: (role: string, id: number, body: AdminUserRoleIn) =>
    api.post<unknown>(`/api/admin/users/${id}/role?role=${role}`, body),
  resetPassword: (role: string, id: number) =>
    api.post<AdminUserResetPasswordOut>(
      `/api/admin/users/${id}/reset-password?role=${role}`,
      {},
    ),
  transferGroup: (id: number, body: AdminUserTransferGroupIn) =>
    api.post<AdminUserOut>(`/api/admin/users/${id}/transfer-group`, body),
  listUserSessions: (id: number) =>
    api.get<AdminUserSessionsOut>(
      `/api/admin/users/${id}/sessions?role=student`,
    ),

  // ----- groups -----
  listGroups: (params: { archived?: boolean | "all"; q?: string } = {}) => {
    const qs = new URLSearchParams();
    if (typeof params.archived === "boolean") qs.set("archived", String(params.archived));
    if (params.q) qs.set("q", params.q);
    const q = qs.toString();
    return api.get<AdminGroupOut[]>(`/api/admin/groups${q ? `?${q}` : ""}`);
  },
  createGroup: (p: AdminGroupCreate) =>
    api.post<AdminGroupOut>("/api/admin/groups", p),
  patchGroup: (id: number, p: AdminGroupPatch) =>
    api.patch<AdminGroupOut>(`/api/admin/groups/${id}`, p),
  archiveGroup: (id: number) =>
    api.post<AdminGroupOut>(`/api/admin/groups/${id}/archive`, {}),
  bulkTransfer: (fromId: number, toId: number) =>
    api.post<unknown>(
      `/api/admin/groups/${fromId}/bulk-transfer?target_group_id=${toId}`,
      {},
    ),
  listGroupStudents: (id: number) =>
    api.get<AdminUserOut[]>(`/api/admin/groups/${id}/students`),

  // ----- disciplines -----
  listDisciplines: (params: { archived?: boolean | "all"; q?: string } = {}) => {
    const qs = new URLSearchParams();
    if (typeof params.archived === "boolean") qs.set("archived", String(params.archived));
    if (params.q) qs.set("q", params.q);
    const q = qs.toString();
    return api.get<AdminDisciplineOut[]>(`/api/admin/disciplines${q ? `?${q}` : ""}`);
  },
  createDiscipline: (p: AdminDisciplineCreate) =>
    api.post<AdminDisciplineOut>("/api/admin/disciplines", p),
  patchDiscipline: (id: number, p: AdminDisciplinePatch) =>
    api.patch<AdminDisciplineOut>(`/api/admin/disciplines/${id}`, p),
  archiveDiscipline: (id: number) =>
    api.post<AdminDisciplineOut>(`/api/admin/disciplines/${id}/archive`, {}),
  assignTeacher: (id: number, p: AdminAssignTeacherIn) =>
    api.post<unknown>(`/api/admin/disciplines/${id}/assign-teacher`, p),
  revokeTeacher: (id: number, p: AdminAssignTeacherIn) =>
    api.post<unknown>(`/api/admin/disciplines/${id}/revoke-teacher`, p),
  disciplineAssignments: (id: number) =>
    api.get<AdminDisciplineAssignmentOut[]>(`/api/admin/disciplines/${id}/assignments`),
  assignGroup: (id: number, p: AdminAssignGroupIn) =>
    api.post<unknown>(`/api/admin/disciplines/${id}/assign-group`, p),
  revokeGroup: (id: number, p: AdminAssignGroupIn) =>
    api.post<unknown>(`/api/admin/disciplines/${id}/revoke-group`, p),
  assignStudent: (id: number, p: AdminAssignStudentIn) =>
    api.post<unknown>(`/api/admin/disciplines/${id}/assign-student`, p),
  revokeStudent: (id: number, p: AdminAssignStudentIn) =>
    api.post<unknown>(`/api/admin/disciplines/${id}/revoke-student`, p),
  teacherDisciplines: (teacherId: number) =>
    api.get<AdminDisciplineOut[]>(`/api/admin/teachers/${teacherId}/disciplines`),
  assignmentMatrix: (params: { archived?: boolean | "all"; q?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (typeof params.archived === "boolean") qs.set("archived", String(params.archived));
    if (params.q) qs.set("q", params.q);
    if (params.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return api.get<AdminAssignmentMatrixOut>(`/api/admin/assignments/matrix${q ? `?${q}` : ""}`);
  },
  importStructure: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<AdminStructureImportResult>("/api/admin/structure/import", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  exportStructure: (params: { format?: "csv" | "xlsx"; include_archived?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (params.format) qs.set("format", params.format);
    if (params.include_archived) qs.set("include_archived", "true");
    const q = qs.toString();
    return `/api/admin/structure/export${q ? `?${q}` : ""}`;
  },

  // ----- events -----
  listEvents: (params: {
    type?: string;
    severity?: number;
    recipient_role?: string;
    user_id?: number;
    q?: string;
    page?: number;
    page_size?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    });
    const q = qs.toString();
    return api.get<AdminEventListOut>(`/api/admin/events${q ? `?${q}` : ""}`);
  },
  hideEvent: (id: number) =>
    api.post<void>(`/api/admin/events/${id}/hide`, {}),

  // ----- audit -----
  listAudit: (params: {
    target_type?: string;
    target_id?: number;
    actor?: string;
    actor_id?: number;
    from?: string;
    to?: string;
    q?: string;
    page?: number;
    page_size?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    });
    const q = qs.toString();
    return api.get<AdminAuditListOut>(`/api/admin/audit${q ? `?${q}` : ""}`);
  },

  changeQuestionTopic: (questionId: number, topicId: number | null) =>
    api.post<{ ok: boolean; question_id: number; topic_id: number | null }>(
      `/api/teacher/questions/${questionId}/topic`,
      { topic_id: topicId },
    ),
  activeSessions: () =>
    api.get<AdminActiveSessionListOut>("/api/admin/sessions/active"),
  forceFinish: (id: number, p: AdminForceFinishIn) =>
    api.post<void>(`/api/admin/sessions/${id}/force-finish`, p),
  clearAnswers: (id: number) =>
    api.delete<void>(`/api/admin/sessions/${id}/answers`),
  overrideScore: (id: number, p: AdminOverrideScoreIn) =>
    api.post<unknown>(`/api/admin/sessions/${id}/override`, p),

  // ----- health / stats -----
  healthDb: () => api.get<AdminHealthOut>("/api/admin/health/db"),
  statsSummary: () => api.get<AdminStatsSummaryOut>("/api/admin/stats/summary"),
  docsEnvInfo: () => api.get<Record<string, unknown>>("/api/admin/docs/env-info"),
};

// SSE helper: open EventSource against /api/admin/stream with token query.
export function openAdminStream(
  token: string,
  onEvent: (data: { event_type: string; payload?: unknown; severity?: number; metadata?: unknown; created_at?: string }) => void,
): EventSource {
  const url = `/api/admin/stream?token=${encodeURIComponent(token)}`;
  const es = new EventSource(url);
  es.onmessage = (ev) => {
    try {
      onEvent(JSON.parse(ev.data));
    } catch {
      // ignore
    }
  };
  // EventSource dispatches named events via 'addEventListener'; we register common types.
  const KNOWN_EVENTS = [
    "user_created", "user_archived", "user_restored", "role_changed",
    "password_reset", "group_transferred", "discipline_assigned", "discipline_revoked",
    "session_force_finished", "grade_override_changed", "student_attempt_started",
    "student_attempt_finished", "auth_failed_repeated", "session_stuck",
  ];
  KNOWN_EVENTS.forEach((evt) => {
    es.addEventListener(evt, (ev) => {
      try {
        onEvent({ event_type: evt, ...JSON.parse((ev as MessageEvent).data) });
      } catch {
        // ignore
      }
    });
  });
  return es;
}
