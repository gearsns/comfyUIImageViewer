import Dexie, { type Table } from 'dexie';

export interface LastSession {
    id: string;
    dir: FileSystemDirectoryHandle;
}

export const sessionId = crypto.randomUUID();
class AppDatabase extends Dexie {
    session!: Table<LastSession>;

    constructor() {
        super('ComfyUIImageViewer');
        this.version(1).stores({
            session: 'id'
        });
    }
}

export const store = new AppDatabase();
