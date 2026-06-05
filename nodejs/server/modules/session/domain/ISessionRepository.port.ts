// ISessionRepository.port.ts — 会话仓储接口

import type { Session } from "./Session.entity";

export interface ISessionRepository {
  save(session: Session): void;
  findById(id: string): Session | undefined;
  findAll(): Session[];
  remove(id: string): void;
}
