import * as Comlink from 'comlink';
import type { ClusteringConfig } from "../clustering.worker/types";
import { sessionId, store } from "../store";
import MyWorker from '../clustering.worker/index?worker';
import type { ImageScanWorkerApi } from '../clustering.worker';

const configOverlay = document.getElementById('config-overlay') as HTMLDivElement;
const closeConfigBtn = document.getElementById('close-config-btn') as HTMLDivElement;
const configBtn = document.getElementById('config-btn') as HTMLDivElement;
const updateDbBtn = document.getElementById('update-db-btn') as HTMLDivElement;
const updateDbStopBtn = document.getElementById('update-db-stop-btn') as HTMLDivElement;
const updateStatus = document.getElementById('update-status') as HTMLDivElement;

function openConfig() {
    configOverlay.style.display = 'block';
}

function closeConfig() {
    configOverlay.style.display = 'none';
}

export function initConfig(initFolder: () => {}) {
    document.getElementById("target-folder")?.addEventListener("click", async () => {
        const dirHandle = await window.showDirectoryPicker({
            mode: 'readwrite', // 読み書き権限を要求
        });
        await store.session.put({
            id: 'current',
            dir: dirHandle
        });
        await store.session.put({
            id: sessionId,
            dir: dirHandle
        });
        initFolder();
    });

    let worker: (Worker | null) = null;
    configBtn.addEventListener('click', openConfig);
    configOverlay.addEventListener('click', async (e) => {
        e.stopPropagation();
        const actionBtn = (e.target as HTMLElement | null)?.closest<HTMLElement>("button, #close-config-btn");
        if (actionBtn === closeConfigBtn) {
            if (!worker) {
                closeConfig();
            }
        } else if (actionBtn === updateDbBtn) {
            updateDbStopBtn.style.display = "block";
            updateDbBtn.style.display = "none";
            updateStatus.textContent = "";
            const config: ClusteringConfig = {
                maxMembers: 50,
                minSimilarity: 0.1
            }
            worker = new MyWorker();
            const api = Comlink.wrap<ImageScanWorkerApi>(worker);
            await api.processDirectory(sessionId, config,
                Comlink.proxy((msg: string) => {
                    updateStatus.textContent = msg;
                }),
                Comlink.proxy(({ current, total, label }: { current: number; total: number; label: string }) => {
                    updateStatus.textContent = `解析中 [${current}/${total}]: ${label}`;
                })
            );
            worker = null;
            updateDbStopBtn.style.display = "none";
            updateDbBtn.style.display = "block";
            updateStatus.textContent = "";
            initFolder();
        } else if (actionBtn === updateDbStopBtn) {
            updateDbStopBtn.style.display = "none";
            updateDbBtn.style.display = "block";
            if (worker) {
                worker.terminate();
            }
            worker = null;
            updateStatus.textContent = "中断しました";
        } else {
            if (!worker) {
                closeConfig();
            }
        }
    });
}
