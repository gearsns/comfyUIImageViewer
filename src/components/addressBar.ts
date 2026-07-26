import { escapeHtml } from "../utils";

let currentSegments: string[] = ["Top"];
let onPathChangeCallback: (newPath: string) => void = () => { };
let onSearchCallback: (query: string) => void = () => { };

// DOM 要素のキャッシュ
let addressBarEl: HTMLDivElement;
let breadcrumbListEl: HTMLUListElement;
let pathInputEl: HTMLInputElement;
let dropdownEl: HTMLDivElement | undefined;

function getPathString(): string {
    // 編集モード用に "Top" を除外した文字列を生成する
    if (currentSegments[0] === "Top") {
        // 例: ["Top"] なら空配列なので "" / ["Top", "FolderA"] なら ["FolderA"] になり "FolderA"
        return currentSegments.slice(1).join('/');
    }
    // "Top" が含まれない例外的なルートがあればそのまま結合
    return currentSegments.join('/');
}

// パンくずリスト（UI）を画面に描画する関数
function renderBreadcrumbs() {
    breadcrumbListEl.innerHTML = '';

    currentSegments.forEach((segment, index) => {
        const li = document.createElement('li');
        li.className = 'breadcrumb-item';

        // フォルダボタンの作成
        const btn = document.createElement('button');
        btn.className = 'folder-btn';
        btn.textContent = segment;

        // 途中の階層をクリックしたら、そこまでのパスに切り替える
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // 親要素（アドレスバー全体）のクリックイベントを発動させない
            currentSegments = currentSegments.slice(0, index + 1); // 修正: sliceの挙動を調整して選択階層までを残す

            // `Top` だけの場合は空文字、それ以外は `Top` を除いたパスを生成
            const path = currentSegments.slice(1).join('/');
            onPathChangeCallback(path);
        });

        li.appendChild(btn);

        // 最後の要素以外には矢印（区切り）を追加
        if (index < currentSegments.length - 1) {
            const separator = document.createElement('span');
            separator.className = 'separator';
            separator.textContent = '>';
            li.appendChild(separator);
        }

        breadcrumbListEl.appendChild(li);
    });
}

// ドロップダウンを非表示にする
function hideDropdown() {
    if (dropdownEl) {
        dropdownEl.style.display = 'none';
        dropdownEl.innerHTML = '';
    }
}

// ドロップダウンを表示・更新する
function updateDropdown(inputValue: string) {
    if (!dropdownEl) return;

    const trimmed = inputValue.trim();
    if (!trimmed) {
        hideDropdown();
        return;
    }

    dropdownEl.innerHTML = '';
    dropdownEl.style.display = 'block';

    // 項目1: 🔍「〇〇」を検索
    const searchItem = document.createElement('div');
    searchItem.className = 'dropdown-item search-type';
    searchItem.innerHTML = `<span class="icon">🔍</span> 「<strong>${escapeHtml(trimmed)}</strong>」を検索`;

    // mousedownを使うことで、inputのblurイベントよりも先にクリック処理を実行させます
    searchItem.addEventListener('mousedown', (e) => {
        e.preventDefault(); // blurで先に閉じられるのを防ぐ
        onSearchCallback(trimmed);
        exitEditMode();
    });
    dropdownEl.appendChild(searchItem);

    // 項目2: 📂 フォルダ「〇〇」へ移動 (パスとしての挙動も選択肢として残す)
    const pathItem = document.createElement('div');
    pathItem.className = 'dropdown-item path-type';
    pathItem.innerHTML = `<span class="icon">📂</span> パスとして移動: <code>${escapeHtml(trimmed)}</code>`;
    pathItem.addEventListener('mousedown', (e) => {
        e.preventDefault();
        executePathChange(trimmed);
        exitEditMode();
    });
    dropdownEl.appendChild(pathItem);
}

// パス遷移を実行する共通ロジック
function executePathChange(rawPath: string) {
    const newPath = rawPath.trim();
    if (newPath) {
        let segments = newPath.split('\\').filter(s => s.length > 0);

        if (segments.length > 0) {
            const firstSegmentLower = segments[0].toLowerCase();
            if (firstSegmentLower === 'top') {
                segments[0] = "Top";
                currentSegments = segments;
            } else if (!segments[0].includes(':')) {
                currentSegments = ["Top", ...segments];
            } else {
                currentSegments = segments;
            }
        } else {
            currentSegments = ["Top"];
        }
        const targetPath = currentSegments.slice(1).join('/');
        onPathChangeCallback(targetPath);
    } else {
        currentSegments = ["Top"];
        onPathChangeCallback("");
    }
}
// 編集モードを抜ける共通処理
function exitEditMode() {
    addressBarEl.classList.remove('is-editing');
    hideDropdown();
    renderBreadcrumbs();
}

/**
 * 外部から呼び出してパンくずリストの状態を同期させる関数
 */
export const updateAddressBarPath = (folderPath: string) => {
    const cleanPath = folderPath.replace(/^\/+/, '');
    currentSegments = ["Top"].concat(cleanPath ? cleanPath.split('/') : []);
    renderBreadcrumbs();
};

/**
 * アドレスバーの初期化関数
 * @param onPathChange パスが手動変更された際に呼び出すメイン側の関数 (loadImages)
 */
export function initAddressBar(
    onPathChange: (newPath: string) => void,
    onSearch: (query: string) => void
) {
    onPathChangeCallback = onPathChange;
    onSearchCallback = onSearch;

    addressBarEl = document.getElementById('addressBar') as HTMLDivElement;
    breadcrumbListEl = document.getElementById('breadcrumbList') as HTMLUListElement;
    pathInputEl = document.getElementById('pathInput') as HTMLInputElement;
    dropdownEl = document.getElementById('addressDropdown') as HTMLDivElement;

    if (!addressBarEl || !breadcrumbListEl || !pathInputEl) {
        console.error("AddressBar elements not found.");
        return;
    }

    // 1. アドレスバーをクリックした時：編集モードへ
    addressBarEl.addEventListener('click', () => {
        if (addressBarEl.classList.contains('is-editing')) return;

        addressBarEl.classList.add('is-editing');
        pathInputEl.value = getPathString();
        pathInputEl.focus();
        pathInputEl.select(); // テキストを全選択状態にする

        // フォーカス時に文字が入っていればドロップダウンを更新
        updateDropdown(pathInputEl.value);
    });

    // 入力中のイベント：ドロップダウンの表示を動的に更新
    pathInputEl.addEventListener('input', () => {
        updateDropdown(pathInputEl.value);
    });

    // 2. 入力中にキーが押された時（Enterで確定、Escでキャンセル）
    pathInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            executePathChange(pathInputEl.value);
            exitEditMode();
        } else if (e.key === 'Escape') {
            exitEditMode();
        }
    });

    // 3. 入力欄からフォーカスが外れた時：確定して編集モードを抜ける
    pathInputEl.addEventListener('blur', () => {
        setTimeout(() => {
            exitEditMode();
        }, 150);
    });

    // 初回描画
    renderBreadcrumbs();
}
