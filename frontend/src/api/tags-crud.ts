import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { useToasts } from "../components/ui/Toast";

export interface TagOut {
  tag_id: number;
  name: string;
  question_count: number;
  archived?: boolean;
}

export interface TagPayload {
  name: string;
}

export const KEY = {
  tags: (q?: string, archived?: boolean) => ["v2", "tags", q ?? "", archived ? "1" : "0"] as const,
};

export function useTags(q?: string, archived = false) {
  return useQuery({
    queryKey: KEY.tags(q, archived),
    queryFn: () => api.get<TagOut[]>("/api/v2/teacher/tags", { params: { q, archived } }).then((r) => r.data),
    staleTime: 30_000,
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  return useMutation({
    mutationFn: (payload: TagPayload) =>
      api.post<TagOut>("/api/v2/teacher/tags", payload).then((r) => r.data),
    onSuccess: (tag) => {
      qc.invalidateQueries({ queryKey: ["v2", "tags"] });
      pushToast("success", `Тег «${tag.name}» создан`);
    },
  });
}

export function usePatchTag() {
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  return useMutation({
    mutationFn: (vars: { id: number; name: string }) =>
      api.patch<TagOut>(`/api/v2/teacher/tags/${vars.id}`, { name: vars.name }).then((r) => r.data),
    onSuccess: (tag) => {
      qc.invalidateQueries({ queryKey: ["v2", "tags"] });
      pushToast("success", `Тег переименован: «${tag.name}»`);
    },
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/v2/teacher/tags/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["v2", "tags"] });
    },
  });
}

export function useRestoreTag() {
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  return useMutation({
    mutationFn: (id: number) => api.post<TagOut>(`/api/v2/teacher/tags/${id}/restore`).then((r) => r.data),
    onSuccess: (tag) => {
      qc.invalidateQueries({ queryKey: ["v2", "tags"] });
      pushToast("success", `Тег «${tag.name}» восстановлен`);
    },
  });
}
