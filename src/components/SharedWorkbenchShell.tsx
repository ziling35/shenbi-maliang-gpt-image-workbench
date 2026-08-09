import { useState } from "react";
import { ArrowUp, FolderOpen, ImagePlus, Images, Lightbulb, Menu, MessageCircle, MessageCirclePlus, PanelLeft, Search, Sparkles, X } from "lucide-react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "../i18n";
import { cx } from "../lib/cx";
import { LoginPage } from "../pages/LoginPage";
import { SharedConversationPage } from "../pages/SharedConversationPage";
import { ProjectLogo } from "./ProjectLogo";

const guestNavigation = [
  { path: "/cases", labelKey: "sidebar.inspiration", icon: Lightbulb },
  { path: "/assets", labelKey: "sidebar.assets", icon: FolderOpen },
  { path: "/images", labelKey: "sidebar.images", icon: Images },
  { path: "/prompt-templates", labelKey: "sidebar.promptCreation", icon: Sparkles }
] as const;

function GuestWorkbenchPage({ onLogin }: { onLogin: () => void }) {
  const { t } = useI18n();

  return (
    <section className="guest-workbench-page">
      <div className="guest-workbench-intro">
        <ProjectLogo className="guest-workbench-logo" />
        <h1>{t("sidebar.newConversation")}</h1>
        <button className="guest-composer" type="button" onClick={onLogin}>
          <span className="guest-composer-placeholder">{t("chat.placeholder.new")}</span>
          <span className="guest-composer-toolbar" aria-hidden="true">
            <span className="guest-composer-attach">
              <ImagePlus size={20} />
            </span>
            <span className="guest-composer-send">
              <ArrowUp size={18} />
            </span>
          </span>
        </button>
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
