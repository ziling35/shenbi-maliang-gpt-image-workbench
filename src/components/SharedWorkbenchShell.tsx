import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUp, Film, FolderOpen, ImagePlus, Images, Lightbulb, Menu, MessageCircle, MessageCirclePlus, PanelLeft, Search, Sparkles, WandSparkles, X } from "lucide-react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useI18n } from "../i18n";
import { cx } from "../lib/cx";
import { buildQualityOptions, buildSizeOptions } from "../lib/imageOptions";
import { COMPOSER_NEW_DRAFT_SCOPE_KEY, useWorkbench } from "../store/workbench";
import { LoginPage } from "../pages/LoginPage";
import { SharedConversationPage } from "../pages/SharedConversationPage";
import { ImageCountStepper, QualityPicker, SizePicker } from "./ImageOptionPickers";
import { ModelPicker, type ModelPickerOption } from "./ModelPicker";
import { PromptOptimizeStyleSelect } from "./PromptOptimizeStyleSelect";
import { ProjectLogo } from "./ProjectLogo";

const guestNavigation = [
  { path: "/cases", labelKey: "sidebar.inspiration", icon: Lightbulb },
  { path: "/assets", labelKey: "sidebar.assets", icon: FolderOpen },
  { path: "/images", labelKey: "sidebar.images", icon: Images },
  { path: "/videos", labelKey: "sidebar.videos", icon: Film },
  { path: "/prompt-templates", labelKey: "sidebar.promptCreation", icon: Sparkles }
] as const;

