/**
 * Standardized error formatting helper for MCP tool responses.
 * Ensures error messages are clear and diagnostic without leaking connection strings,
 * database passwords, or raw stack traces.
 */

export interface McpToolResponse {
  [x: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

export function formatSuccessResponse(data: unknown): McpToolResponse {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function formatErrorResponse(error: unknown): McpToolResponse {
  let message = "An unexpected error occurred.";

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  }

  // Sanitize any potential connection credentials or sensitive env leakage
  const sanitized = message
    .replace(/postgresql:\/\/[^@]+@/gi, "postgresql://[redacted]@")
    .replace(/password=[^\s;&]+/gi, "password=[redacted]");

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            error: sanitized,
            success: false,
          },
          null,
          2
        ),
      },
    ],
    isError: true,
  };
}
