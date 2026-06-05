// InMemorySessionRepository.ts — 内存会话仓储实现

import type { ISessionRepository } from "../domain/ISessionRepository.port";
import type { Session } from "../domain/Session.entity";

export class InMemorySessionRepository implements ISessionRepository {
  readonly #store = new Map<string, Session>();

  save(session: Session): void {
    this.#store.set(session.id, session);
  }

  findById(id: string): Session | undefined {
    return this.#store.get(id);
  }

  findAll(): Session[] {
    return Array.from(this.#store.values());
  }

  remove(id: string): void {
    this.#store.delete(id);
  }
}
