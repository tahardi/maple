export function inFolder(folder: string, name: string): string {
  return folder === '' ? name : `${folder}/${name}`;
}
