import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import initSqlJs, { type Database } from 'sql.js';

let SQLInstance: any = null;

export const getSQLInstance = async () => {
    if (!SQLInstance) {
        SQLInstance = await initSqlJs({ locateFile: () => sqlWasmUrl });
    }
    return SQLInstance;
}

// フォルダ内から指定のDBファイルをロード（無ければ新規DBを作成）
async function loadOrCreateDb(dirHandle: FileSystemDirectoryHandle, fileName: string): Promise<Database> {
    const SQL = await getSQLInstance();
    try {
        const fileHandle = await dirHandle.getFileHandle(fileName);
        const file = await fileHandle.getFile();
        const arrayBuffer = await file.arrayBuffer();
        return new SQL.Database(new Uint8Array(arrayBuffer));
    } catch {
        // ファイルが存在しない場合は新規DBを初期化
        return new SQL.Database();
    }
}

// DBファイルを指定名でフォルダ内に保存
async function saveDb(dirHandle: FileSystemDirectoryHandle, fileName: string, db: Database) {
    const dbBuffer = db.export();
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(new Uint8Array(dbBuffer));
    await writable.close();
}

export async function loadTmpDb(dirHandle: FileSystemDirectoryHandle): Promise<Database> {
    const tmpDb = await loadOrCreateDb(dirHandle, 'similar_images_tmp.db');
    tmpDb.run(`
      CREATE TABLE IF NOT EXISTS files_metadata (
        file_path TEXT PRIMARY KEY,
        sub_dir TEXT,
        media_type TEXT,
        file_size INTEGER,
        mtime REAL
      );
      CREATE TABLE IF NOT EXISTS features_image_cache (
        file_path TEXT PRIMARY KEY,
        feature_blob BLOB,
        json_text TEXT,
        prompt TEXT
      );
    `);
    return tmpDb;
}

export async function saveTmpDb(dirHandle: FileSystemDirectoryHandle, db: Database) {
    return saveDb(dirHandle, 'similar_images_tmp.db', db);
}

export async function loadResultDb(dirHandle: FileSystemDirectoryHandle): Promise<Database> {
    const resultDb = await loadOrCreateDb(dirHandle, 'similar_images.db');
    resultDb.run(`
      CREATE TABLE IF NOT EXISTS similar_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER,
        media_type TEXT,
        file_path TEXT,
        is_reference INTEGER,
        similarity REAL,
        json_text TEXT,
        prompt TEXT
      );
    `);
    return resultDb;
}

export async function saveResultDb(dirHandle: FileSystemDirectoryHandle, db: Database) {
    return saveDb(dirHandle, 'similar_images.db', db);
}
