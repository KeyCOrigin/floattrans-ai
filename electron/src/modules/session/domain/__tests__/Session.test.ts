import { describe, it, expect } from "vitest";
import { FrontendSession } from "../Session.entity";

describe("FrontendSession", () => {
  it("create 返回 idle 状态", () => {
    const session = FrontendSession.create("demo");
    expect(session.state).toBe("idle");
  });

  it("create 生成唯一 ID", () => {
    const s1 = FrontendSession.create("demo");
    const s2 = FrontendSession.create("live");
    expect(s1.id).not.toBe(s2.id);
  });

  it("状态转换：idle → connecting → listening", () => {
    const session = FrontendSession.create("live");
    session.setConnecting();
    expect(session.state).toBe("connecting");
    session.setListening();
    expect(session.state).toBe("listening");
  });

  it("isLive / isDemo 正确", () => {
    expect(FrontendSession.create("live").isLive()).toBe(true);
    expect(FrontendSession.create("demo").isDemo()).toBe(true);
  });

  it("setStopped 任意状态可停止", () => {
    const session = FrontendSession.create("live");
    session.setStopped();
    expect(session.state).toBe("stopped");
  });
});
