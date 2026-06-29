export interface AiChat {
  chat_id: number;
  title: string | null;
  is_pinned?: boolean;
  created_at: string;
  updated_at: string;
  last_message_preview?: string | null;
  messages_count: number;
}

export interface AiMessage {
  message_id: number;
  chat_id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model_used?: string | null;
  tokens_used?: number | null;
  created_at: string;
}

export interface AiStatus {
  enabled: boolean;
  student_access_enabled?: boolean | null;
  chat_model?: string | null;
  generation_model?: string | null;
  generation_models_allowed?: string[] | null;
  chat_models_allowed?: string[] | null;
}

export interface AiGenerationTask {
  task_id: string;
  status: 'processing' | 'done' | 'error';
  generated_count: number;
  total_requested?: number;
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface AiUsage {
  tokens_today: number;
  messages_today: number;
  limit_tokens: number;
  limit_messages: number;
  reset_at: string;
}

export interface AiStudentPreparationResponse {
  topic_id: number;
  chat_id: number;
  message_id: number;
  answer: string;
  model_used?: string | null;
  tokens_used?: number | null;
}
