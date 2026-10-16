import { create } from 'zustand';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';

interface CollaborationState {
  doc: Y.Doc | null; provider: WebrtcProvider | null; roomId: string; isHost: boolean;
  initializeCollaboration: (roomId: string, isHost: boolean) => void;
  disconnectCollaboration: () => void;
}
export const useCollaborationStore = create<CollaborationState>((set, get) => ({
  doc: null, provider: null, roomId: '', isHost: false,
  initializeCollaboration: (roomId, isHost) => {
    get().disconnectCollaboration();
    const doc = new Y.Doc();
    const provider = new WebrtcProvider(`23-code-${roomId}`, doc, { signaling: ['wss://signaling.yjs.dev'] });
    set({ doc, provider, roomId, isHost });
  },
  disconnectCollaboration: () => {
    const { provider, doc } = get();
    set({ doc: null, provider: null, roomId: '', isHost: false });
    provider?.destroy(); doc?.destroy();
  },
}));
