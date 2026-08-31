export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code:
      | "VALIDATION_ERROR"
      | "NOT_FOUND"
      | "CONFLICT"
      | "FORBIDDEN"
      | "INTERNAL_ERROR"
      | "DATABASE_UNAVAILABLE",
    message: string,
    readonly fieldErrors: Record<string, string[]> | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

