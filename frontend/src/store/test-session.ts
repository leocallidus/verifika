import { create } from "zustand";
import type { TestStartOut, TestStartQuestion } from "../types/api";

interface TestSessionState {
  started: TestStartOut | null;
  currentIndex: number;
  answers: Record<number, number>;
  setStarted: (data: TestStartOut) => void;
  setAnswer: (questionId: number, optionId: number) => void;
  goNext: () => void;
  goPrev: () => void;
  goTo: (idx: number) => void;
  reset: () => void;
}

export const useTestSession = create<TestSessionState>((set, get) => ({
  started: null,
  currentIndex: 0,
  answers: {},
  setStarted(data) {
    set({ started: data, answers: {}, currentIndex: 0 });
  },
  setAnswer(qid, oid) {
    set((s) => ({ answers: { ...s.answers, [qid]: oid } }));
  },
  goNext() {
    const s = get();
    if (!s.started) return;
    set({ currentIndex: Math.min(s.currentIndex + 1, s.started.questions.length - 1) });
  },
  goPrev() {
    set({ currentIndex: Math.max(0, get().currentIndex - 1) });
  },
  goTo(idx) {
    const s = get();
    if (!s.started) return;
    set({ currentIndex: Math.max(0, Math.min(idx, s.started.questions.length - 1)) });
  },
  reset() {
    set({ started: null, currentIndex: 0, answers: {} });
  },
}));

export function progressLabel(qs: TestStartQuestion[]): string {
  return qs.length === 0 ? "0/0" : "";
}
