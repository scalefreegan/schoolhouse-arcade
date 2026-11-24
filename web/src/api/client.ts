import type { ErrorReply, Player, PlayerInput, PlayersReply } from "../../shared/wire.ts";

// The one fetch. Every call to the server goes through here, so an error is
// always an ApiError carrying the server's own sentence.

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    if (code) this.code = code;
  }
}

export async function api<T>(path: string, body?: unknown, method?: string, headers?: Record<string, string>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      // The marker every API route asks for (web/server/origin.ts fromApp). A
      // current browser also says same-origin, which passes on its own; this
      // is for one that does not.
      headers: { "X-Schoolhouse-Arcade": "1", ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, "The arcade's computer is not answering. Ask a grown-up to check that it is switched on.");
  }
  const data = (await res.json().catch(() => null)) as (T & Partial<ErrorReply>) | null;
  if (!res.ok || data === null) throw new ApiError(res.status, data?.error || `The server answered ${res.status}.`, data?.code);
  return data;
}

export const getPlayers = () => api<PlayersReply>("/api/players");
export const addPlayer = (input: PlayerInput) => api<Player>("/api/players", input);
export const changePlayer = (id: string, input: PlayerInput) => api<Player>(`/api/players/${id}`, input, "PATCH");
