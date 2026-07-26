import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import initSqlJs from 'sql.js';

let SQLInstance: any = null;

export const getSQLInstance = async () => {
    if (!SQLInstance) {
        SQLInstance = await initSqlJs({ locateFile: () => sqlWasmUrl });
    }
    return SQLInstance;
}

export interface Group {
    group_id: number;
    file_path: string;
}

export interface Image {
    id: number;
    file_path: string;
    json_text?: string;
}

const getDB = async (dirHandle: FileSystemDirectoryHandle) => {
    try {
        // ファイルが存在しない場合、ここで Error がスローされる
        const fileHandle = await dirHandle.getFileHandle('similar_images.db');
        const file = await fileHandle.getFile();

        const sql = await getSQLInstance();

        const buffer = await file.arrayBuffer();
        return new sql.Database(new Uint8Array(buffer));
    } catch (error) {
        // ファイルが見つからない場合は null を返す
        if (error instanceof Error && error.name === 'NotFoundError') {
            return null;
        }
        // その他のエラー（アクセス権限なし等）は再スロー
        throw error;
    }
}

export const imageGroups = async (dirHandle: FileSystemDirectoryHandle): Promise<Group[] | null> => {
    const db = await getDB(dirHandle);
    if (!db) {
        return null;
    }
    const groups: Group[] = [];

    try {
        const stmt = db.prepare('SELECT group_id, file_path FROM similar_groups WHERE is_reference=1 ORDER BY group_id')
        // 1行ずつオブジェクトとして取得
        while (stmt.step()) {
            const row = stmt.getAsObject() as unknown as Group;
            groups.push(row);
        }

        stmt.free(); // ステートメントのメモリ解放
        return groups;
    } catch (e) {
        console.error("SQL Execution Error:", e);
        return null;
    } finally {
        // データベース接続を閉じる
        db.close();
    }
}

export const imageLists = async (dirHandle: FileSystemDirectoryHandle, group_id: number): Promise<Image[] | null> => {
    const db = await getDB(dirHandle);
    if (!db) {
        return null;
    }
    const images: Image[] = [];

    try {
        const stmt = db.prepare(`SELECT id, file_path, json_text FROM similar_groups WHERE group_id=${group_id} ORDER BY similarity DESC`)

        // 1行ずつオブジェクトとして取得
        while (stmt.step()) {
            const row = stmt.getAsObject() as unknown as Image;
            images.push(row);
        }

        stmt.free(); // ステートメントのメモリ解放
        return images;
    } catch (e) {
        console.error("SQL Execution Error:", e);
        return null;
    } finally {
        // データベース接続を閉じる
        db.close();
    }
}

export const searchImages = async (dirHandle: FileSystemDirectoryHandle, words: string): Promise<Image[] | null> => {
    const db = await getDB(dirHandle);
    if (!db) {
        return null;
    }

    // 1. 全角・半角スペースで文字列を分割し、空の要素を除外する
    const searchWords = words.trim().split(/[\s ]+/).filter(Boolean);

    // 検索ワードが空の場合は空配列を返すか、全件取得にするなど好みに合わせて調整してください
    if (searchWords.length === 0) {
        return [];
    }

    // 2. 単語の数だけ「prompt LIKE ?」を生成し、" AND " で結合する
    const likeClauses = searchWords.map(() => `prompt LIKE ?`).join(' AND ');

    // 3. SQLクエリを組み立てる
    const query = `
        SELECT id, file_path, json_text
        FROM similar_groups 
        WHERE ${likeClauses} 
        ORDER BY file_path 
        LIMIT 500
    `;

    const images: Image[] = [];

    try {
        // 4. 各単語を %単語% に変換
        const searchPatterns = searchWords.map(word => `%${word}%`);

        // 5. sql.js でのステートメント実行
        const stmt = db.prepare(query);
        stmt.bind(searchPatterns); // 配列をそのまま渡す

        // 1行ずつオブジェクトとして取得
        while (stmt.step()) {
            const row = stmt.getAsObject() as unknown as Image;
            images.push(row);
        }

        stmt.free(); // ステートメントのメモリ解放
        return images;
    } catch (e) {
        console.error("SQL Execution Error:", e);
        return null;
    } finally {
        // 6. データベース接続を閉じる
        db.close();
    }
}

