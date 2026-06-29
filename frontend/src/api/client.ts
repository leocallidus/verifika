import axios, { AxiosError } from "axios";

export const API_URL = (import.meta.env.VITE_API_URL as string) ?? "http://localhost:8000";

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

const TOKEN_KEY = "sts_token";

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const t = getToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (e: AxiosError<{ detail?: string | Array<unknown> }>) => {
    if (e.response?.status === 401) {
      setToken(null);
      if (!location.pathname.startsWith("/login")) {
        location.href = "/login";
      }
    }
    return Promise.reject(e);
  },
);

const LOCALE_FIELD_NAME: Record<string, string> = {
  email: "Email",
  password: "Пароль",
  name: "Имя",
  full_name: "Полное имя",
  group_name: "Название группы",
  discipline_name: "Название дисциплины",
  text: "Текст",
  option_text: "Вариант",
  duration_minutes: "Длительность",
  review_comment: "Комментарий",
  reviewed_score: "Оценка",
};

function fieldName(loc: unknown): string {
  if (!Array.isArray(loc)) return "";
  const last = loc[loc.length - 1];
  if (typeof last !== "string") return "";
  return LOCALE_FIELD_NAME[last] ?? last;
}

/**
 * Переводит одно сообщение Pydantic / FastAPI на русский.
 * Шаблоны выбраны по частотным формулировкам Pydantic v2.
 */
function localizePydantic(msg: string, loc?: unknown): string {
  const fname = fieldName(loc);

  if (/^field required$/i.test(msg) || /^missing$/i.test(msg)) {
    return fname ? `Заполните поле «${fname}»` : "Заполните обязательное поле";
  }
  // email format
  if (/value is not a valid email address/i.test(msg)) {
    let why = "";
    if (/must have an @-sign/i.test(msg)) why = " — нет символа @";
    else if (/after the @-sign is not valid/i.test(msg)) why = " — после @ должен быть домен";
    else if (/before the @-sign is not valid/i.test(msg)) why = " — до @ должен быть логин";
    return fname
      ? `«${fname}» — введите корректный email${why}`
      : `Введите корректный email${why}`;
  }
  // string length
  let m = msg.match(/^String should have at least (\d+) character/i);
  if (m) {
    return fname ? `«${fname}» — минимум ${m[1]} симв.` : `Минимум ${m[1]} символов`;
  }
  m = msg.match(/^String should have at most (\d+) character/i);
  if (m) {
    return fname ? `«${fname}» — максимум ${m[1]} симв.` : `Максимум ${m[1]} символов`;
  }
  m = msg.match(/^String should have exactly (\d+) character/i);
  if (m) {
    return fname ? `«${fname}» — должно быть ${m[1]} симв.` : `Должно быть ${m[1]} символов`;
  }
  // numeric
  if (/Input should be a valid integer/i.test(msg)) {
    return fname ? `«${fname}» — требуется целое число` : "Требуется целое число";
  }
  if (/Input should be a valid number/i.test(msg)) {
    return fname ? `«${fname}» — требуется число` : "Требуется число";
  }
  if (/Input should be greater than or equal to (\d+)/i.test(msg)) {
    const [, n] = msg.match(/greater than or equal to (\d+)/) ?? [];
    return fname ? `«${fname}» — не меньше ${n}` : `Не меньше ${n}`;
  }
  if (/Input should be less than or equal to (\d+)/i.test(msg)) {
    const [, n] = msg.match(/less than or equal to (\d+)/) ?? [];
    return fname ? `«${fname}» — не больше ${n}` : `Не больше ${n}`;
  }
  // string type
  if (/Input should be a valid string/i.test(msg)) {
    return fname ? `«${fname}» — требуется текст` : "Требуется текст";
  }
  if (/Input should be a valid boolean/i.test(msg)) {
    return fname ? `«${fname}» — Да/Нет` : "Требуется Да/Нет";
  }
  if (/Input should be a valid uuid/i.test(msg)) {
    return fname ? `«${fname}» — неверный идентификатор` : "Неверный идентификатор";
  }
  // Pydantic enums
  if (/Input should be (.+)$/i.test(msg)) {
    const allowed = msg.replace(/Input should be /i, "").trim();
    return fname
      ? `«${fname}» — допустимые значения: ${allowed}`
      : `Допустимые значения: ${allowed}`;
  }
  // value_error
  if (/^value_error\.(.+)$/i.test(msg)) {
    const inner = msg.replace(/^value_error\./i, "");
    return fname ? `«${fname}» — ${inner}` : inner;
  }
  return fname ? `«${fname}» — ${msg}` : msg;
}

const STATUS_MESSAGE: Record<number, string> = {
  400: "Некорректный запрос",
  401: "Неверный email или пароль",
  403: "Доступ запрещён",
  404: "Не найдено",
  409: "Конфликт данных",
  410: "Ресурс недоступен",
  413: "Файл слишком большой",
  415: "Неподдерживаемый формат",
  422: "Проверьте корректность полей",
  429: "Слишком много запросов",
  500: "Внутренняя ошибка сервера",
  502: "Сервер недоступен",
  503: "Сервис временно недоступен",
  504: "Превышено время ожидания",
};

