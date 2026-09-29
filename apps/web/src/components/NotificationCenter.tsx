import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Notification, NotificationEvent, NotificationSource } from "@wrapt/contracts";
import { notificationEventSchema } from "@wrapt/contracts";
import { CloseIcon } from "./icons";
import { apiClient } from "../lib/apiClient";
import { wraptQueries } from "../lib/queryOptions";
import { subscribeUiToasts, type UiToast } from "../lib/uiToasts";

const important = (item: Notification) => item.severity === "error" || item.kind === "agent.input-required" || item.kind === "agent.plan-ready" || item.kind === "agent.completed" || item.kind === "terminal.failed";
const TOAST_EXIT_DURATION = 260;
const MAX_TIMER_DELAY = 2_147_000_000;
/** Dedup-Gedächtnis für neue und bereits bekannte Ereignisse. */
const SEEN_RETENTION = 50;
type ToastEntry = { identity: string; notification: Notification; leaving: boolean };
type UiToastEntry = { toast: UiToast; leaving: boolean };

const notificationSourceLabels: Record<NotificationSource, string> = {
  hermes: "Hermes",
  t3: "T3 Code",
  opencode: "OpenCode",
  codex: "Codex",
  claude: "Claude Code",
  terminal: "Terminal",
  wrapt: "Wrapt",
  workbench: "Wrapt",
  update: "Updates",
};

export function toastIdentity(notification: Notification): string {
  return `${notification.id}:${notification.createdAt}`;
}

export function toastDurationMilliseconds(seconds: number | undefined): number {
  const duration = typeof seconds === "number" && Number.isFinite(seconds) ? seconds : 3;
  return Math.max(1_000, duration * 1_000);
}

export function shouldToastNotification(notification: Notification, options: { toastsEnabled: boolean; sourceToastEnabled: boolean; alreadySeen: boolean }): boolean {
  return options.toastsEnabled && options.sourceToastEnabled && important(notification) && !options.alreadySeen;
}

/** Standardmäßig bleibt der neueste Toast sichtbar; bei zwei Quellen bleiben zwei stehen. */
export function selectVisibleToasts(entries: ToastEntry[]): ToastEntry[] {
  if (entries.length <= 1) return entries;
  const newest = entries[entries.length - 1]!;
  const otherSource = [...entries.slice(0, -1)].reverse().find((entry) => entry.notification.source !== newest.notification.source);
  return otherSource ? [otherSource, newest] : [newest];
}

/** Pointer-Drag nach rechts schließt den Toast, ohne einen Klick auf den Inhalt auszulösen. */
function useToastSwipe(onDismiss: () => void) {
  const start = useRef<{ x: number; y: number; at: number } | null>(null);
  const distance = useRef(0);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const pointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    start.current = { x: event.clientX, y: event.clientY, at: performance.now() };
    distance.current = 0;
    suppressClick.current = false;
    setOffset(0);
  };

  const pointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const origin = start.current;
    if (!origin) return;
    const deltaX = event.clientX - origin.x;
    const deltaY = event.clientY - origin.y;
    if (!dragging && Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 6) return;
    if (!dragging && Math.abs(deltaY) > Math.abs(deltaX)) {
      start.current = null;
      return;
    }
    suppressClick.current = true;
    distance.current = Math.max(0, deltaX);
    if (deltaX > 6 && !event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    setOffset(distance.current);
  };

  const pointerUp = () => {
    const origin = start.current;
    if (!origin) return;
    const velocity = distance.current / Math.max(1, performance.now() - origin.at);
    if (distance.current > 72 || (distance.current > 28 && velocity > 0.7)) onDismiss();
    else setOffset(0);
    start.current = null;
    setDragging(false);
  };

  const pointerCancel = () => {
    start.current = null;
    distance.current = 0;
    suppressClick.current = false;
    setOffset(0);
    setDragging(false);
  };

  const consumeClick = () => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  };

  return { offset, dragging, pointerDown, pointerMove, pointerUp, pointerCancel, consumeClick };
}

