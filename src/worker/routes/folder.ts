import type { FolderNode } from "../../types";
import { getDirectoryHandleByPath } from "../../utils/file";
import { imageGroups } from "../utils/similarImages";

async function hasEntries(dirHandle: FileSystemDirectoryHandle) {
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'directory') {
            return true;
        }
    }
    return false;
}

// 非同期でのフォルダツリー構築
async function buildFolderTreeAsync(
    dirHandle: FileSystemDirectoryHandle,
    currentRelPath: string = ''
): Promise<FolderNode[]> {
    const results: FolderNode[] = [];

    try {
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'directory') {
                // ドットから始まる隠しフォルダはスキップ
                if (entry.name.startsWith('.')) continue;
                // 相対パスの構築（Node.js の path.join の代わり）
                const relPath = currentRelPath ? `${currentRelPath}/${entry.name}` : entry.name;

                // サブフォルダの場合、中身があるか（展開可能か）を1件だけチェック
                const isExpandable = await hasEntries(entry);

                results.push({
                    name: entry.name,
                    relPath: relPath,
                    children: [],
                    hasChildren: isExpandable // UI表示用のフラグ
                });
            }
        }
    } catch (e) {
        console.error('Failed to read directory for tree:', e);
    }
    return results;
}

// メインの呼び出し関数
async function getTopFolderTree(rootHandle: FileSystemDirectoryHandle) {
    try {
        // 2. ツリー構造の構築
        const tree = await buildFolderTreeAsync(rootHandle);

        const groups = await imageGroups(rootHandle);
        // 3. 類似画像グループ（similar）などの追加処理
        if (groups && groups.length > 0) {
            const children: FolderNode[] = [];
            for (const group of groups) {
                children.push({
                    name: String(group.group_id),
                    relPath: `*similar*/${group.group_id}`,
                    children: [],
                    hasChildren: false
                });
            }
            tree.push({
                name: 'similar',
                relPath: '*similar*',
                children,
                hasChildren: true
            });
        }

        return tree;
    } catch (error) {
        // ユーザーがキャンセルした場合もここに入る
        if ((error as Error).name === 'AbortError') {
            console.log('Folder selection was cancelled');
            return null;
        }
        console.error('Failed to build folder tree', error);
        throw error;
    }
}

async function getSubFolderTree(rootHandle: FileSystemDirectoryHandle, folderPath: string) {
    const handle = await getDirectoryHandleByPath(rootHandle, folderPath);
    return await buildFolderTreeAsync(handle, folderPath);
}

export async function getFolderTree(rootHandle: FileSystemDirectoryHandle, folderPath?: string) {
    if (folderPath === undefined) {
        return getTopFolderTree(rootHandle);
    }
    return getSubFolderTree(rootHandle, folderPath);
}
