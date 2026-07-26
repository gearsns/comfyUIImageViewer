
import * as Comlink from 'comlink';
import type { ServiceWorkerApi } from './sw';

export async function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        // Vite環境では URL(..., import.meta.url) でモジュールSWとして登録可能
        const registration = await navigator.serviceWorker.register(
            './sw.js',
            { type: 'module', scope: './', }
        );

        await navigator.serviceWorker.ready;

        const activeWorker = registration.active || navigator.serviceWorker.controller;
        if (activeWorker) {
            const channel = new MessageChannel();
            activeWorker.postMessage({ type: 'SW_COMLINK_INIT' }, [channel.port2]);

            // Service Worker 側の Comlink API ラッパーを取得
            const swApi = Comlink.wrap<ServiceWorkerApi>(channel.port1);
            return { channel, swApi };
        }
    }
    return null;
}

export const notifySWToInit = async (sessionId: string) => {
    // SW機能自体をサポートしていない環境へのガード
    if (!('serviceWorker' in navigator)) return;

    const send = () => {
        navigator.serviceWorker.controller?.postMessage({
            type: 'INIT_CHECK',
            id: sessionId,
        });
    };

    // 1. すでに controller が存在すれば即送信（リロード時など）
    if (navigator.serviceWorker.controller) {
        send();
        return;
    }

    // 2. 初回アクセス時：SWがアクティブ化されて準備が整うのを待つ
    try {
        await navigator.serviceWorker.ready;

        // readyになった時点で controller が割り当てられていれば送信
        if (navigator.serviceWorker.controller) {
            send();
        } else {
            // 万が一まだ controller になっていなければ controllerchange を1回だけ待つ
            navigator.serviceWorker.addEventListener('controllerchange', send, { once: true });
        }
    } catch (e) {
        console.error('Service Worker ready error:', e);
    }
};
