import './assets/style.css';
import { AppState } from './state';
import { initConfig } from './components/config';
import { loadImages } from './components/galleryView';
import { initFolderTree } from './components/treeView';
import { initLayout } from './components/layoutView';
import { sessionId, store } from './store';
import { initServiceWorker, notifySWToInit } from './sw-register';

const initFolder = async () => {
    await initFolderTree();
    await loadImages(AppState.currentFolder);
}

async function init() {
    await initServiceWorker();
    initConfig(initFolder);
    initLayout();
    const item = await store.session.get('current');
    notifySWToInit(sessionId);
    if (item?.dir) {
        await store.session.put({ id: sessionId, dir: item.dir });
        // 1. まず現在の権限を確認（※これは自動で呼んでOK）
        const permission = await item.dir.queryPermission({ mode: 'read' });

        if (permission === 'granted') {
            // すでに権限があればそのまま初期化
            await initFolder();
        } else {
            // 2. 権限が切れていたら、「再開ボタン」などを画面に表示してクリックを待つ
            const reauthBtn = document.getElementById('reauth-button') as HTMLButtonElement;
            reauthBtn.classList.remove("is-hidden");

            reauthBtn.onclick = async () => {
                // クリックイベント内なので requestPermission が成功する
                const newStatus = await item.dir.requestPermission({ mode: 'readwrite' });
                if (newStatus === 'granted') {
                    reauthBtn.classList.add("is-hidden");
                    await initFolder();
                }
            };
        }
    }
}

// アプリケーション起動
init();
