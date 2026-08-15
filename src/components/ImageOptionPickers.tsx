import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Image as ImageIcon, ImagePlus, Maximize2, Ratio } from "lucide-react";
import { useI18n, type Translate } from "../i18n";
import { customImageDimensions, customImageDimensionsError, IMAGE_RESOLUTION_TIERS, requestSizeFromSelection, sizeOptionFromValue, type ImageResolutionTier, type QualityOption, type SizeOption } from "../lib/imageOptions";

function sizePreviewStyle(previewRatio?: string, box = 22) {
  const match = previewRatio?.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return { width: box, height: box };
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return { width: box, height: box };
  if (width >= height) {
    return { width: box, height: Math.max(7, Math.round((box * height) / width)) };
  }
  return { width: Math.max(7, Math.round((box * width) / height)), height: box };
}

function sizeOptionLabel(option: SizeOption, t: Translate) {
  return option.labelKey ? t(option.labelKey) : option.label;
}

function sizeOptionDescription(option: SizeOption, t: Translate) {
  if (!option.descriptionKey) return option.description;
  if (option.descriptionKey === "picker.size.customDimensions") return t(option.descriptionKey, { size: option.value });
  return t(option.descriptionKey);
}

function qualityOptionLabel(option: QualityOption, t: Translate) {
  return option.labelKey ? t(option.labelKey) : option.label;
}

function qualityOptionDescription(option: QualityOption, t: Translate) {
  if (!option.descriptionKey) return option.description;
  if (option.descriptionKey === "picker.quality.custom") return t(option.descriptionKey, { quality: option.value });
  return t(option.descriptionKey);
}