function GuestWorkbenchPage({ onLogin }: { onLogin: () => void }) {
  const { t } = useI18n();
  const guestConfig = useQuery({ queryKey: ["guest-workbench-config"], queryFn: api.guestWorkbenchConfig });
  const savedDraft = useWorkbench((state) => state.composerDrafts[COMPOSER_NEW_DRAFT_SCOPE_KEY]);
  const upsertComposerDraft = useWorkbench((state) => state.upsertComposerDraft);
  const [draftPrompt, setDraftPrompt] = useState(() => savedDraft?.draftPrompt ?? "");
  const [imageCount, setImageCount] = useState(() => savedDraft?.imageCount ?? 1);
  const [imageModelId, setImageModelId] = useState("");
  const [size, setSize] = useState(() => savedDraft?.size ?? "");
  const [quality, setQuality] = useState(() => savedDraft?.quality ?? "");
  const [promptOptimizeStyle, setPromptOptimizeStyle] = useState(() => savedDraft?.promptInputOptimizeStyle ?? "standard");
  const [promptOptimizerModel, setPromptOptimizerModel] = useState(() => window.localStorage.getItem("gpt-image.prompt-optimizer-model") ?? "system");

  const providers = guestConfig.data?.providers ?? [];
  const currentProvider = useMemo(
    () => providers.find((provider) => provider.id === imageModelId) ?? providers[0],
    [imageModelId, providers]
  );
  const sizeOptions = useMemo(() => buildSizeOptions(currentProvider?.sizes ?? []), [currentProvider]);
  const qualityOptions = useMemo(() => buildQualityOptions(currentProvider?.qualities ?? []), [currentProvider]);
  const imageModelOptions = useMemo<ModelPickerOption[]>(() => providers.map((provider) => ({
    value: provider.id,
    label: provider.virtual ? provider.name : provider.model,
    description: provider.virtual ? "根据后台路由自动选择" : provider.name,
    group: provider.virtual ? "自动" : provider.channel === "api" ? "API" : provider.channel === "cpa" ? "CPA" : "ChatGPT Web"
  })), [providers]);
  const promptOptimizerModelOptions = useMemo<ModelPickerOption[]>(() => [
    {
      value: "system",
      label: "跟随系统",
      description: guestConfig.data?.promptOptimizerModels.defaultSelection
        ? `${guestConfig.data.promptOptimizerModels.defaultSelection.providerName} · ${guestConfig.data.promptOptimizerModels.defaultSelection.model}`
        : "使用管理员默认配置"
    },
    ...(guestConfig.data?.promptOptimizerModels.providers.flatMap((provider) => provider.models.map((model) => ({
      value: `${provider.providerId}\u0000${model}`,
      label: model,
      description: provider.providerName,
      group: provider.providerName
    }))) ?? [])
  ], [guestConfig.data?.promptOptimizerModels]);

  useEffect(() => {
    if (!currentProvider) return;
    if (imageModelId !== currentProvider.id) setImageModelId(currentProvider.id);
    setSize((value) => (value && sizeOptions.some((option) => option.value === value) ? value : ""));
    setQuality((value) => {
      if (value && qualityOptions.some((option) => option.value === value)) return value;
      return currentProvider.defaultQuality && qualityOptions.some((option) => option.value === currentProvider.defaultQuality)
        ? currentProvider.defaultQuality
        : qualityOptions[0]?.value ?? "";
    });
  }, [currentProvider, imageModelId, qualityOptions, sizeOptions]);

  useEffect(() => {
    if (promptOptimizerModelOptions.some((option) => option.value === promptOptimizerModel)) return;
    setPromptOptimizerModel("system");
  }, [promptOptimizerModel, promptOptimizerModelOptions]);

  const saveDraft = () => {
    upsertComposerDraft(COMPOSER_NEW_DRAFT_SCOPE_KEY, {
      draftPrompt,
      imageCount,
      size,
      quality,
      promptInputOptimizeStyle: promptOptimizeStyle
    });
  };

  const requestLoginForGeneration = () => {
    saveDraft();
    onLogin();
  };

  useEffect(() => {
    const handleLiveAction = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; prompt?: string; providerId?: string; size?: string; quality?: string; imageCount?: number }>).detail;
      if (!detail || !["set_prompt", "demo_generate", "inspect_state"].includes(String(detail.type))) return;
      if (detail.prompt) setDraftPrompt(detail.prompt);
      if (detail.providerId) setImageModelId(detail.providerId);
      if (detail.size) setSize(detail.size);
      if (detail.quality) setQuality(detail.quality);
      if (Number.isFinite(detail.imageCount)) setImageCount(Math.max(1, Math.min(4, Number(detail.imageCount))));
      window.parent.postMessage({ source: "lingtu-live-demo", type: "action_applied", action: detail.type, prompt: detail.prompt || "", guest: true }, "*");
      if (detail.type === "demo_generate") window.setTimeout(requestLoginForGeneration, 250);
      if (detail.type === "inspect_state") window.parent.postMessage({ source: "lingtu-live-demo", type: "platform_state", loggedIn: false, busy: false, page: window.location.pathname, at: Date.now() }, "*");
    };
    window.addEventListener("lingtu-live-action", handleLiveAction);
    return () => window.removeEventListener("lingtu-live-action", handleLiveAction);
  }, [draftPrompt, imageCount, onLogin, promptOptimizeStyle, quality, size, upsertComposerDraft]);

  return (
    <section className="guest-workbench-page">
      <div className="guest-workbench-intro guest-workbench-intro-rich">
        <ProjectLogo className="guest-workbench-logo" />
        <div className="guest-workbench-copy">
          <p className="guest-workbench-eyebrow">AI 图像创作工作台</p>
          <h1>把灵感变成画面</h1>
          <p>先描述你想创作的内容，选择模型与画面参数；提交生成时再登录即可。</p>
        </div>
        <div className="guest-prompt-examples" aria-label="提示词示例">
          {["晨雾中的江南水乡，电影感航拍", "极简科技产品广告，柔和棚拍光", "治愈系插画，一只在书店看书的橘猫"].map((prompt) => (
            <button key={prompt} type="button" onClick={() => setDraftPrompt(prompt)}>{prompt}</button>
          ))}
        </div>
        <form
          className="composer guest-composer"
          onSubmit={(event) => {
            event.preventDefault();
            if (draftPrompt.trim()) requestLoginForGeneration();
          }}
        >
          <div className="composer-textarea-shell">
            <textarea
              value={draftPrompt}
              onChange={(event) => setDraftPrompt(event.target.value)}
              placeholder={t("chat.placeholder.new")}
              rows={1}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                event.preventDefault();
                if (draftPrompt.trim()) requestLoginForGeneration();
              }}
            />
          </div>
          <div className="composer-actions">
            <div className="composer-action-row composer-action-primary">
              <button className="composer-tool-btn" type="button" disabled aria-label="登录后可添加参考图" data-tooltip="登录后可添加参考图">
                <ImagePlus size={21} />
              </button>
              <ModelPicker value={imageModelId} options={imageModelOptions} onChange={setImageModelId} kind="image" disabled={guestConfig.isLoading || imageModelOptions.length === 0} />
              {sizeOptions.length > 0 ? <SizePicker value={size} options={sizeOptions} onChange={setSize} /> : null}
              {qualityOptions.length > 0 ? <QualityPicker value={quality} options={qualityOptions} onChange={setQuality} /> : null}
              <ImageCountStepper value={imageCount} onChange={setImageCount} />
              <span className="composer-action-spacer" />
              <button className="send-btn" type="submit" disabled={!draftPrompt.trim()} aria-label={t("composer.send")} data-tooltip={t("composer.send")}>
                <ArrowUp size={22} />
              </button>
            </div>
            <div className="composer-action-row composer-action-secondary guest-composer-secondary">
              <button
                type="button"
                className="composer-tool-btn"
                disabled={!draftPrompt.trim()}
                aria-label="优化提示词"
                data-tooltip="优化提示词"
                onClick={requestLoginForGeneration}
              >
                <WandSparkles size={17} />
              </button>
              <PromptOptimizeStyleSelect value={promptOptimizeStyle} onChange={setPromptOptimizeStyle} className="composer-prompt-template-style-select" menuClassName="composer-prompt-template-style-menu" menuPlacement="top" menuWidth={260} />
              <ModelPicker
                value={promptOptimizerModel}
                options={promptOptimizerModelOptions}
                onChange={(value) => {
                  setPromptOptimizerModel(value);
                  window.localStorage.setItem("gpt-image.prompt-optimizer-model", value);
                }}
                kind="prompt"
                disabled={guestConfig.isLoading}
              />
              <span className="composer-action-spacer" />
              <span className="guest-composer-login-hint">登录后开始生成与扣费</span>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}

