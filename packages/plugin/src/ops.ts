export async function handleOp(op: string, payload: any): Promise<unknown> {
  switch (op) {
    case 'status': {
      const page = figma.currentPage;
      return {
        connected: true,
        file: figma.root.name,
        page: { id: page.id, name: page.name },
        selection: page.selection.map((n) => ({ id: n.id, name: n.name, type: n.type })),
      };
    }
    default:
      throw new Error(`Op không nhận ra: ${op}`);
  }
}
