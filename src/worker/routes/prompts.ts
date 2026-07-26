import { getDirectoryHandleByPath } from "../../utils/file";
import { getMetaDeta } from "../../utils/metadataParser";

export const getPrompts = async (rootHandle: FileSystemDirectoryHandle, name: string): Promise<any | null> => {
    const dirHandle = await getDirectoryHandleByPath(rootHandle,
        name
            .replace(/virtual-media\/[^/]+\//, '')
            .replace(/\/[^/]+\.[^/]+$/, '')
    );
    if (!dirHandle) {
        return null;
    }
    return await getMetaDeta(dirHandle, name);
}
