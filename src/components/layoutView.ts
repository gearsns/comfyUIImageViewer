const sidebarTreeResizer = document.getElementById('sidebar-tree-resizer');
const sidebarPreviewResizer = document.getElementById('sidebar-preview-resizer');
const sidebarTree = document.getElementById('sidebar-tree');
const previewContainer = document.getElementById('preview-container');

export function initLayout() {
    document.getElementById("toogle-preview")?.addEventListener("click", () => {
        previewContainer?.classList.toggle('collapsed');
    });

    document.getElementById("toogle-tree")?.addEventListener("click", () => {
        sidebarTree?.classList.toggle('collapsed');
    });

    if (sidebarTree && sidebarTreeResizer) {
        sidebarTreeResizer.addEventListener('mousedown', (e) => {
            e.preventDefault();

            const doDrag = (moveEvent: MouseEvent) => {
                const clampedWidth = Math.max(100, Math.min(400, moveEvent.clientX));
                sidebarTree.style.width = `${clampedWidth}px`;
            };

            const stopDrag = () => {
                document.removeEventListener('mousemove', doDrag);
                document.removeEventListener('mouseup', stopDrag);
            };

            document.addEventListener('mousemove', doDrag);
            document.addEventListener('mouseup', stopDrag);
        });
    }
    if (previewContainer && sidebarPreviewResizer) {
        sidebarPreviewResizer.addEventListener('mousedown', (e) => {
            e.preventDefault();

            const doDrag = (moveEvent: MouseEvent) => {
                const newWidth = window.innerWidth - moveEvent.clientX;
                const clampedWidth = Math.max(50, Math.min(800, newWidth));
                previewContainer.style.width = `${clampedWidth}px`;
            };

            const stopDrag = () => {
                document.removeEventListener('mousemove', doDrag);
                document.removeEventListener('mouseup', stopDrag);
            };

            document.addEventListener('mousemove', doDrag);
            document.addEventListener('mouseup', stopDrag);
        });
    }
}
