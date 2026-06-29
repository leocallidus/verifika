import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { useToasts } from "../components/ui/Toast";

export interface DisciplineOut {
  discipline_id: number;
  name: string;
  description: string | null;
  credits: number | null;
  total_hours: number | null;
  question_count: number;
  time_limit_minutes: number;
  archived: boolean;
  student_count: number;
  teacher_names: string[];
  created_at: string | null;
}

export interface GroupOut {
  group_id: number;
  name: string;
  admission_year: number;
  student_count: number;
  archived: boolean;
  attempts_total: number;
  average_score: number | null;
  created_at: string | null;
}

export interface StudentOut {
  student_id: number;
  last_name: string;
  first_name: string;
  middle_name?: string | null;
  full_name: string;
  email: string;
  login: string;
  group_id: number;
  group_name: string | null;
  enrollment_date: string;
  sessions_count: number;
  average_score: number | null;
  archived: boolean;
}

export interface StudentWithPassword extends StudentOut {
  one_time_password: string;
}

export interface DisciplinePayload {
  name: string;
  description?: string | null;
  credits?: number | null;
  total_hours?: number | null;
  question_count?: number;
  time_limit_minutes?: number;
}

export interface GroupPayload {
  name: string;
  admission_year: number;
}

export interface StudentPayload {
  last_name: string;
  first_name: string;
  middle_name?: string | null;
  email: string;
  login?: string | null;
  group_id: number;
  initial_password?: string | null;
}

export interface GroupStudentEnrollBulk { student_ids: number[]; }
export interface GroupTransferAll { target_group_id: number; }

export interface ListStudentsFilters {
  q?: string;
  group_id?: number;
  archived?: boolean;
  sort?: string;
}

export const KEY = {
  disciplines: (q?: string, archived?: boolean) =>
    ["reference", "disciplines", q ?? "", archived ? "1" : "0"] as const,
  groups: (q?: string, year?: number, archived?: boolean) =>
    ["reference", "groups", q ?? "", year ?? "", archived ? "1" : "0"] as const,
  students: (filters: ListStudentsFilters) =>
    ["reference", "students", JSON.stringify(filters)] as const,
};

// ---------- Disciplines ----------

export function useDisciplines(q?: string, archived = false) {
  return useQuery({
    queryKey: KEY.disciplines(q, archived),
    queryFn: () =>
      api
        .get<DisciplineOut[]>("/api/v2/teacher/reference/disciplines", {
          params: { q, archived },
        })
        .then((r) => r.data),
    staleTime: 30_000,
  });
}

export function useCreateDiscipline() {
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  return useMutation({
    mutationFn: (payload: DisciplinePayload) =>
      api.post<DisciplineOut>("/api/v2/teacher/reference/disciplines", payload).then((r) => r.data),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["reference", "disciplines"] });
      pushToast("success", `Дисциплина «${d.name}» создана`);
    },
  });
}

export function usePatchDiscipline() {
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<DisciplinePayload> }) =>
      api
        .patch<DisciplineOut>(`/api/v2/teacher/reference/disciplines/${id}`, payload)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reference", "disciplines"] });
      pushToast("success", "Изменения сохранены");
    },
  });
}

export function useArchiveDiscipline() {
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  return useMutation({
    mutationFn: (id: number) =>
      api.delete(`/api/v2/teacher/reference/disciplines/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reference", "disciplines"] });
      pushToast("success", "Дисциплина перемещена в архив");
    },
  });
}

export function useRestoreDiscipline() {
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  return useMutation({
    mutationFn: (id: number) =>
      api.post(`/api/v2/teacher/reference/disciplines/${id}/restore`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reference", "disciplines"] });
      pushToast("success", "Дисциплина восстановлена");
    },
  });
}

// ---------- Groups ----------

export function useGroups(q?: string, year?: number, archived = false) {
  return useQuery({
    queryKey: KEY.groups(q, year, archived),
    queryFn: () =>
      api
        .get<GroupOut[]>("/api/v2/teacher/reference/groups", {
          params: { q, admission_year: year, archived },
        })
        .then((r) => r.data),
    staleTime: 30_000,
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  return useMutation({
    mutationFn: (payload: GroupPayload) =>
      api.post<GroupOut>("/api/v2/teacher/reference/groups", payload).then((r) => r.data),
    onSuccess: (g) => {
      qc.invalidateQueries({ queryKey: ["reference", "groups"] });
      pushToast("success", `Группа «${g.name}» создана`);
    },
  });
}

export function usePatchGroup() {
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<GroupPayload> }) =>
      api.patch<GroupOut>(`/api/v2/teacher/reference/groups/${id}`, payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reference", "groups"] });
      pushToast("success", "Изменения сохранены");
    },
  });
}

export function useArchiveGroup() {
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  return useMutation({
    mutationFn: (id: number) =>
      api.delete(`/api/v2/teacher/reference/groups/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reference", "groups"] });
      pushToast("success", "Группа архивирована");
    },
  });
}

