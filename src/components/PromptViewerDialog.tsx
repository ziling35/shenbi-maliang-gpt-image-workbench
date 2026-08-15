import { Copy, X } from "lucide-react";
import { useI18n } from "../i18n";
import { copyTextToClipboard } from "../lib/clipboard";
import { ModalPortal, useToast } from "../ui";

export function PromptViewerDialog({ prompt, onClose }: { prompt: string; onClose: () => void }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) return null;
  return (
    <ModalPortal>
      <div className="modal-backdrop" onMouseDown={onClose}>
        <section className="case-modal compact-modal prompt-viewer-dialog" onMouseDown={(event) => event.stopPropagation()}>
          <header>
            <h3>{t("promptViewer.title")}</h3>
            <button type="button" onClick={onClose} aria-label={t("common.close")}><X size={18} /></button>
          </header>
          <pre>{normalizedPrompt}</pre>
          <div className="row-actions">
            <button className="secondary-btn" type="button" onClick={() => void copyTextToClipboard(normalizedPrompt).then((copied) => showToast(copied ? t("promptViewer.copySuccess") : t("promptViewer.copyFailed"), copied ? "success" : "error"))}>
              <Copy size={15} />
              {t("promptViewer.copy")}
            </button>
            <button className="primary-btn" type="button" onClick={onClose}>{t("common.close")}</button>
          </div>
        </section>
      </div>
    </ModalPortal>
  );
}