export function EditorSizePicker({
  value,
  options,
  onSelect
}: {
  value: string;
  options: SizeOption[];
  onSelect: (option: SizeOption) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const selected = value ? options.find((item) => item.value === value) : null;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!wrapRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div className="editor-size-picker" ref={wrapRef}>
      <button type="button" className="editor-text-btn" onClick={() => setOpen((next) => !next)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="size-trigger-icon" aria-hidden="true">
          {selected ? <span style={sizePreviewStyle(selected.previewRatio, 15)} /> : <Ratio size={15} />}
        </span>
        <span>{selected ? sizeOptionLabel(selected, t) : t("picker.aspectRatio")}</span>
        {selected ? <small>{selected.ratio}</small> : null}
        <ChevronDown size={15} className={open ? "open" : ""} />
      </button>
      {open ? (
        <div className="editor-size-menu" role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "active" : ""}
              onClick={() => {
                setOpen(false);
                onSelect(option);
              }}
            >
              <span className="size-option-icon" aria-hidden="true">
                <span style={sizePreviewStyle(option.previewRatio, 22)} />
              </span>
              <span className="size-option-copy">
                <strong>
                  {sizeOptionLabel(option, t)} {option.ratio}
                </strong>
                <small>{sizeOptionDescription(option, t)}</small>
              </span>
              {option.value === value ? <Check className="size-option-check" size={16} /> : <span />}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SizePicker({
  value,
  options,
  resolutionTier = "1K",
  onChange
}: {
  value: string;
  options: SizeOption[];
  resolutionTier?: ImageResolutionTier;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customWidth, setCustomWidth] = useState(1024);
  const [customHeight, setCustomHeight] = useState(1024);
  const [customError, setCustomError] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const selected = value ? options.find((item) => item.value === value) ?? sizeOptionFromValue(value) : null;
  const selectedDimensions = customImageDimensions(value);
  const visibleOptions = selected && customImageDimensions(selected.value) && !options.some((item) => item.value === selected.value)
    ? [...options, selected]
    : options;

  function openCustomEditor() {
    const dimensions = customImageDimensions(value);
    setCustomWidth(dimensions?.width ?? 1024);
    setCustomHeight(dimensions?.height ?? 1024);
    setCustomError("");
    setCustomOpen(true);
  }

  function applyCustomSize() {
    const error = customImageDimensionsError(customWidth, customHeight);
    if (error) {
      setCustomError(error);
      return;
    }
    onChange(`${customWidth}x${customHeight}`);
    setCustomOpen(false);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!wrapRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div className="size-picker" ref={wrapRef}>
      <button
        type="button"
        className="size-picker-trigger"
        data-tooltip={t("picker.sizeDefaultAuto")}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="size-trigger-icon" aria-hidden="true">
          {selected ? <span style={sizePreviewStyle(selected.previewRatio, 15)} /> : <Ratio size={15} />}
        </span>
        <span>{selectedDimensions ? "自定义" : selected ? sizeOptionLabel(selected, t) : t("picker.aspectRatio")}</span>
        {selected ? <small>{selectedDimensions ? `${selectedDimensions.width}×${selectedDimensions.height}` : selected.ratio}</small> : null}
        <ChevronDown size={15} className={open ? "open" : ""} />
      </button>
      {open ? (
        <div className="size-picker-menu" role="listbox">
          {visibleOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={value && option.value === value ? "active" : ""}
              onClick={() => {
                onChange(option.value === value ? "" : option.value);
                setOpen(false);
              }}
            >
              <span className="size-option-icon" aria-hidden="true">
                <span style={sizePreviewStyle(option.previewRatio, 22)} />
              </span>
              <span className="size-option-copy">
                <strong>{customImageDimensions(option.value) ? `自定义 ${option.value.replace("x", "×")}` : `${sizeOptionLabel(option, t)} ${option.ratio}`}</strong>
                <small>{sizeOptionDescription(option, t)} · {requestSizeFromSelection(option.value, resolutionTier).replace("x", "×")}</small>
              </span>
              {option.value === value ? <Check className="size-option-check" size={16} /> : <span />}
            </button>
          ))}
          <div className="custom-size-section">
            {!customOpen ? (
              <button type="button" className="custom-size-toggle" onClick={openCustomEditor}>
                <span className="size-option-icon" aria-hidden="true"><Maximize2 size={17} /></span>
                <span className="size-option-copy"><strong>自定义分辨率</strong><small>输入具体宽度和高度</small></span>
                <span />
              </button>
            ) : (
              <div className="custom-size-form">
                <div className="custom-size-title"><strong>自定义分辨率</strong><small>64–16384 像素，是否支持取决于当前渠道</small></div>
                <div className="custom-size-inputs">
                  <label>宽度<input type="number" min={64} max={16384} step={1} value={customWidth} onChange={(event) => { setCustomWidth(Number(event.target.value)); setCustomError(""); }} /></label>
                  <span>×</span>
                  <label>高度<input type="number" min={64} max={16384} step={1} value={customHeight} onChange={(event) => { setCustomHeight(Number(event.target.value)); setCustomError(""); }} /></label>
                </div>
                {customError ? <div className="custom-size-error">{customError}</div> : null}
                <div className="custom-size-actions">
                  <button type="button" onClick={() => setCustomOpen(false)}>取消</button>
                  <button type="button" className="primary" onClick={applyCustomSize}>使用此分辨率</button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function QualityPicker({
  value,
  options,
  onChange
}: {
  value: string;
  options: QualityOption[];
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const selected = value ? options.find((item) => item.value === value) : null;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!wrapRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div className="size-picker quality-picker" ref={wrapRef}>
      <button
        type="button"
        className="quality-picker-trigger"
        data-tooltip={t("picker.qualityDefaultAuto")}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="size-trigger-icon quality-trigger-icon" aria-hidden="true">
          <ImageIcon size={15} />
        </span>
        <span>{selected ? qualityOptionLabel(selected, t) : t("picker.quality")}</span>
        <ChevronDown size={15} className={open ? "open" : ""} />
      </button>
      {open ? (
        <div className="size-picker-menu quality-picker-menu" role="listbox">
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={value && option.value === value ? "active" : ""}
              onClick={() => {
                onChange(option.value === value ? "" : option.value);
                setOpen(false);
              }}
            >
              <span className="quality-option-copy">
                <strong>{qualityOptionLabel(option, t)}</strong>
                <small>{qualityOptionDescription(option, t)}</small>
              </span>
              {option.value === value ? <Check className="size-option-check" size={16} /> : <span />}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ResolutionPicker({
  value,
  supportedValues,
  actualOutputSize,
  onChange
}: {
  value: ImageResolutionTier;
  supportedValues: ImageResolutionTier[];
  actualOutputSize?: string;
  onChange: (value: ImageResolutionTier) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const descriptions: Record<ImageResolutionTier, string> = {
    "1K": "标准分辨率，生成更快",
    "2K": "高清分辨率，细节更多",
    "4K": "超清分辨率，文件更大"
  };

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!wrapRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div className="size-picker quality-picker resolution-picker" ref={wrapRef}>
      <button type="button" className="quality-picker-trigger" data-tooltip="输出分辨率" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((next) => !next)}>
        <span className="size-trigger-icon quality-trigger-icon" aria-hidden="true"><Maximize2 size={15} /></span>
        <span>{value}</span>
        <ChevronDown size={15} className={open ? "open" : ""} />
      </button>
      {open ? (
        <div className="size-picker-menu quality-picker-menu" role="listbox">
          {supportedValues.map((option) => (
            <button key={option} type="button" role="option" aria-selected={option === value} className={option === value ? "active" : ""} onClick={() => { onChange(option); setOpen(false); }}>
              <span className="quality-option-copy"><strong>{option}</strong><small>{descriptions[option]}</small></span>
              {option === value ? <Check className="size-option-check" size={16} /> : <span />}
            </button>
          ))}
          {actualOutputSize ? <div className="resolution-picker-output">实际请求尺寸：{actualOutputSize.replace("x", "×")}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

export function ImageCountStepper({
  value,
  onChange,
  min = 1,
  max = 10
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  const { t } = useI18n();
  const clamp = (nextValue: number) => (Number.isFinite(nextValue) ? Math.max(min, Math.min(max, nextValue)) : min);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({ top: -10000, left: -10000 });
  const selectedValue = clamp(value || min);
  const options = Array.from({ length: Math.max(0, max - min + 1) }, (_, index) => min + index);

  function updateMenuPosition() {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.ceil(menuRef.current?.offsetWidth ?? rect.width);
    const menuHeight = menuRef.current?.offsetHeight ?? 272;
    const top = Math.max(12, rect.top - menuHeight - 8);
    const maxLeft = Math.max(12, window.innerWidth - width - 12);
    const left = Math.min(Math.max(12, rect.left), maxLeft);
    setMenuStyle({ top, left });
  }

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!wrapRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    const frame = window.requestAnimationFrame(updateMenuPosition);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
      window.cancelAnimationFrame(frame);
    };
  }, [open]);

  return (
    <div className="size-picker image-count-stepper" ref={wrapRef}>
      <button
        type="button"
        className="image-count-trigger"
        data-tooltip={t("picker.imageCountTooltip")}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((next) => !next)}
      >
        <span className="size-trigger-icon image-count-trigger-icon" aria-hidden="true">
          <ImagePlus size={15} />
        </span>
        <span>{t("picker.imageCount", { count: selectedValue })}</span>
        <ChevronDown size={15} className={open ? "open" : ""} />
      </button>
      {open ? createPortal(
        <div ref={menuRef} className="size-picker-menu image-count-menu" role="listbox" style={menuStyle}>
          {options.map((option) => (
            <button
              type="button"
              key={option}
              role="option"
              aria-selected={option === selectedValue}
              className={option === selectedValue ? "active" : ""}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              <span className="image-count-option-copy">
                <strong>{t("picker.imageCountOption", { count: option })}</strong>
              </span>
              {option === selectedValue ? <Check className="size-option-check" size={16} /> : <span />}
            </button>
          ))}
        </div>,
        document.body
      ) : null}
    </div>
  );
}