export function useEnrollBulk(groupId: number) {
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  return useMutation({
    mutationFn: (payload: GroupStudentEnrollBulk) =>
      api
        .post<{ enrolled: number }>(`/api/v2/teacher/reference/groups/${groupId}/enroll-bulk`, payload)
        .then((r) => r.data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["reference", "groups"] });
      qc.invalidateQueries({ queryKey: ["reference", "students"] });
      qc.invalidateQueries({ queryKey: ["reference", "group", groupId] });
      qc.invalidateQueries({ queryKey: ["reference", "group", groupId, "students"] });
      pushToast("success", `Зачислено: ${res.enrolled}`);
    },
  });
}

export function useUnassignBulk(groupId: number) {
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  return useMutation({
    mutationFn: (payload: GroupStudentEnrollBulk) =>
      api
        .post<{ enrolled: number }>(`/api/v2/teacher/reference/groups/${groupId}/unassign-bulk`, payload)
        .then((r) => r.data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["reference", "groups"] });
      qc.invalidateQueries({ queryKey: ["reference", "students"] });
      qc.invalidateQueries({ queryKey: ["reference", "group", groupId] });
      qc.invalidateQueries({ queryKey: ["reference", "group", groupId, "students"] });
      pushToast("success", `Снято с группы: ${res.enrolled}`);
    },
  });
}

export function useAvailableStudentsToEnroll(groupId: number, q: string = "") {
  return useQuery({
    queryKey: ["reference", "available-students", groupId, q],
    queryFn: () =>
      api
        .get<StudentOut[]>(`/api/v2/teacher/reference/groups/${groupId}/available-students`, {
          params: { q },
        })
        .then((r) => r.data),
    staleTime: 15_000,
  });
}

export function useTransferAll(groupId: number) {
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  return useMutation({
    mutationFn: (target_group_id: number) =>
      api
        .post<{ transferred: number }>(`/api/v2/teacher/reference/groups/${groupId}/transfer-all`, {
          target_group_id,
        })
        .then((r) => r.data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["reference", "groups"] });
      qc.invalidateQueries({ queryKey: ["reference", "students"] });
      pushToast("success", `Переведено: ${res.transferred}`);
    },
  });
}

// ---------- Students ----------

export function useStudents(filters: ListStudentsFilters) {
  return useQuery({
    queryKey: KEY.students(filters),
    queryFn: () =>
      api
        .get<StudentOut[]>("/api/v2/teacher/reference/students", { params: filters })
        .then((r) => r.data),
    staleTime: 30_000,
    placeholderData: (prev: StudentOut[] | undefined) => prev,
  });
}

export function useCreateStudent() {
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  return useMutation({
    mutationFn: (payload: StudentPayload) =>
      api
        .post<StudentWithPassword>("/api/v2/teacher/reference/students", payload)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reference", "students"] });
      qc.invalidateQueries({ queryKey: ["reference", "groups"] });
      // Don't toast here — the parent will show a one-time password dialog
    },
  });
}

export function usePatchStudent() {
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<StudentPayload> }) =>
      api.patch<StudentOut>(`/api/v2/teacher/reference/students/${id}`, payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reference", "students"] });
      qc.invalidateQueries({ queryKey: ["reference", "groups"] });
      pushToast("success", "Изменения сохранены");
    },
  });
}

export function useArchiveStudent() {
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  return useMutation({
    mutationFn: (id: number) =>
      api.delete(`/api/v2/teacher/reference/students/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reference", "students"] });
      qc.invalidateQueries({ queryKey: ["reference", "groups"] });
      pushToast("success", "Студент архивирован");
    },
  });
}

export function useResetStudentPassword() {
  const pushToast = useToasts((s) => s.push);
  return useMutation({
    mutationFn: (id: number) =>
      api
        .post<{ student_id: number; one_time_password: string }>(
          `/api/v2/teacher/reference/students/${id}/reset-password`,
        )
        .then((r) => r.data),
    onSuccess: () => {
      // Parent will display the new password
    },
  });
}

export function useBulkArchiveStudents() {
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  return useMutation({
    mutationFn: (student_ids: number[]) =>
      api
        .post<{ archived: number }>(`/api/v2/teacher/reference/students/bulk-archive`, student_ids)
        .then((r) => r.data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["reference", "students"] });
      qc.invalidateQueries({ queryKey: ["reference", "groups"] });
      pushToast("success", `Архивировано: ${res.archived}`);
    },
  });
}
