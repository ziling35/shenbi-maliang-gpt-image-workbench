import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import { SharedWorkbenchShell } from "./components/SharedWorkbenchShell";
import { WorkbenchShell } from "./components/WorkbenchShell";
import { useAppearanceMode } from "./hooks/useAppearanceMode";
import { useI18n, useSyncI18nPreference } from "./i18n";
import { useDocumentBranding } from "./lib/branding";
import { LoginPage } from "./pages/LoginPage";
import { ToastProvider } from "./ui";

const LIVE_ACTION_STORAGE_KEY = "lingtu.live.pending-action";

function acknowledgeLiveAction(type: string, detail: Record<string, unknown> = {}) {
  if (window.parent === window) return;
  window.parent.postMessage({ source: "lingtu-live-demo", type, ...detail }, "*");
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const branding = useQuery({ queryKey: ["branding"], queryFn: api.branding });
  useQuery({ queryKey: ["registration-status"], queryFn: api.registrationStatus, staleTime: 5 * 60 * 1000 });
  const loggedIn = Boolean(me.data?.user);
  const sharedRoute = /^\/share\/[^/]+\/?$/.test(location.pathname);
  const searchParams = new URLSearchParams(location.search);
  const authMode = searchParams.get("auth") === "register" ? "register" : searchParams.get("auth") === "login" ? "login" : null;
  const { t } = useI18n();

  useEffect(() => {
    const handleLiveDirectorMessage = (event: MessageEvent) => {
      const payload = event.data;
      if (!payload || payload.source !== "lingtu-live-director" || event.source !== window.parent || window.parent === window) return;
      try {
        const parentOrigin = new URL(document.referrer).origin;
        if (!parentOrigin || event.origin !== parentOrigin) return;
      } catch {
        return;
      }
      const feature = String(payload.feature || "");
      const targets: Record<string, string> = {
        create: "/",
        portraitEdit: "/",
        outfitChange: "/",
        quality4k: "/",
        productDetail: "/cases",
        localEdit: "/",
        inspiration: "/cases",
        gallery: "/images",
        promptSystem: "/prompt-templates"
      };
      const target = targets[feature] || "";
      if (target && location.pathname !== target) {
        sessionStorage.setItem(LIVE_ACTION_STORAGE_KEY, JSON.stringify(payload));
        acknowledgeLiveAction("action_received", { action: payload.type, feature, navigating: true });
        navigate(`${target}?live_demo=1`);
        return;
      }
      if (["set_prompt", "demo_generate", "edit_latest_image", "inspect_state"].includes(String(payload.type))) {
        window.dispatchEvent(new CustomEvent("lingtu-live-action", { detail: payload }));
      }
      acknowledgeLiveAction("action_received", { action: payload.type, feature, navigating: false });
    };
    window.addEventListener("message", handleLiveDirectorMessage);
    return () => window.removeEventListener("message", handleLiveDirectorMessage);
  }, [location.pathname, navigate]);

  useEffect(() => {
    const pending = sessionStorage.getItem(LIVE_ACTION_STORAGE_KEY);
    if (!pending) return;
    sessionStorage.removeItem(LIVE_ACTION_STORAGE_KEY);
    try {
      const payload = JSON.parse(pending);
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("lingtu-live-action", { detail: payload })), 100);
      acknowledgeLiveAction("action_resumed", { action: payload.type, feature: payload.feature });
    } catch {}
  }, [location.pathname]);

  useEffect(() => {
    if (window.parent === window || searchParams.get("live_demo") !== "1") return;
    window.parent.postMessage({ source: "lingtu-live-demo", type: "ready" }, "*");
  }, [location.pathname]);

  const safeNextPath = () => {
    const next = searchParams.get("next") ?? "";
    if (!next.startsWith("/") || next.startsWith("//")) return "";
    try {
      const target = new URL(next, window.location.origin);
      if (target.origin !== window.location.origin) return "";
      const allowedPages = ["/", "/cases", "/assets", "/images", "/videos", "/prompt-templates", "/help"];
      if (!allowedPages.includes(target.pathname) && target.pathname !== "/oauth/authorize") return "";
      return `${target.pathname}${target.search}`;
    } catch {
      return "";
    }
  };
  const authenticatedNextPath = safeNextPath();

  useDocumentBranding(branding.data);
  useAppearanceMode({ enabled: loggedIn, clearOnDisable: true, preferredMode: me.data?.user?.appearanceMode });
  useSyncI18nPreference(me.data?.user?.preferences.language, loggedIn && !me.isLoading);

  useEffect(() => {
    if (!me.isLoading && loggedIn && authMode && authenticatedNextPath.startsWith("/oauth/authorize")) {
      window.location.replace(authenticatedNextPath);
    }
  }, [authMode, authenticatedNextPath, loggedIn, me.isLoading]);

  const cleanSharedLocation = () => {
    const params = new URLSearchParams(location.search);
    params.delete("auth");
    params.delete("next");
    return `${location.pathname}${params.size > 0 ? `?${params.toString()}` : ""}`;
  };
  if (me.isLoading) {
    return (
      <ToastProvider>
        <div className="center-screen">{t("common.loadingEllipsis")}</div>
      </ToastProvider>
    );
  }

  if (loggedIn && authMode && authenticatedNextPath.startsWith("/oauth/authorize")) {
    return (
      <ToastProvider>
        <div className="center-screen">{t("common.loadingEllipsis")}</div>
      </ToastProvider>
    );
  }

  if (loggedIn && authMode && authenticatedNextPath) {
    return <Navigate to={authenticatedNextPath} replace />;
  }

  if (sharedRoute) {
    if (loggedIn && authMode) return <Navigate to={cleanSharedLocation()} replace />;
    if (!loggedIn && authMode) {
      return (
        <ToastProvider>
          <LoginPage
            initialMode={authMode}
            onAuthenticated={() => {
              const next = safeNextPath();
              if (next.startsWith("/oauth/authorize")) window.location.assign(next);
              else navigate(next || cleanSharedLocation(), { replace: true });
            }}
          />
        </ToastProvider>
      );
    }
    return (
      <ToastProvider>
        {me.data?.user ? <WorkbenchShell user={me.data.user} /> : <SharedWorkbenchShell />}
      </ToastProvider>
    );
  }

  if (!me.data?.user) {
    if (!authMode) {
      return (
        <ToastProvider>
          <SharedWorkbenchShell />
        </ToastProvider>
      );
    }
    return (
      <ToastProvider>
        <LoginPage
          initialMode={authMode}
          onAuthenticated={() => {
            const next = safeNextPath();
            if (next.startsWith("/oauth/authorize")) window.location.assign(next);
            else navigate(next || location.pathname, { replace: true });
          }}
        />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <WorkbenchShell user={me.data.user} />
    </ToastProvider>
  );
}
