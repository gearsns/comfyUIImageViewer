import { splitFileName } from "../../utils/file";

export interface ScannedFile {
    relativePath: string;
    fileHandle: FileSystemFileHandle;
    dirHandle: FileSystemDirectoryHandle,
    file: File;
}

const EXCLUDE_FOLDERS = new Set(['backup', 'temp', '.git']);
const SEARCH_EXTENSIONS = new Set(['webp', 'png', 'jpg', 'jpeg', 'mp3', 'mp4']);
const SUPPORT_EXTENSIONS = new Set(['webp', 'png', 'jpg', 'jpeg']);
const MOVIE_EXTENSIONS = new Set(['mp3', 'mp4']);

export async function scanImageFiles(
    dirHandle: FileSystemDirectoryHandle,
    basePath = ''
): Promise<ScannedFile[]> {
    const results: ScannedFile[] = [];
    const tmpList: (ScannedFile | null)[] = [];
    const imageList: Record<string, string> = {};

    for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind === 'directory') {
            if (EXCLUDE_FOLDERS.has(name.toLowerCase())) continue;
            const subPath = basePath ? `${basePath}/${name}` : name;
            const subResults = await scanImageFiles(handle as FileSystemDirectoryHandle, subPath);
            results.push(...subResults);
        } else if (handle.kind === 'file') {
            const parsedFilename = splitFileName(name);
            if (!SEARCH_EXTENSIONS.has(parsedFilename.extension)) continue;
            const fileHandle = handle as FileSystemFileHandle;
            const file = await fileHandle.getFile();
            const relativePath = basePath ? `${basePath}/${name}` : name;
            tmpList.push({ relativePath, fileHandle, dirHandle, file });
            if (SUPPORT_EXTENSIONS.has(parsedFilename.extension)) {
                imageList[parsedFilename.name] = name;
            }
        }
    }

    for (let idx = 0; idx < tmpList.length; idx++) {
        const item = tmpList[idx];
        if (!item) continue;
        const parsedFilename = splitFileName(item.file.name);
        const target = imageList[parsedFilename.name];
        if (MOVIE_EXTENSIONS.has(parsedFilename.extension)) {
            tmpList[idx] = null;
            if (target) {
                const index = tmpList.findIndex((a) => a?.file.name === target);
                if (index >= 0) {
                    tmpList[index] = null;
                }
            }
        }
    }
    // nullを除外してソート (typeで比較、同じならnameで比較)
    const filteredItems = tmpList.filter((item): item is NonNullable<typeof item> => item !== null);
    results.push(...filteredItems);

    return results;
}
