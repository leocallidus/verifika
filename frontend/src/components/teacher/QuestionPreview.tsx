import { useState, useEffect } from "react";
import { QuestionCard } from "../QuestionCard";
import {
  BoolCard,
  ClozeCard,
  MatchCard,
  MultiCard,
  NumericCard,
  OrderCard,
  ShortAnswerCard,
  TextCard,
} from "../QuestionTypeCards";
import type { QuestionPayload } from "../../types/api";

interface QuestionPreviewProps {
  editor: QuestionPayload;
  imagePreviewUrl: string | null;
}

export function QuestionPreview({ editor, imagePreviewUrl }: QuestionPreviewProps) {
  const [singleSelected, setSingleSelected] = useState<number | null>(null);
  const [multiSelected, setMultiSelected] = useState<number[]>([]);
  const [shortVal, setShortVal] = useState("");
  const [numericVal, setNumericVal] = useState<number | null>(null);
  const [matchVal, setMatchVal] = useState<Record<string, string>>({});
  const [textVal, setTextVal] = useState("");
  const [boolVal, setBoolVal] = useState<boolean | null>(null);
  const [orderVal, setOrderVal] = useState<number[]>([]);
  const [clozeVal, setClozeVal] = useState<Record<string, string>>({});

  // Reset inputs when question type or text changes
  useEffect(() => {
    setSingleSelected(null);
    setMultiSelected([]);
    setShortVal("");
    setNumericVal(null);
    setMatchVal({});
    setTextVal("");
    setBoolVal(null);
    setOrderVal(editor.options.map((o) => o.option_number));
    setClozeVal({});
  }, [editor.qtype, editor.text]);

  const fakeQuestionId = 1;
  const qtype = editor.qtype;

  return (
    <div className="border border-[var(--color-border)] rounded-xl p-4 bg-[var(--color-bg-muted)]/20">
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">
        Предпросмотр (так увидит студент)
      </div>

      {qtype === "single" && (
        <QuestionCard
          question={{
            question_id: fakeQuestionId,
            question_text: editor.text,
            image_url: imagePreviewUrl,
            options: editor.options.map((o) => ({
              option_id: o.option_number,
              option_number: o.option_number,
              option_text: o.text,
            })),
          }}
          selectedOptionId={singleSelected}
          onSelect={setSingleSelected}
        />
      )}

      {qtype === "multi" && (
        <MultiCard
          questionId={fakeQuestionId}
          text={editor.text}
          imageUrl={imagePreviewUrl}
          options={editor.options.map((o) => ({
            option_id: o.option_number,
            option_number: o.option_number,
            option_text: o.text,
          }))}
          selected={multiSelected}
          onSelect={setMultiSelected}
        />
      )}

      {qtype === "short" && (
        <ShortAnswerCard
          questionId={fakeQuestionId}
          text={editor.text}
          imageUrl={imagePreviewUrl}
          pattern={editor.short_pattern ?? null}
          value={shortVal}
          onChange={setShortVal}
        />
      )}

      {qtype === "numeric" && (
        <NumericCard
          questionId={fakeQuestionId}
          text={editor.text}
          imageUrl={imagePreviewUrl}
          tolerance={editor.numeric_tolerance ?? null}
          value={numericVal}
          onChange={setNumericVal}
        />
      )}

      {qtype === "match" && (
        <MatchCard
          questionId={fakeQuestionId}
          text={editor.text}
          imageUrl={imagePreviewUrl}
          pairs={editor.match_pairs || []}
          value={matchVal}
          onChange={setMatchVal}
        />
      )}

      {qtype === "text" && (
        <TextCard
          questionId={fakeQuestionId}
          text={editor.text}
          imageUrl={imagePreviewUrl}
          mode={editor.text_mode ?? "string"}
          value={textVal}
          onChange={setTextVal}
        />
      )}

      {qtype === "bool" && (
        <BoolCard
          questionId={fakeQuestionId}
          text={editor.text}
          imageUrl={imagePreviewUrl}
          value={boolVal}
          onChange={setBoolVal}
        />
      )}

      {qtype === "order" && (
        <OrderCard
          questionId={fakeQuestionId}
          text={editor.text}
          imageUrl={imagePreviewUrl}
          order={orderVal}
          options={editor.options.map((o) => ({
            option_id: o.option_number,
            text: o.text,
            correct_position: o.option_number,
            is_correct: o.is_correct,
          }))}
          onChange={setOrderVal}
        />
      )}

      {qtype === "cloze" && (
        <ClozeCard
          questionId={fakeQuestionId}
          text={editor.text}
          imageUrl={imagePreviewUrl}
          blanks={(editor.cloze_blanks || []).map((b) => ({
            index: b.index,
            kind: b.kind,
            options: b.options,
          }))}
          values={clozeVal}
          onChange={setClozeVal}
        />
      )}
    </div>
  );
}
