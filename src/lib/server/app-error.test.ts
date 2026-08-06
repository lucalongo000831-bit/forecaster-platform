import { describe, expect, it } from "vitest";
import { AppError, toAppError } from "./app-error";

describe("AppError", () => {
  it("preserves typed errors", () => {
    const error = new AppError("RATE_LIMITED", "Troppe richieste", 429, true, 30);
    expect(toAppError(error)).toBe(error);
  });

  it("hides unexpected error details", () => {
    const error = toAppError(new Error("database password leaked"));
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.message).not.toContain("password");
  });
});
