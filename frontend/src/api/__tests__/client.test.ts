import { describe, expect, it } from "vitest";
import { AxiosError } from "axios";
import { errorMessage } from "../client";

function makeAxios(status: number | undefined, data: unknown): AxiosError {
  const err = new AxiosError();
  if (status != null) {
    Object.defineProperty(err, "response", {
      value: { status, data },
      writable: false,
    });
  } else {
    Object.defineProperty(err, "response", { value: undefined, writable: false });
  }
  Object.defineProperty(err, "message", {
    value: status == null ? "Network Error" : `Request failed with status code ${status}`,
    writable: false,
  });
  return err as AxiosError;
}

describe("errorMessage", () => {
  it("network error → Russian server-unreachable", () => {
    const e = makeAxios(undefined, null);
    expect(errorMessage(e)).toBe("Не удалось связаться с сервером");
  });

  it("401 + invalid credentials string → русский", () => {
    const e = makeAxios(401, { detail: "invalid credentials" });
    expect(errorMessage(e)).toBe("Неверный email или пароль");
  });

  it("422 Pydantic email + password short → читаемые русские сообщения", () => {
    const e = makeAxios(422, {
      detail: [
        {
          type: "value_error",
          loc: ["body", "email"],
          msg: "value is not a valid email address: An email address must have an @-sign.",
          input: "bad-email",
          ctx: {},
        },
        {
          type: "string_too_short",
          loc: ["body", "password"],
          msg: "String should have at least 4 characters",
          input: "",
          ctx: { min_length: 4 },
        },
      ],
    });
    const out = errorMessage(e);
    expect(out).toContain("Email");
    expect(out).toContain("корректный email");
    expect(out).toContain("@");
    expect(out).toContain("Пароль");
    expect(out).toContain("минимум 4");
    expect(out).not.toMatch(/value is not a valid email/i);
    expect(out).not.toMatch(/String should have at least/i);
  });

  it("422 missing field → 'Заполните поле «Email»'", () => {
    const e = makeAxios(422, {
      detail: [{ type: "missing", loc: ["body", "email"], msg: "Field required", input: {} }],
    });
    expect(errorMessage(e)).toBe("Заполните поле «Email»");
  });

  it("500 + no detail → стандартное русское сообщение", () => {
    const e = makeAxios(500, null);
    expect(errorMessage(e)).toBe("Внутренняя ошибка сервера");
  });

  it("ошибка типа файла → человекочитаемое сообщение", () => {
    const e = makeAxios(400, { detail: "неподдерживаемый тип файла: application/octet-stream" });
    expect(errorMessage(e)).toBe("Загружаемый файл не поддерживается");
  });

  it("structured error response → message + reason + action_hint", () => {
    const e = makeAxios(400, {
      code: "BAD_REQUEST",
      message: "Ошибка удаления темы",
      reason: "Тема привязана к активным сессиям",
      action_hint: "Сначала завершите сессии этой темы"
    });
    expect(errorMessage(e)).toBe("Ошибка удаления темы (Тема привязана к активным сессиям). Подсказка: Сначала завершите сессии этой темы");
  });

  it("не-AxiosError → нормальная строка", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain string")).toBe("Неизвестная ошибка");
    expect(errorMessage(undefined)).toBe("Неизвестная ошибка");
  });
});
