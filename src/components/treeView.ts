import { fetchFolderTree, fetchSubFolderTree } from '../api';
import { loadImages } from './galleryView';
import type { FolderNode } from '../types';

const treeRoot = document.getElementById('tree-root') as HTMLDivElement;
const galleryInfo = document.getElementById('gallery-info') as HTMLDivElement;
let currentActiveFolderEl: HTMLElement | null = null;

export async function initFolderTree() {
    try {
        galleryInfo.textContent = "フォルダを読み込み中です。";
        const tree = await fetchFolderTree();
        treeRoot.innerHTML = '';

        // ルートノードの追加
        const rootItem = createTreeRow({ name: 'Top', relPath: '', children: [], hasChildren: false }, 0);
        treeRoot.appendChild(rootItem);

        renderTreeNodes(tree, treeRoot, 0);

        galleryInfo.textContent = "フォルダを選択してください。";
    } catch (e) {
        treeRoot.innerHTML = '<p class="error">ツリーの取得に失敗</p>';
    }
}

function renderTreeNodes(nodes: FolderNode[], parentEl: HTMLElement, depth: number) {
    nodes.forEach(node => {
        const hasChildren = node.children.length > 0 || node.hasChildren;
        const container = document.createElement('div');
        container.className = 'tree-node-container';

        let childContainer: HTMLDivElement | null = null;
        let toggleIcon: HTMLSpanElement | null = null;

        if (hasChildren) {
            childContainer = document.createElement('div');
            childContainer.className = 'tree-child-container is-hidden';
        }

        const onToggle = async () => {
            if (childContainer && toggleIcon) {
                childContainer.classList.toggle('is-hidden');
                const isCollapsed = childContainer.classList.contains('is-hidden');
                toggleIcon.classList.toggle("expanded", !isCollapsed);
                if (node.children.length === 0) {
                    node.children = await fetchSubFolderTree(node.relPath);
                    renderTreeNodes(node.children, childContainer, depth + 1);
                }
            }
        };

        const row = createTreeRow(node, depth);

        if (hasChildren && childContainer) {
            toggleIcon = document.createElement('span');
            toggleIcon.className = 'tree-toggle-icon';

            toggleIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                onToggle();
            });
            row.insertBefore(toggleIcon, row.firstChild);
        } else {
            const spacer = document.createElement('span');
            spacer.className = 'tree-spacer';
            row.insertBefore(spacer, row.firstChild);
        }

        container.appendChild(row);

        if (hasChildren && childContainer) {
            renderTreeNodes(node.children, childContainer, depth + 1);
            container.appendChild(childContainer);
        }
        parentEl.appendChild(container);
    });
}

function createTreeRow(node: FolderNode, depth: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tree-row';
    row.style.paddingLeft = `${(depth * 12) + 6}px`;

    const textSpan = document.createElement('span');
    textSpan.innerText = '📁 ' + node.name;
    textSpan.className = 'tree-item';
    row.appendChild(textSpan);

    textSpan.addEventListener('click', (e) => {
        e.stopPropagation();

        currentActiveFolderEl?.classList.remove('is-active');
        row.classList.add('is-active');
        currentActiveFolderEl = row;

        loadImages(node.relPath);
    });

    return row;
}
