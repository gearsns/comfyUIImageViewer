export interface ParsedFileName {
    name: string;       // 拡張子を除いたファイル名
    extension: string;  // 拡張子 (先頭のドットは除外、小文字に統一)
}

export function splitFileName(filename: string): ParsedFileName {
    // 最後のドットの位置を探す
    const lastDotIndex = filename.lastIndexOf('.');

    // ドットがない場合、または先頭にある隠しファイル (.gitignore 等) の場合
    if (lastDotIndex <= 0) {
        return {
            name: filename,
            extension: ''
        };
    }

    return {
        name: filename.slice(0, lastDotIndex),
        // 拡張子は大文字小文字の表記ブレを防ぐため小文字化しておくと便利です
        extension: filename.slice(lastDotIndex + 1).toLowerCase()
    };
}

/**
 * ルートハンドルとパス文字列 ('folder/subfolder' や '/folder/subfolder/') から
 * 目的の DirectoryHandle を取得する関数
 */
export async function getDirectoryHandleByPath(
    rootHandle: FileSystemDirectoryHandle,
    folderPath: string
): Promise<FileSystemDirectoryHandle> {
    // スラッシュで分割し、空文字を取り除く (例: '/folder/subfolder/' -> ['folder', 'subfolder'])
    const segments = folderPath.split('/').filter(Boolean);

    let currentHandle = rootHandle;

    for (const segment of segments) {
        try {
            // 順番に子ディレクトリのハンドルを取得して掘り進む
            currentHandle = await currentHandle.getDirectoryHandle(segment, { create: false });
        } catch (error) {
            console.error(`Directory not found: ${segment} (in path: ${folderPath})`);
            throw error; // 指定したパスが存在しない場合はエラー
        }
    }

    return currentHandle;
}

export const getBaseFilename = (name: string): string => {
    const segments = name.split('/').filter(Boolean);
    if (segments.length > 0){
        return segments.pop() ?? name;
    }
    return name;
}
