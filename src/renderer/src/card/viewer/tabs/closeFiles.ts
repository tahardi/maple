export function closeFiles(
  openFiles: readonly string[],
  activeFile: string | null,
  paths: readonly string[],
): { openFiles: readonly string[]; activeFile: string | null } {
  const rest = openFiles.filter((file) => !paths.includes(file));
  const closesActive = activeFile !== null && paths.includes(activeFile);
  return { openFiles: rest, activeFile: closesActive ? (rest.at(-1) ?? null) : activeFile };
}
