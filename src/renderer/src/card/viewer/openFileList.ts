export type OpenFileList = { files: readonly string[]; preview: string | null };

export function openPreview(list: OpenFileList, path: string): OpenFileList {
  if (list.files.includes(path)) {
    return list;
  }
  const files =
    list.preview !== null && list.files.includes(list.preview)
      ? list.files.map((file) => (file === list.preview ? path : file))
      : [...list.files, path];
  return { files, preview: path };
}

export function pin(list: OpenFileList, path: string): OpenFileList {
  const open = list.files.includes(path);
  if (open && list.preview !== path) {
    return list;
  }
  return { files: open ? list.files : [...list.files, path], preview: list.preview === path ? null : list.preview };
}

export function close(list: OpenFileList, paths: readonly string[]): OpenFileList {
  return {
    files: list.files.filter((file) => !paths.includes(file)),
    preview: list.preview !== null && paths.includes(list.preview) ? null : list.preview,
  };
}