export function SharedWorkbenchShell() {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [collapsedToggleVisible, setCollapsedToggleVisible] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginNextPath, setLoginNextPath] = useState("");

  const openLogin = (next = "") => {
    setLoginNextPath(next);
    setLoginOpen(true);
    setMobileMenuOpen(false);
  };

  const closeLogin = () => setLoginOpen(false);

  return (
    <div className={cx("app-shell", "shared-guest-shell", sidebarCollapsed && "sidebar-collapsed", "sidebar-motion-expanded")}>
      <button className="mobile-menu-btn" type="button" onClick={() => setMobileMenuOpen(true)} aria-label={t("sidebar.openMenu")}>
        <Menu size={20} />
      </button>
      <aside
        className={cx("sidebar", mobileMenuOpen && "open", collapsedToggleVisible && "collapsed-toggle-visible")}
        onMouseEnter={() => {
          if (sidebarCollapsed) setCollapsedToggleVisible(true);
        }}
        onMouseMove={() => {
          if (sidebarCollapsed && !collapsedToggleVisible) setCollapsedToggleVisible(true);
        }}
        onMouseLeave={() => setCollapsedToggleVisible(false)}
      >
        <div className="sidebar-main-scroll">
          <div className="sidebar-fixed">
            <div className="sidebar-head">
              <div className="brand-row">
                <button className="sidebar-logo-button" type="button" aria-label={t("sidebar.scrollTop")}>
                  <ProjectLogo className="sidebar-logo" />
                </button>
              </div>
              <div className="sidebar-head-actions">
                {!sidebarCollapsed ? (
                  <button className="sidebar-head-search" type="button" aria-label={t("sidebar.globalSearch")} onClick={() => openLogin(location.pathname)}>
                    <Search size={18} />
                  </button>
                ) : null}
                <button
                  className="sidebar-toggle"
                  type="button"
                  onClick={() => {
                    setSidebarCollapsed((value) => !value);
                    setCollapsedToggleVisible(false);
                  }}
                  aria-label={sidebarCollapsed ? t("sidebar.openSidebar") : t("sidebar.closeSidebar")}
                  data-sidebar-tip={sidebarCollapsed ? t("sidebar.openSidebar") : undefined}
                >
                  <PanelLeft size={18} aria-hidden="true" />
                </button>
                <button className="icon-btn mobile-only" type="button" onClick={() => setMobileMenuOpen(false)} aria-label={t("sidebar.closeMenu")}>
                  <X size={18} />
                </button>
              </div>
            </div>
            <nav className="main-nav-actions">
              <button className="nav-item" type="button" onClick={() => openLogin("/")}>
                <MessageCirclePlus size={18} />
                <span>{t("sidebar.newConversation")}</span>
              </button>
              {sidebarCollapsed ? (
                <button className="nav-item" type="button" aria-label={t("sidebar.globalSearch")} onClick={() => openLogin(location.pathname)}>
                  <Search size={18} />
                  <span>{t("sidebar.globalSearch")}</span>
                </button>
              ) : null}
            </nav>
          </div>
          <div className="sidebar-scroll">
            <nav className="main-nav">
              {guestNavigation.map((item) => {
                const Icon = item.icon;
                return (
                  <button className="nav-item" type="button" key={item.path} onClick={() => openLogin(item.path)}>
                    <Icon size={18} />
                    <span>{t(item.labelKey)}</span>
                  </button>
                );
              })}
            </nav>
            <section className="recent-section session-group shared-guest-history">
              <div className="session-group-title shared-guest-history-title">
                <h2>{t("sidebar.recent")}</h2>
              </div>
              <div className="shared-guest-history-empty">
                <MessageCircle size={18} />
                <span>{t("sharedConversation.loginForHistory")}</span>
              </div>
            </section>
          </div>
        </div>
        <div className="user-footer shared-guest-login-footer">
          <button className="user-footer-panel shared-guest-login-button" type="button" onClick={() => openLogin()}>
            <span>{t("login.login")}</span>
          </button>
        </div>
      </aside>
      {mobileMenuOpen ? <div className="scrim" onClick={() => setMobileMenuOpen(false)} /> : null}
      <main className="content">
        <Routes>
          <Route path="/share/:token" element={<SharedConversationPage authenticated={false} />} />
          <Route path="*" element={<GuestWorkbenchPage onLogin={() => openLogin(location.pathname)} />} />
        </Routes>
      </main>
      {loginOpen ? (
        <div className="guest-login-dialog" role="dialog" aria-modal="true" aria-label={t("login.login")}>
          <button className="guest-login-dialog-close" type="button" onClick={closeLogin} aria-label={t("sidebar.closeMenu")}>
            <X size={20} />
          </button>
          <div className="guest-login-dialog-card">
            <h2>{t("login.login")}</h2>
          <LoginPage
            className="guest-login-page"
            onClose={closeLogin}
            onAuthenticated={() => {
              const nextPath = loginNextPath;
              closeLogin();
              if (nextPath) navigate(nextPath, { replace: true });
            }}
          />
          </div>
        </div>
      ) : null}
    </div>
  );
}
