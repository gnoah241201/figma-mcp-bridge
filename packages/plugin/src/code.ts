import { handleOp } from './ops.js';

figma.showUI(__html__, { width: 300, height: 150 });

function sendHello() {
  figma.ui.postMessage({
    kind: 'hello',
    info: {
      fileName: figma.root.name,
      pageId: figma.currentPage.id,
      pageName: figma.currentPage.name,
    },
  });
}

figma.ui.onmessage = async (m: any) => {
  if (m?.kind === 'connected') { sendHello(); return; }
  if (m?.kind !== 'request') return;

  const { id, op, payload } = m.msg;
  try {
    const result = await handleOp(op, payload);
    figma.ui.postMessage({ kind: 'response', msg: { id, ok: true, result } });
  } catch (e: any) {
    figma.ui.postMessage({
      kind: 'response',
      msg: { id, ok: false, error: { message: String(e?.message ?? e) } },
    });
  } finally {
    figma.commitUndo();
  }
};
