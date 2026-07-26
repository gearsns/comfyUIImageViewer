/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { store } from './store';

declare const self: ServiceWorkerGlobalScope;

// Comlink でメインスレッド（または Web Worker）へ公開する API
const swApi = {};

export type ServiceWorkerApi = typeof swApi;

// SW起動時（またはFetch時）に「開いているタブの数」をチェックする関数
async function cleanupIfNoActiveTabs(id: string) {
    // 1. 現在開いているすべてのタブ（Client）を取得
    const allClients = await self.clients.matchAll({ type: 'window' });

    // 2. タブが「今開いた1つだけ」＝「直前まで全タブが閉じられていた」状態！
    if (allClients.length <= 1) {
        const keepIds = ['current', id];
        await store.session.where('id')
            .noneOf(keepIds)
            .delete();
        console.log(`全タブが閉じられていたため、DBをクリーンアップしました:${id}`);
    }
}

// MessageChannel のポートを受け取って Comlink をバインド
self.addEventListener('message', (event: ExtendableMessageEvent) => {
    if (event.data?.type === 'SW_COMLINK_INIT') {
        Comlink.expose(swApi, event.ports[0]);
    } else if (event.data?.type === 'INIT_CHECK') {
        cleanupIfNoActiveTabs(event.data.id);
    }
});

// Fetch イベントのフック
self.addEventListener('fetch', async (event: FetchEvent) => {
    const url = new URL(event.request.url);

    const marker = 'virtual-media/';
    const index = url.pathname.indexOf(marker);

    if (index !== -1) {
        const relPath = decodeURIComponent(url.pathname.substring(index + marker.length));

        event.respondWith(handleMediaFetch(event.request, relPath));
    }
});

self.addEventListener('install', () => {
    self.skipWaiting(); // インストール後即座に有効化
});

self.addEventListener('activate', (event: ExtendableEvent) => {
    event.waitUntil(self.clients.claim()); // 既存のページも即座にコントロール下におく
});

async function handleMediaFetch(
    request: Request,
    relPath: string
): Promise<Response> {
    try {
        const segments = relPath.split('/').filter(Boolean);
        if (segments.length < 2) {
            return new Response('File Not Found', { status: 404 });
        }
        const id = segments.shift();
        const item = await store.session.get(id);
        if (!item?.dir) {
            return new Response('File Not Found', { status: 404 });
        }
        const rootHandle = item.dir;

        const fileName = segments.pop()!;

        let currentDir = rootHandle;
        for (const segment of segments) {
            currentDir = await currentDir.getDirectoryHandle(segment);
        }
        const fileHandle = await currentDir.getFileHandle(fileName);
        const file = await fileHandle.getFile();

        // Rangeリクエスト (動画・音声の部分読み込み) 対応
        const rangeHeader = request.headers.get('Range');
        if (rangeHeader) {
            const parts = rangeHeader.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : file.size - 1;
            const chunkSize = end - start + 1;
            const blobSlice = file.slice(start, end + 1);

            return new Response(blobSlice, {
                status: 206,
                statusText: 'Partial Content',
                headers: {
                    'Content-Range': `bytes ${start}-${end}/${file.size}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize.toString(),
                    'Content-Type': file.type || getMimeType(relPath),
                },
            });
        }

        // 通常の画像などの返却
        return new Response(file, {
            status: 200,
            headers: {
                'Content-Type': file.type || getMimeType(relPath),
                'Content-Length': file.size.toString(),
                'Cache-Control': 'public, max-age=3600',
            },
        });
    } catch (error) {
        console.error('File fetch error:', error);
        return new Response('File Not Found', { status: 404 });
    }
}

function getMimeType(path: string): string {
    if (path.endsWith('.png')) return 'image/png';
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
    if (path.endsWith('.webp')) return 'image/webp';
    if (path.endsWith('.mp4')) return 'video/mp4';
    if (path.endsWith('.mp3')) return 'audio/mpeg';
    return 'application/octet-stream';
}
