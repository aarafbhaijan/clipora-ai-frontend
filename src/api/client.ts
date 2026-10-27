// Typed client over the generated OpenAPI types. Same-origin /api/* (rewritten to the API in dev).
import createClient, { type Middleware } from "openapi-fetch";
import { getToken, signOut } from "@/lib/auth";
import type { paths } from "./schema";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const auth: Middleware = {
  onRequest({ request }) {
    const token = getToken();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
  onResponse({ response }) {
    if (response.status === 401) signOut();
    return response;
  },
};

export const api = createClient<paths>({ baseUrl: "" });
api.use(auth);

interface Envelope {
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
}

/** Return data or throw ApiError with the API's error envelope. */
export async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  let res: { data?: T; error?: unknown; response: Response };
  try {
    res = await p;
  } catch {
    throw new ApiError(0, "offline", "Can't reach Clipora. Check your connection.");
  }
  if (res.response.ok) return res.data as T;
  const env = (res.error ?? {}) as Envelope;
  throw new ApiError(
    res.response.status,
    env.error?.code ?? "unknown",
    env.error?.message ?? "Something went wrong. Please try again.",
    env.error?.details ?? {},
  );
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong. Please try again.";
}
