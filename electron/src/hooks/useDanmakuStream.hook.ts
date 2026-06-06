// useDanmakuStream.hook.ts — 弹幕流自定义Hook
// 职责：监听 Electron IPC 弹幕事件，维护弹幕条目列表，驱动渲染
// 覆盖窗口專用：通过 IPC 接收事件 → useReducer → 驱动 DanmakuOverlay 渲染

import { useReducer, useEffect, useRef, useCallback } from "react";
import type {
  DanmakuDisplayEntry,
  DanmakuPushPayload,
  DanmakuUpdatePayload,
  DanmakuCorrectPayload,
  DanmakuEvictPayload,
} from "../types/subtitle";

const MAX_VISIBLE = 10;

type DanmakuAction =
  | { type: "push"; payload: DanmakuPushPayload }
  | { type: "update"; payload: DanmakuUpdatePayload }
  | { type: "correct"; payload: DanmakuCorrectPayload }
  | { type: "evict"; payload: DanmakuEvictPayload }
  | { type: "clear" };

function danmakuReducer(
  entries: DanmakuDisplayEntry[],
  action: DanmakuAction,
): DanmakuDisplayEntry[] {
  switch (action.type) {
    case "push": {
      // 去重：同 ID 不重复添加（防止 StrictMode 双重监听导致重复 dispatch）
      if (entries.some((e) => e.id === action.payload.id)) {
        return entries;
      }
      const entry: DanmakuDisplayEntry = {
        ...action.payload,
        chinese: action.payload.chinese || "",
        createdAt: Date.now(),
        animation: "push",
      };
      const next = [...entries, entry];
      if (next.length > MAX_VISIBLE) {
        // 标记最旧条目为推出动画，下一次 render 后移除
        next[0] = { ...next[0]!, animation: "evict" };
      }
      return next;
    }
    case "update": {
      return entries.map((e) =>
        e.id === action.payload.id
          ? {
              ...e,
              chinese: action.payload.chinese,
              status: action.payload.isComplete ? ("final" as const) : e.status,
            }
          : e,
      );
    }
    case "correct": {
      return entries.map((e) =>
        e.id === action.payload.id
          ? {
              ...e,
              chinese: action.payload.newChinese,
              status: "corrected" as const,
              animation: "correct" as const,
            }
          : e,
      );
    }
    case "evict": {
      // 正式移除已标记为 evict 的条目
      return entries.filter((e) => e.id !== action.payload.id);
    }
    case "clear":
      return [];
    default:
      return entries;
  }
}

/** 供 ControlPanel 调用的发射器接口 */
export interface DanmakuStreamAPI {
  push: (payload: DanmakuPushPayload) => void;
  update: (payload: DanmakuUpdatePayload) => void;
  correct: (payload: DanmakuCorrectPayload) => void;
  evict: (payload: DanmakuEvictPayload) => void;
  clear: () => void;
}

/**
 * 覆盖窗口模式：监听 Electron IPC 弹幕事件
 * 用法：DanmakuOverlay 中调用 useDanmakuStream()
 */
export function useDanmakuStream(): {
  entries: readonly DanmakuDisplayEntry[];
  isActive: boolean;
  /** 在条目 fade-out 动画结束后调用，正式从列表中移除 */
  evictEntry: (id: string) => void;
} {
  const [entries, dispatch] = useReducer(danmakuReducer, []);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  // 注册 IPC 监听（仅一次），cleanup 防止 StrictMode 双重挂载
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) {
      // 非 Electron 环境（浏览器调试），不做 IPC 监听
      return;
    }

    const onPush = (p: unknown) => dispatchRef.current({ type: "push", payload: p as DanmakuPushPayload });
    const onUpdate = (p: unknown) => dispatchRef.current({ type: "update", payload: p as DanmakuUpdatePayload });
    const onCorrect = (p: unknown) => dispatchRef.current({ type: "correct", payload: p as DanmakuCorrectPayload });
    const onEvict = (p: unknown) => dispatchRef.current({ type: "evict", payload: p as DanmakuEvictPayload });
    const onClear = () => dispatchRef.current({ type: "clear" });

    api.onDanmakuPush?.(onPush);
    api.onDanmakuUpdate?.(onUpdate);
    api.onDanmakuCorrect?.(onCorrect);
    api.onDanmakuEvict?.(onEvict);
    api.onDanmakuClear?.(onClear);

    return () => {
      api.removeDanmakuPushListener?.(onPush);
      api.removeDanmakuUpdateListener?.(onUpdate);
      api.removeDanmakuCorrectListener?.(onCorrect);
      api.removeDanmakuEvictListener?.(onEvict);
      api.removeDanmakuClearListener?.(onClear);
    };
  }, []);

  const evictEntry = useCallback((id: string) => {
    dispatchRef.current({ type: "evict", payload: { id } });
  }, []);

  return { entries, isActive: entries.length > 0, evictEntry };
}

/**
 * 控制面板模式：创建供 WebSocket 回调直接调用的发射器
 * 用法：ControlPanel 中调用 useDanmakuEmitter()
 */
export function useDanmakuEmitter(): DanmakuStreamAPI {
  const [, dispatch] = useReducer(danmakuReducer, []);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  // 这些函数在 ControlPanel 的 danmakuCallbacks 中被调用，
  // 同时也转发给 electronAPI 发到覆盖窗口
  const push = useCallback(
    (payload: DanmakuPushPayload) => {
      window.electronAPI?.danmakuPush?.(payload);
      dispatchRef.current({ type: "push", payload });
    },
    [],
  );
  const update = useCallback(
    (payload: DanmakuUpdatePayload) => {
      window.electronAPI?.danmakuUpdate?.(payload);
      dispatchRef.current({ type: "update", payload });
    },
    [],
  );
  const correct = useCallback(
    (payload: DanmakuCorrectPayload) => {
      window.electronAPI?.danmakuCorrect?.(payload);
      dispatchRef.current({ type: "correct", payload });
    },
    [],
  );
  const evict = useCallback(
    (payload: DanmakuEvictPayload) => {
      window.electronAPI?.danmakuEvict?.(payload);
      dispatchRef.current({ type: "evict", payload });
    },
    [],
  );
  const clear = useCallback(() => {
    window.electronAPI?.danmakuClear?.();
    dispatchRef.current({ type: "clear" });
  }, []);

  return { push, update, correct, evict, clear };
}
