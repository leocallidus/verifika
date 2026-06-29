import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ScoreBadge } from "../components/ScoreBadge";

describe("ScoreBadge", () => {
  it("renders dash for zero max", () => {
    const { container } = render(<ScoreBadge score={0} max={0} />);
    expect(container.textContent).toContain("—");
  });

  it("renders score with percentage", () => {
    const { container } = render(<ScoreBadge score={9} max={10} />);
    expect(container.textContent).toContain("9/10");
    expect(container.textContent).toContain("90%");
  });

  it("uses red tones below 50 percent", () => {
    const { container } = render(<ScoreBadge score={2} max={10} />);
    expect((container.firstChild as HTMLElement)?.className ?? "").toMatch(/danger|--color-danger/);
  });

  it("uses warning tones between 50 and 79", () => {
    const { container } = render(<ScoreBadge score={6} max={10} />);
    expect((container.firstChild as HTMLElement)?.className ?? "").toMatch(/warning|--color-warning/);
  });

  it("uses success tones at 80 plus", () => {
    const { container } = render(<ScoreBadge score={9} max={10} />);
    expect((container.firstChild as HTMLElement)?.className ?? "").toMatch(/success|--color-success|--color-text/);
  });
});
