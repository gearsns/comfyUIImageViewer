import type { ImageData } from "../../types";
import { getDirectoryHandleByPath, splitFileName } from "../../utils/file";
import { imageGroups, imageLists, searchImages } from "../utils/similarImages";
import dJSON from 'dirty-json';

const findFirstImage = async (dirHandle: FileSystemDirectoryHandle) => {
    const files: string[] = [];
    try {
        // for await...of でディレクトリ内を非同期ループ処理
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'directory') {
                continue;
            }
            const ext = entry.name.toLocaleLowerCase().replace(/.*\./, '');
            if (['jpg', 'jpeg', 'webp', 'png', 'mp3', 'mp4'].includes(ext)) {
                files.push(entry.name);
            }
        }
    } catch (e) {
        console.error('Failed to read directory for tree:', e);
    }

    if (files.length === 0) {
        return null;
    }

    // 名前でソート
    return files.sort((a, b) => a.localeCompare(b))[0];
}

const similarImages = async (
    id: string,
    dirHandle: FileSystemDirectoryHandle,
    folderPath: string
): Promise<ImageData[]> => {
    const dirs = folderPath.split('/');
    if (dirs.length <= 1) {
        const groups = await imageGroups(dirHandle) ?? [];
        const items: ImageData[] = [];
        for (const group of groups) {
            items.push({
                type: 'dir',
                name: String(group.group_id),
                relPath: `*similar*/${group.group_id}`,
                mtime: 0,
                size: 0,
                sidecarPrompt: null,
                sampleImage: `virtual-media/${id}/${group.file_path}`
            });
        }
        return items;
    } else {
        const images = await imageLists(dirHandle, Number(dirs[1])) ?? [];
        const items: ImageData[] = [];
        for (const image of images) {
            items.push({
                type: 'file',
                name: image.file_path,
                relPath: `virtual-media/${id}/${image.file_path}`,
                mtime: 0,
                size: 0,
                sidecarPrompt: parseJson(image.json_text)
            });
        }
        return items;
    }
}

export const imagesInFolder = async (
    id: string,
    dirHandle: FileSystemDirectoryHandle,
    folderPath: string
): Promise<ImageData[]> => {
    folderPath = folderPath.replace(/^\/*/, '');
    if (folderPath.includes("*")) {
        return similarImages(id, dirHandle, folderPath);
    }
    const handle = await getDirectoryHandleByPath(dirHandle, folderPath);
    if (handle) {
        const result: (ImageData | null)[] = [];
        const imageList: Record<string, string> = {};
        for await (const entry of handle.values()) {
            // 相対パスの構築（Node.js の path.join の代わり）
            const name = entry.name.replaceAll(/\\/g, "/");
            const relPath = folderPath ? `${folderPath}/${name}` : name;
            // フォルダ（directory）のみを対象とする
            if (entry.kind === 'directory') {
                // ドットから始まる隠しフォルダはスキップ
                if (name.startsWith('.')) continue;

                const imagePath = await findFirstImage(entry);
                result.push({
                    type: 'dir',
                    name: name,
                    relPath: relPath,
                    mtime: 0,
                    size: 0,
                    sidecarPrompt: '',
                    sampleImage: imagePath ? `virtual-media/${id}/${relPath}/${imagePath}` : null
                });
            } else {
                const parsedFilename = splitFileName(name);
                if (['jpg', 'jpeg', 'webp', 'png', 'mp3', 'mp4'].includes(parsedFilename.extension)) {
                    const file = await entry.getFile();
                    result.push({
                        type: 'file',
                        name: name,
                        relPath: `virtual-media/${id}/${folderPath}/${encodeURIComponent(name)}`,
                        mtime: file.lastModified,
                        size: file.size,
                        sidecarPrompt: '',
                    });
                    if (['jpg', 'jpeg', 'webp', 'png'].includes(parsedFilename.extension)) {
                        imageList[parsedFilename.name] = name;
                    }
                }
            }
        }
        for (const item of result) {
            if (item?.type !== 'file') {
                continue;
            }
            const parsedFilename = splitFileName(item.name);
            const target = imageList[parsedFilename.name];
            if (target && ['mp3', 'mp4'].includes(parsedFilename.extension)) {
                const index = result.findIndex((a) => a?.name === target);
                if (index >= 0) {
                    result[index] = null;
                }
            }
        }
        // nullを除外してソート (typeで比較、同じならnameで比較)
        const filteredItems = result.filter((item): item is NonNullable<typeof item> => item !== null);
        filteredItems.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

        return filteredItems;
    }
    return [];
}

function parseJson(text: string | null | undefined) {
    try {
        if (!text){
            return text;
        }
        let json_data = dJSON.parse(text);
        if (!json_data) {
            return text;
        }
        if (json_data["ImageDescription"]) {
            return dJSON.parse(json_data["ImageDescription"]);
        }
        return json_data;
    } catch (e) {
        console.log(e)
        return text;
    }
}

export const queryImages = async (
    id: string,
    dirHandle: FileSystemDirectoryHandle,
    query: string
): Promise<ImageData[]> => {
    const images = await searchImages(dirHandle, query) ?? [];
    const items: ImageData[] = [];
    for (const image of images) {
        const path = image.file_path.replaceAll(/\\/g, "/");
        items.push({
            type: 'file',
            name: path,
            relPath: `virtual-media/${id}/${encodeURIComponent(path)}`,
            mtime: 0,
            size: 0,
            sidecarPrompt: parseJson(image.json_text)
        });
    }
    return items;
}
