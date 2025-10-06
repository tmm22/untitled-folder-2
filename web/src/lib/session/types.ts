export interface SessionRecord {
  id: string;
  secret: string; // base64 encoded
  expiresAt: number;
}

export interface SessionStore {
  save(record: SessionRecord): Promise<void>;
  find(id: string): Promise<SessionRecord | null>;
  delete(id: string): Promise<void>;
  /**
   * Optionally clean up expired entries. Called on best-effort basis.
   */
  prune?(now: number): Promise<void>;
}