/**
 * Карта известных английских detail-строк из бэкенда → русский человекочитаемый
 * перевод. Совпадение чувствительно к регистру, потому что FastAPI присылает
 * точную строку из `raise HTTPException(...)`.
 */
const DETAIL_TRANSLATIONS: Record<string, string> = {
  // Disicplines / groups / students / tags
  "discipline not found": "Дисциплина не найдена",
  "discipline already exists": "Дисциплина с таким названием уже существует",
  "name conflict": "Дисциплина с таким именем уже существует",
  "group not found": "Группа не найдена",
  "group already exists": "Группа с таким названием уже существует",
  "student not found": "Студент не найден",
  "tag not found": "Тег не найден",
  // Common authorization / scope
  "not your discipline": "Это не ваша дисциплина",
  "not your session": "Это не ваша сессия тестирования",
  "image access denied": "Нет доступа к изображению",
  // Topics
  "topic not found": "Тема не найдена",
  "topic already exists": "Тема с таким названием уже существует",
  "topic contains questions": "В теме есть вопросы — сначала переместите или удалите их",
  "topic does not belong to discipline": "Тема не принадлежит выбранной дисциплине",
  "topic name conflicts with existing topic": "Тема с таким именем уже существует",
  "available_until must be later than available_from": "«Доступен до» должен быть позже «Доступен с»",
  "question_count exceeds topic question count":
    "Запрошено больше вопросов, чем есть в теме",
  "invalid topic data": "Некорректные данные темы",
  "invalid discipline data": "Некорректные данные дисциплины",
  // Questions
  "question not found": "Вопрос не найден",
  "question already used in attempts": "Вопрос уже использован в попытках тестирования",
  "question used in attempts": "Вопрос уже использован в активных попытках",
  // Tests / sessions / policy
  "session not found": "Сессия не найдена",
  "policy not found": "Политика дисциплины не настроена",
  "no valid students": "Нет подходящих студентов для выполнения операции",
  "no valid students in this group": "В группе нет подходящих студентов",
  "source and target groups must differ": "Исходная и целевая группы должны различаться",
  "score > max_score": "Оценка превышает максимально возможную",
  // Image / file errors (raised as text via str(exc))
  "invalid image file": "Файл не является корректным изображением",
  "image too large": "Файл больше допустимого размера",
  "unsupported image type": "Неподдерживаемый формат изображения",
  "image dimensions too small": "Слишком маленькие размеры изображения (минимум 64×64)",
  "image dimensions too large": "Слишком большие размеры изображения (максимум 4096×4096)",
  "invalid storage path": "Некорректный путь хранения изображения",
  "пустой файл": "Файл пустой",
  // Pydantic-generated `value_error.strings_too_short` etc. are handled separately via localizePydantic.
};

/** Извлекает коды ошибок геометрии/изображений, прилетающих на английском. */
function translateKnownString(s: string): string | null {
  if (DETAIL_TRANSLATIONS[s]) return DETAIL_TRANSLATIONS[s];
  // "Файл больше 5 MB" и подобные сообщения от сервиса валидации изображений уже на русском.
  const lower = s.toLowerCase();
  if (
    lower.includes("неподдерживаемый тип файла") ||
    lower.includes("недопустимый тип файла") ||
    lower.includes("тип файла запрещ")
  ) {
    return "Загружаемый файл не поддерживается";
  }
  if (lower.includes("not found") && lower.includes("image")) {
    return "Изображение не найдено";
  }
  if (lower.includes("image file")) {
    return "Файл изображения отсутствует на сервере";
  }
  return null;
}

/**
 * Превращает любую ошибку API / Pydantic / сети в аккуратную русскую строку.
 */
export function errorMessage(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const status = e.response?.status;

    // Сервер недоступен / сеть
    if (!e.response) {
      return "Не удалось связаться с сервером";
    }

    const data = e.response.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      if (typeof data.message === "string") {
        let msg = data.message;
        if (typeof data.reason === "string" && data.reason !== data.message) {
          msg += ` (${data.reason})`;
        }
        if (typeof data.action_hint === "string") {
          msg += `. Подсказка: ${data.action_hint}`;
        }
        return msg;
      }
    }

    const detail = e.response.data?.detail;
    if (typeof detail === "string") {
      // Перехват «invalid credentials» от auth-эндпоинта
      if (status === 401 && /invalid credentials/i.test(detail)) {
        return STATUS_MESSAGE[401];
      }
      const translated = translateKnownString(detail);
      if (translated) return translated;
      return detail;
    }
    if (Array.isArray(detail) && detail.length > 0) {
      const parts: string[] = [];
      for (const raw of detail) {
        if (!raw || typeof raw !== "object") {
          if (typeof raw === "string") parts.push(raw);
          continue;
        }
        const msg = typeof raw.msg === "string" ? raw.msg : "";
        const loc = Array.isArray(raw.loc) ? raw.loc : [];
        if (msg) parts.push(localizePydantic(msg, loc));
      }
      if (parts.length > 0) return parts.join("; ");
      return STATUS_MESSAGE[422] ?? "Проверьте корректность полей";
    }
    if (status && STATUS_MESSAGE[status]) {
      return STATUS_MESSAGE[status];
    }
    return e.message || "Неизвестная ошибка";
  }
  if (e instanceof Error) return e.message || "Неизвестная ошибка";
  return "Неизвестная ошибка";
}
