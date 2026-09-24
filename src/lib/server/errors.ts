export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function fail(message: string, status = 400, code?: string): never {
  throw new ApiError(message, status, code);
}

export type ApiResult<T> =
  | ({ success: true } & T)
  | { success: false; message: string; status: number; code?: string };

export function ok<T>(data: T): { success: true } & T {
  return { success: true, ...data };
}

export function asResult<T>(err: unknown): ApiResult<T> {
  if (err && typeof err === "object" && "message" in err && (err as { message: string }).message === "Unauthorized") {
    return { success: false, message: "Unauthorized", status: 401, code: "UNAUTHORIZED" };
  }
  if (err instanceof ApiError) {
    return { success: false, message: err.message, status: err.status, code: err.code };
  }
  if (err instanceof Error) {
    return { success: false, message: err.message, status: 500 };
  }
  return { success: false, message: "Something went wrong.", status: 500 };
}
