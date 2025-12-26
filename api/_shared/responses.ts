/**
 * Standard response utilities for consistent API responses across all edge functions
 */

export type ErrorType =
  | "InputException"
  | "AuthenticationException"
  | "DatabaseException"
  | "ValidationException"
  | "NotFoundException"
  | "InternalException"
  | "MethodNotAllowed";

export interface SuccessResponse<T = any> {
  status: "success";
  data: T;
}

export interface ErrorResponse {
  status: "error";
  error_type: ErrorType;
  message: string;
}

/**
 * Creates a success response
 */
export function successResponse<T>(
  data: T,
  statusCode: number = 200
): Response {
  const body: SuccessResponse<T> = {
    status: "success",
    data,
  };

  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Creates an error response
 */
export function errorResponse(
  error_type: ErrorType,
  message: string,
  statusCode: number = 400
): Response {
  const body: ErrorResponse = {
    status: "error",
    error_type,
    message,
  };

  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Helper for input validation errors
 */
export function inputError(message: string): Response {
  return errorResponse("InputException", message, 400);
}

/**
 * Helper for authentication errors
 */
export function authError(message: string): Response {
  return errorResponse("AuthenticationException", message, 401);
}

/**
 * Helper for database errors
 */
export function dbError(message: string): Response {
  return errorResponse("DatabaseException", message, 500);
}

/**
 * Helper for not found errors
 */
export function notFoundError(message: string): Response {
  return errorResponse("NotFoundException", message, 404);
}

/**
 * Helper for internal server errors
 */
export function internalError(message: string): Response {
  return errorResponse("InternalException", message, 500);
}

/**
 * Check if request method matches allowed method(s)
 * Returns null if method is allowed, otherwise returns 405 Response
 */
export function checkMethod(
  req: Request,
  allowedMethods: string | string[]
): Response | null {
  const methods = Array.isArray(allowedMethods)
    ? allowedMethods
    : [allowedMethods];

  if (!methods.includes(req.method)) {
    const allowHeader = methods.join(", ");
    return new Response(
      JSON.stringify({
        status: "error",
        error_type: "MethodNotAllowed",
        message: `Method ${req.method} not allowed. Allowed methods: ${allowHeader}`,
      }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          "Allow": allowHeader,
        },
      }
    );
  }

  return null;
}
