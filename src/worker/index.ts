import * as Comlink from 'comlink';
import type { ImageData, FolderNode } from '../types';
import { store } from '../store';
import { getFolderTree } from './routes/folder';
import { imagesInFolder, queryImages } from './routes/images';
import { getPrompts } from './routes/prompts';

// Worker側で実行したいオブジェクト・関数を定義
const api = {
    async images(id: string, folderPath: string | null, query?: string | undefined): Promise<ImageData[]> {
        const item = await store.session.get(id);
        if (!item) {
            return [];
        }
        if (folderPath !== null) {
            return await imagesInFolder(id, item.dir, folderPath);
        } else if (query) {
            return await queryImages(id, item.dir, query);
        }
        return [];
    },
    async folders(id: string, folderPath?: string): Promise<FolderNode[]> {
        const data: FolderNode[] = [];
        const item = await store.session.get(id);
        if (item) {
            return await getFolderTree(item.dir, folderPath) ?? [];
        }
        return data;
    },
    async prompt(id: string, name: string): Promise<string> {
        const item = await store.session.get(id);
        if (item) {
            return await getPrompts(item.dir, name) ?? "";
        }
        return "";
    },
};

export type WorkerApi = typeof api;
Comlink.expose(api);
