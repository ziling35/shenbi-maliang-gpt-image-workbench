export function imageFilesFromList(files: FileList | File[]) {
  const seen = new Set<string>();
  return Array.from(files).filter((file) => {
    if (!file.type.startsWith("image/")) return false;
    const key = `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
