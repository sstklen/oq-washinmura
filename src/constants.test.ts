import { describe, expect, test } from "bun:test";
import { formatOqScore } from "./constants";

describe("formatOqScore", () => {
  test("formats a number with one decimal place", () => {
    expect(formatOqScore(85.2)).toBe("85.2 OQ");
  });

  test("formats integers with one decimal place", () => {
    expect(formatOqScore(85)).toBe("85.0 OQ");
  });

  test("formats zero correctly", () => {
    expect(formatOqScore(0)).toBe("0.0 OQ");
  });

  test("rounds to one decimal place", () => {
    expect(formatOqScore(85.257)).toBe("85.3 OQ");
  });

  test("keeps negative numbers", () => {
    expect(formatOqScore(-12.34)).toBe("-12.3 OQ");
  });
});
