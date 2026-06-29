import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionCard } from "../components/QuestionCard";

describe("QuestionCard", () => {
  const q = {
    question_id: 1,
    question_text: "Тест?",
    options: [
      { option_id: 11, option_number: 1, option_text: "A" },
      { option_id: 12, option_number: 2, option_text: "B" },
      { option_id: 13, option_number: 3, option_text: "C" },
      { option_id: 14, option_number: 4, option_text: "D" },
    ],
  };

  it("renders question text and options", () => {
    const { container } = render(
      <QuestionCard question={q} selectedOptionId={null} onSelect={() => {}} />,
    );
    expect(container.textContent).toContain("Тест?");
    expect(container.querySelectorAll("input[type=radio]")).toHaveLength(4);
  });

  it("fires onSelect with chosen option id", async () => {
    let selected: number | null = null;
    const onSelect = (id: number) => {
      selected = id;
    };
    const { rerender, getByLabelText } = render(
      <QuestionCard question={q} selectedOptionId={selected} onSelect={onSelect} />,
    );
    await userEvent.click(getByLabelText("A"));
    rerender(<QuestionCard question={q} selectedOptionId={selected} onSelect={onSelect} />);
    expect(selected).toBe(11);
  });

  it("marks the selected option as checked", () => {
    const { container } = render(
      <QuestionCard question={q} selectedOptionId={13} onSelect={() => {}} />,
    );
    const checked = container.querySelector("input:checked") as HTMLInputElement;
    expect(checked).toBeTruthy();
  });
});
