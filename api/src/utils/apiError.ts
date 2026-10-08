export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code ?? ApiError.codeForStatus(statusCode);
    this.details = details;
  }

  private static codeForStatus(status: number): string {
    switch (status) {
      case 400:
        return "BAD_REQUEST";
      case 401:
        return "UNAUTHORIZED";
      case 403:
        return "FORBIDDEN";
      case 404:
        return "NOT_FOUND";
      case 409:
        return "CONFLICT";
      case 413:
        return "PAYLOAD_TOO_LARGE";
      case 422:
        return "UNPROCESSABLE";
      case 503:
        return "SERVICE_UNAVAILABLE";
      default:
        return status >= 500 ? "INTERNAL_ERROR" : "ERROR";
    }
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, message, "BAD_REQUEST", details);
  }

  static unauthorized(message = "You need to log in first."): ApiError {
    return new ApiError(401, message, "UNAUTHORIZED");
  }

  static forbidden(message = "You no get access to this resource."): ApiError {
    return new ApiError(403, message, "FORBIDDEN");
  }

  static notFound(message = "Resource no dey find."): ApiError {
    return new ApiError(404, message, "NOT_FOUND");
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, message, "CONFLICT", details);
  }

  static tooLarge(message = "File too big."): ApiError {
    return new ApiError(413, message, "PAYLOAD_TOO_LARGE");
  }

  static serviceUnavailable(message: string, details?: unknown): ApiError {
    return new ApiError(503, message, "SERVICE_UNAVAILABLE", details);
  }

  static internal(message = "Something wey no suppose break don break."): ApiError {
    return new ApiError(500, message, "INTERNAL_ERROR");
  }
}
