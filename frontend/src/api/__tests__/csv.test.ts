import { describe, expect, it } from "vitest";
import { parseCsv, csvTemplateBlob, validateFile } from "../csv";

describe("parseCsv", () => {
  it("parses well-formed rows", () => {
    const text =
      "last_name,first_name,email,login,group_name,initial_password\r\n" +
      "Иванов,Иван,ivanov@univ.ru,ivanov,ИВТ-21,Passw0rd!Test\r\n" +
      "Петрова,Мария,petrova@univ.ru,petrova,ПИ-22,\r\n" +
      "Сидоров,Сидор,sidorov@univ.ru,sidorov,ИВТ-21,Passw0rd!Test\r\n";
    const res = parseCsv(text);
    expect(res.headers).toEqual([
      "last_name", "first_name", "email", "login", "group_name", "initial_password",
    ]);
    expect(res.total_rows).toBe(3);
    expect(res.valid_rows).toBe(3);
    expect(res.invalid_rows).toBe(0);
    expect(res.rows[0].parsed?.email).toBe("ivanov@univ.ru");
  });

  it("flags invalid rows and counts them", () => {
    const text =
      "last_name,first_name,email,group_name\r\n" +
      ",Missing Name,bad@univ.ru,ИВТ-21\r\n" +      // missing last
      "Ok,Иван,not-an-email,ИВТ-21\r\n" +           // bad email
      "Иванов,Иван,ok@univ.ru,ИВТ-21\r\n";           // ok
    const res = parseCsv(text);
    expect(res.total_rows).toBe(3);
    expect(res.valid_rows).toBe(1);
    expect(res.invalid_rows).toBe(2);
    expect(res.rows[0].errors.length).toBeGreaterThan(0);
    expect(res.rows[0].parsed).toBeUndefined();
    expect(res.rows[2].parsed).toBeDefined();
  });

  it("lowercases login and trims fields", () => {
    const text =
      "last_name,first_name,email,group_name,login\r\n" +
      "Foo,Bar,FOO@UNIV.RU,Group,XuX\r\n";
    const res = parseCsv(text);
    expect(res.rows[0].parsed?.email).toBe("foo@univ.ru");
    expect(res.rows[0].parsed?.login).toBe("xux");
  });

  it("respects max rows cap (1000)", () => {
    const rows: string[] = [];
    rows.push("last_name,first_name,email,group_name\r\n");
    for (let i = 0; i < 1500; i++) {
      rows.push(`U${i},U${i},u${i}@univ.ru,Group\r\n`);
    }
    const res = parseCsv(rows.join(""));
    expect(res.total_rows).toBe(1000);
  });

  it("empty input → zero rows", () => {
    const res = parseCsv("");
    expect(res.total_rows).toBe(0);
    expect(res.valid_rows).toBe(0);
  });

  it("strips UTF-8 BOM", () => {
    const text = "\uFEFFlast_name,first_name,email,group_name\r\nИванов,Иван,ok@univ.ru,ИВТ-21\r\n";
    const res = parseCsv(text);
    expect(res.headers[0]).toBe("last_name");
    expect(res.valid_rows).toBe(1);
  });

  it("quoted fields with embedded commas", () => {
    const text =
      "last_name,first_name,email,group_name\r\n" +
      '"Иванов, Иван",Иван,ivanov@univ.ru,ИВТ-21\r\n';
    const res = parseCsv(text);
    expect(res.rows[0].parsed?.last_name).toBe("Иванов, Иван");
  });
});

describe("validateFile", () => {
  it("rejects files >5MB", () => {
    const fakeBig = { size: 6 * 1024 * 1024, type: "text/csv", name: "x.csv" } as File;
    expect(validateFile(fakeBig)).toMatch(/MB/);
  });
  it("accepts small csv", () => {
    const f = { size: 1000, type: "text/csv", name: "students.csv" } as File;
    expect(validateFile(f)).toBeNull();
  });
  it("rejects non-csv type", () => {
    const f = { size: 1000, type: "application/json", name: "x.json" } as File;
    expect(validateFile(f)).toMatch(/CSV/);
  });
});

describe("csvTemplateBlob", () => {
  it("returns Blob with BOM and headers", async () => {
    const blob = csvTemplateBlob();
    expect(blob.type).toMatch(/csv/);
    const text = await blob.text();
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toMatch(/last_name,first_name,email,group_name,login,initial_password/);
  });
});
