import { api, API_URL, getToken } from "./client";
import { AiChat, AiMessage, AiStatus, AiGenerationTask, AiUsage, AiStudentPreparationResponse } from "../types/ai";
import { QuestionWithType } from "../types/api";

export async function getAiStatus(): Promise<AiStatus> {
  const resp = await api.get<AiStatus>("/api/v2/ai/status");
  return resp.data;
}

export async function getChats(): Promise<AiChat[]> {
  const resp = await api.get<AiChat[]>("/api/v2/ai/chats");
  return resp.data;
}

export async function createChat(firstMessage?: string): Promise<AiChat> {
  const resp = await api.post<AiChat>("/api/v2/ai/chats", { first_message: firstMessage });
  return resp.data;
}

export async function deleteChat(chatId: number): Promise<void> {
  await api.delete(`/api/v2/ai/chats/${chatId}`);
}

export async function renameChat(chatId: number, title: string): Promise<AiChat> {
  const resp = await api.patch<AiChat>(`/api/v2/ai/chats/${chatId}/title`, { title });
  return resp.data;
}

export async function getChatMessages(chatId: number): Promise<AiMessage[]> {
  const resp = await api.get<AiMessage[]>(`/api/v2/ai/chats/${chatId}/messages`);
  return resp.data;
}

export async function streamChatMessage(
  chatId: number,
  content: string,
  onDelta: (text: string) => void,
  onTitle: (title: string) => void,
  onDone: (meta: { tokens_used: number; model: string }) => void,
  signal: AbortSignal,
  regenerate: boolean = false,
  model?: string | null,
): Promise<void> {
  const token = getToken();
  const url = `${API_URL}/api/v2/ai/chats/${chatId}/stream` + (regenerate ? "?regenerate=true" : "");
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content, model }),
    signal,
  });

  if (!resp.ok) {
    const errorJson = await resp.json().catch(() => ({}));
    throw new Error(errorJson.detail || `HTTP Error ${resp.status}`);
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim().startsWith("data: ")) continue;
      const jsonStr = line.replace(/^data:\s*/, "");
      try {
        const evt = JSON.parse(jsonStr);
        if (evt.type === "delta") onDelta(evt.content);
        if (evt.type === "title") onTitle(evt.title);
        if (evt.type === "done") onDone(evt);
        if (evt.type === "error") throw new Error(evt.message || "Streaming error");
      } catch (err) {
        console.error("SSE parse error", err, "for line", line);
      }
    }
  }
}

export interface QuestionGenPayload {
  discipline_id: number;
  topic_id?: number | null;
  topic_name_hint?: string | null;
  question_types: string[];
  count: number;
  difficulty_min: number;
  difficulty_max: number;
  language: string;
  additional_context?: string | null;
  material?: string | null;
  model?: string | null;
}

export async function startQuestionGeneration(payload: QuestionGenPayload): Promise<{ task_id: string }> {
  const resp = await api.post<{ task_id: string }>("/api/v2/ai/generate/questions", payload);
  return resp.data;
}

export async function getGenerationTaskStatus(taskId: string): Promise<AiGenerationTask> {
  const resp = await api.get<AiGenerationTask>(`/api/v2/ai/generate/tasks/${taskId}`);
  return resp.data;
}

export async function getPendingQuestions(disciplineId?: number): Promise<QuestionWithType[]> {
  const resp = await api.get<QuestionWithType[]>("/api/v2/ai/pending-questions", {
    params: { discipline_id: disciplineId },
  });
  return resp.data;
}

export async function approveQuestion(questionId: number): Promise<QuestionWithType> {
  const resp = await api.post<QuestionWithType>(`/api/v2/ai/pending-questions/${questionId}/approve`);
  return resp.data;
}

export async function rejectQuestion(questionId: number): Promise<void> {
  await api.post(`/api/v2/ai/pending-questions/${questionId}/reject`);
}

export async function editPendingQuestion(questionId: number, data: any): Promise<QuestionWithType> {
  const resp = await api.patch<QuestionWithType>(`/api/v2/ai/pending-questions/${questionId}`, data);
  return resp.data;
}

export async function togglePinChat(chatId: number): Promise<AiChat> {
  const resp = await api.patch<AiChat>(`/api/v2/ai/chats/${chatId}/pin`);
  return resp.data;
}

export async function searchChats(query: string): Promise<AiChat[]> {
  const resp = await api.get<AiChat[]>("/api/v2/ai/chats/search", { params: { q: query } });
  return resp.data;
}

export async function getAiUsage(): Promise<AiUsage> {
  const resp = await api.get<AiUsage>("/api/v2/ai/usage");
  return resp.data;
}

export async function askStudentTopicPreparation(
  topicId: number,
  prompt: string,
  model?: string | null,
): Promise<AiStudentPreparationResponse> {
  const resp = await api.post<AiStudentPreparationResponse>(`/api/v2/ai/student/topics/${topicId}/prepare`, {
    prompt,
    model,
  });
  return resp.data;
}

export async function deleteMessageCascade(chatId: number, messageId: number, cascade: "after" | "single" = "after"): Promise<void> {
  await api.delete(`/api/v2/ai/chats/${chatId}/messages/${messageId}`, { params: { cascade } });
}

export async function regeneratePendingQuestion(questionId: number, instruction: string): Promise<QuestionWithType> {
  const resp = await api.post<QuestionWithType>(`/api/v2/ai/pending-questions/${questionId}/regenerate`, { instruction });
  return resp.data;
}

export async function batchApproveQuestions(ids: number[]): Promise<QuestionWithType[]> {
  const resp = await api.post<QuestionWithType[]>("/api/v2/ai/pending-questions/batch-approve", { ids });
  return resp.data;
}

export async function batchRejectQuestions(ids: number[]): Promise<void> {
  await api.post("/api/v2/ai/pending-questions/batch-reject", { ids });
}

export async function editorGenerateOptions(text: string, qtype: string, count: number = 4) {
  const resp = await api.post("/api/v2/ai/editor/generate-options", { text, qtype, count });
  return resp.data as { options: { text: string; is_correct: boolean }[] };
}

export async function editorRephraseQuestion(text: string) {
  const resp = await api.post("/api/v2/ai/editor/rephrase", { text });
  return resp.data as { text: string };
}

export async function editorExplainQuestion(text: string, correct_answer_context: string) {
  const resp = await api.post("/api/v2/ai/editor/explain", { text, correct_answer_context });
  return resp.data as { explanation: string };
}

export async function editorCheckComplexity(text: string) {
  const resp = await api.post("/api/v2/ai/editor/check-complexity", { text });
  return resp.data as { complexity: number; reason: string };
}

export async function editorWriteCorrectAnswer(text: string, qtype: string, options?: string[]) {
  const resp = await api.post("/api/v2/ai/editor/write-correct-answer", { text, qtype, options });
  return resp.data as { correct_answer: string; explanation?: string };
}
