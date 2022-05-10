figma.showUI(__html__);
figma.ui.onmessage = msg => {
    if (msg.type === 'getSelection') {
        const selection = figma.currentPage.selection;
        const page = figma.currentPage.id;
        const file = figma.fileKey;
        figma.ui.postMessage({ selection, page, file, sequence: msg.sequence });
    }
};