function scheduleDismiss(timers: Map<string, number>, id: string, delay: number, dismiss: () => void) {
  const deadline = Date.now() + delay;
  const schedule = () => {
    const remaining = deadline - Date.now();
    const timer = window.setTimeout(() => {
      if (Date.now() < deadline) schedule();
      else {
        timers.delete(id);
        dismiss();
      }
    }, Math.max(0, Math.min(remaining, MAX_TIMER_DELAY)));
    timers.set(id, timer);
  };
  schedule();
}

export function NotificationCenter() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [uiToasts, setUiToasts] = useState<UiToastEntry[]>([]);
  const seen = useRef(new Set<string>());
  const initialized = useRef(false);
  const pendingEvents = useRef(new Map<string, Notification>());
  const leaving = useRef(new Set<string>());
  const lifecycleTimers = useRef(new Map<string, number>());
  const uiLeaving = useRef(new Set<string>());
  const uiLifecycleTimers = useRef(new Map<string, number>());
  const toastsRef = useRef<ToastEntry[]>([]);
  const queryClient = useQueryClient();
  const query = useQuery(wraptQueries.notifications());
  const settings = useQuery(wraptQueries.notificationSettings());

  const clearLifecycleTimer = useCallback((identity: string) => {
    const timer = lifecycleTimers.current.get(identity);
    if (timer !== undefined) { window.clearTimeout(timer); lifecycleTimers.current.delete(identity); }
  }, []);
  const removeToast = useCallback((identity: string) => {
    clearLifecycleTimer(identity);
    leaving.current.delete(identity);
    setToasts((current) => current.filter((toast) => toast.identity !== identity));
  }, [clearLifecycleTimer]);
  const dismissToast = useCallback((identity: string) => {
    if (leaving.current.has(identity)) return;
    clearLifecycleTimer(identity);
    leaving.current.add(identity);
    setToasts((current) => current.map((toast) => toast.identity === identity ? { ...toast, leaving: true } : toast));
    const timer = window.setTimeout(() => removeToast(identity), TOAST_EXIT_DURATION);
    lifecycleTimers.current.set(identity, timer);
  }, [clearLifecycleTimer, removeToast]);
  const dismissToastByNotificationId = useCallback((id: string) => {
    const entry = toastsRef.current.find((item) => item.notification.id === id);
    if (entry) dismissToast(entry.identity);
    for (const [identity, item] of pendingEvents.current) {
      if (item.id === id) pendingEvents.current.delete(identity);
    }
  }, [dismissToast]);

  useEffect(() => () => {
    lifecycleTimers.current.forEach((timer) => window.clearTimeout(timer));
    uiLifecycleTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    toastsRef.current = toasts;
    const visible = new Set(toasts.map((toast) => toast.identity));
    lifecycleTimers.current.forEach((timer, identity) => {
      if (!visible.has(identity)) { window.clearTimeout(timer); lifecycleTimers.current.delete(identity); }
    });
    leaving.current.forEach((identity) => { if (!visible.has(identity)) leaving.current.delete(identity); });
  }, [toasts]);

  const showToast = useCallback((item: Notification) => {
    const identity = toastIdentity(item);
    if (seen.current.has(identity)) return;
    const preferences = settings.data?.preferences;
    if (!initialized.current || !preferences) {
      pendingEvents.current.set(identity, item);
      while (pendingEvents.current.size > SEEN_RETENTION) pendingEvents.current.delete(pendingEvents.current.keys().next().value!);
      return;
    }
    seen.current.add(identity);
    if (seen.current.size > SEEN_RETENTION) seen.current = new Set([...seen.current].slice(-SEEN_RETENTION));
    const source = preferences.sources[item.source] ?? preferences.sources.wrapt;
    if (!shouldToastNotification(item, { toastsEnabled: preferences.toastsEnabled, sourceToastEnabled: source.toast, alreadySeen: false })) return;
    setToasts((current) => selectVisibleToasts([...current.filter((toast) => toast.identity !== identity), { identity, notification: item, leaving: false }]));
    scheduleDismiss(lifecycleTimers.current, identity, toastDurationMilliseconds(preferences.toastDurationSeconds), () => dismissToast(identity));
  }, [dismissToast, settings.data?.preferences]);

  const flushPendingEvents = useCallback(() => {
    if (!initialized.current || !settings.data?.preferences) return;
    const pending = [...pendingEvents.current.values()];
    pendingEvents.current.clear();
    pending.forEach(showToast);
  }, [settings.data?.preferences, showToast]);

  const removeUiToast = useCallback((id: string) => {
    const timer = uiLifecycleTimers.current.get(id);
    if (timer !== undefined) { window.clearTimeout(timer); uiLifecycleTimers.current.delete(id); }
    uiLeaving.current.delete(id);
    setUiToasts((current) => current.filter((entry) => entry.toast.id !== id));
  }, []);
  const dismissUiToast = useCallback((id: string) => {
    if (uiLeaving.current.has(id)) return;
    const timer = uiLifecycleTimers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    uiLeaving.current.add(id);
    setUiToasts((current) => current.map((entry) => entry.toast.id === id ? { ...entry, leaving: true } : entry));
    const exitTimer = window.setTimeout(() => removeUiToast(id), TOAST_EXIT_DURATION);
    uiLifecycleTimers.current.set(id, exitTimer);
  }, [removeUiToast]);

  useEffect(() => subscribeUiToasts((toast) => {
    setUiToasts((current) => [...current.filter((entry) => entry.toast.id !== toast.id), { toast, leaving: false }].slice(-3));
    scheduleDismiss(uiLifecycleTimers.current, toast.id, toastDurationMilliseconds(settings.data?.preferences.toastDurationSeconds), () => dismissUiToast(toast.id));
  }), [dismissUiToast, settings.data?.preferences.toastDurationSeconds]);

  useEffect(() => {
    if (!query.isSuccess || !query.data) return;
    const notifications = query.data.notifications ?? [];
    if (!initialized.current) {
      notifications.forEach((item) => seen.current.add(toastIdentity(item)));
      initialized.current = true;
      flushPendingEvents();
      return;
    }
    notifications.forEach(showToast);
  }, [flushPendingEvents, query.data, query.isSuccess, showToast]);

  useEffect(flushPendingEvents, [flushPendingEvents]);

  const showToastRef = useRef(showToast);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry = 0;
    let timer = 0;
    let closed = false;
    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/api/v1/notifications/ws`);
      socket.onopen = () => { retry = 0; };
      socket.onmessage = (event) => {
        let raw: unknown;
        try { raw = JSON.parse(String(event.data)); } catch { return; }
        const parsed = notificationEventSchema.safeParse(raw);
        if (!parsed.success) return;
        const message: NotificationEvent = parsed.data;
        if (message.type === "notification.created") showToastRef.current(message.notification);
        if (message.type === "notification.removed") dismissToastByNotificationId(message.id);
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      };
      socket.onclose = () => { if (!closed) timer = window.setTimeout(connect, Math.min(15_000, 1_000 * 2 ** retry++)); };
    };
    connect();
    return () => { closed = true; window.clearTimeout(timer); socket?.close(); };
  }, [dismissToastByNotificationId, queryClient]);

  const open = (notification: Notification) => {
    dismissToast(toastIdentity(notification));
    void apiClient.patchNotification(notification.id, { read: true })
      .then(() => queryClient.invalidateQueries({ queryKey: ["notifications"] }))
      .catch(() => undefined);
    if (notification.link) window.location.assign(notification.link);
  };

  return <div className="notification-toasts" aria-live="polite" aria-relevant="additions">
    {toasts.map(({ identity, notification, leaving: isLeaving }) => <Toast key={identity} notification={notification} leaving={isLeaving} duration={settings.data?.preferences.toastDurationSeconds ?? 3} onOpen={() => open(notification)} onDismiss={() => dismissToast(identity)} />)}
    {uiToasts.map(({ toast, leaving: isLeaving }) => <UiToastItem key={toast.id} toast={toast} leaving={isLeaving} duration={settings.data?.preferences.toastDurationSeconds ?? 3} onDismiss={() => dismissUiToast(toast.id)} />)}
  </div>;
}

function severityLabel(severity: Notification["severity"] | UiToast["severity"]): string {
  if (severity === "error") return "Fehler";
  if (severity === "warning" || severity === "warn") return "Warnung";
  if (severity === "success") return "Erledigt";
  return "Hinweis";
}

function Toast({ notification, leaving, duration, onOpen, onDismiss }: { notification: Notification; leaving: boolean; duration: number; onOpen: () => void; onDismiss: () => void }) {
  const swipe = useToastSwipe(onDismiss);
  const style = { transform: `translateX(${swipe.offset}px)`, opacity: Math.max(.2, 1 - swipe.offset / 210), transition: swipe.dragging ? "none" : undefined, "--toast-duration": `${duration}s` } as CSSProperties;
  return <article className={`notification-toast is-${notification.severity}${leaving ? " is-leaving" : ""}`} style={style} role={notification.severity === "error" ? "alert" : undefined}
    onPointerDown={swipe.pointerDown} onPointerMove={swipe.pointerMove} onPointerUp={swipe.pointerUp} onPointerCancel={swipe.pointerCancel}>
    <div className="notification-toast-surface">
      <span className="notification-toast-accent" aria-hidden="true" />
      <button type="button" className="notification-toast-main" onClick={(event) => { if (swipe.consumeClick()) event.preventDefault(); else onOpen(); }}>
        <span className="notification-toast-meta"><span>{notificationSourceLabels[notification.source] ?? notification.source}</span><span>{severityLabel(notification.severity)}</span></span>
        <strong>{notification.title}</strong>
        <p>{notification.body}</p>
      </button>
      <button type="button" className="notification-toast-close" onClick={onDismiss} aria-label="Benachrichtigung schließen"><CloseIcon className="h-4 w-4" /></button>
      <span className="notification-toast-progress" aria-hidden="true" />
    </div>
  </article>;
}

function UiToastItem({ toast, leaving, duration, onDismiss }: { toast: UiToast; leaving: boolean; duration: number; onDismiss: () => void }) {
  const swipe = useToastSwipe(onDismiss);
  const style = { transform: `translateX(${swipe.offset}px)`, opacity: Math.max(.2, 1 - swipe.offset / 210), transition: swipe.dragging ? "none" : undefined, "--toast-duration": `${duration}s` } as CSSProperties;
  return <article className={`notification-toast is-${toast.severity}${leaving ? " is-leaving" : ""}`} style={style}
    onPointerDown={swipe.pointerDown} onPointerMove={swipe.pointerMove} onPointerUp={swipe.pointerUp} onPointerCancel={swipe.pointerCancel}>
    <div className="notification-toast-surface">
      <span className="notification-toast-accent" aria-hidden="true" />
      <button type="button" className="notification-toast-main" onClick={(event) => { if (swipe.consumeClick()) event.preventDefault(); else onDismiss(); }}>
        <span className="notification-toast-meta"><span>Wrapt</span><span>{severityLabel(toast.severity)}</span></span>
        <strong>{toast.title}</strong>
        {toast.body ? <p>{toast.body}</p> : null}
      </button>
      <button type="button" className="notification-toast-close" onClick={onDismiss} aria-label="Hinweis schließen"><CloseIcon className="h-4 w-4" /></button>
      <span className="notification-toast-progress" aria-hidden="true" />
    </div>
  </article>;
}
