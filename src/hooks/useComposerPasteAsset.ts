import { useEffect, useRef, useState, type ClipboardEvent as ReactClipboardEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { useI18n } from "../i18n";
import { getClipboardImageFile } from "../lib/clipboardImage";
import type { AssetItem } from "../types";

type UseComposerPasteAssetOptions = {
  autoUploadPastedAssets: boolean;
  selectedAssets: AssetItem[];
  setSelectedAssets: (assets: AssetItem[]) => void;
  showToast: (message: string, type?: "success" | "error" | "info") => void;
};

function readFileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

function temporaryAssetFromFile(file: File, objectUrl: string): AssetItem {
  const timestamp = new Date().toISOString();
  return {
    id: `pasted-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    space: "private",
    name: file.name || "粘贴图片",
    url: objectUrl,
    originalUrl: objectUrl,
    previewUrl: objectUrl,
    thumbnailUrl: objectUrl,
    mimeType: file.type || "image/png",
    size: file.size,
    imageWidth: 0,
    imageHeight: 0,
    createdAt: timestamp,
    sourceUsername: "本次输入",
    canEdit: false,
    shared: false,
    shareStatus: "none",
    categoryIds: [],
    categoryNames: [],
    temporary: true,
    processingState: "reading"
  };
}

export function useComposerPasteAsset({ autoUploadPastedAssets, selectedAssets, setSelectedAssets, showToast }: UseComposerPasteAssetOptions) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const selectedAssetsRef = useRef(selectedAssets);
  const objectUrlsRef = useRef(new Set<string>());
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    selectedAssetsRef.current = selectedAssets;
  }, [selectedAssets]);

  useEffect(() => () => {
    for (const objectUrl of objectUrlsRef.current) URL.revokeObjectURL(objectUrl);
    objectUrlsRef.current.clear();
  }, []);

  const commitAssets = (update: (current: AssetItem[]) => AssetItem[]) => {
    const nextAssets = update(selectedAssetsRef.current);
    selectedAssetsRef.current = nextAssets;
    setSelectedAssets(nextAssets);
  };

  const processPastedImage = async (file: File, temporaryAsset: AssetItem, objectUrl: string) => {
    setPendingCount((count) => count + 1);
    let dataUrl = "";
    try {
      dataUrl = await readFileDataUrl(file);
      commitAssets((assets) => assets.map((asset) => asset.id === temporaryAsset.id ? {
        ...asset,
        dataUrl,
        processingState: autoUploadPastedAssets ? "uploading" : "ready"
      } : asset));
      if (!autoUploadPastedAssets) {
        showToast(t("toast.pastedImageAdded"));
        return;
      }
      const form = new FormData();
      form.set("file", file);
      const result = await api.uploadAsset(form);
      commitAssets((assets) => {
        if (!assets.some((asset) => asset.id === temporaryAsset.id)) return assets;
        return assets
          .map((asset) => asset.id === temporaryAsset.id ? result.asset : asset)
          .filter((asset, index, rows) => rows.findIndex((candidate) => candidate.id === asset.id) === index);
      });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      showToast(t("toast.pastedImageAdded"));
      URL.revokeObjectURL(objectUrl);
      objectUrlsRef.current.delete(objectUrl);
    } catch (err) {
      if (dataUrl) {
        commitAssets((assets) => assets.map((asset) => asset.id === temporaryAsset.id ? { ...asset, dataUrl, processingState: "ready" } : asset));
        const message = err instanceof ApiError ? err.message : t("toast.pastedImageFailed");
        showToast(`${message}，图片仍可用于本次输入`, "info");
      } else {
        commitAssets((assets) => assets.filter((asset) => asset.id !== temporaryAsset.id));
        showToast(err instanceof ApiError ? err.message : t("toast.pastedImageFailed"), "error");
      }
    } finally {
      setPendingCount((count) => Math.max(0, count - 1));
    }
  };

  const handleComposerPaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const imageFile = getClipboardImageFile(event.clipboardData);
    if (!imageFile) return;
    event.preventDefault();
    const objectUrl = URL.createObjectURL(imageFile);
    objectUrlsRef.current.add(objectUrl);
    const temporaryAsset = temporaryAssetFromFile(imageFile, objectUrl);
    commitAssets((assets) => [...assets, temporaryAsset]);
    showToast(t("toast.pastedImageAdding"), "info");
    void processPastedImage(imageFile, temporaryAsset, objectUrl);
  };

  return { handleComposerPaste, isPastingAsset: pendingCount > 0 };
}
