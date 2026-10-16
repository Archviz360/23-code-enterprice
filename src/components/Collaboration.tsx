import { useState } from 'react';
import { useCollaborationStore } from '../store/collaborationStore';
import { useEditorStore } from '../store/editorStore';
export function Collaboration() {
  const { roomId, initializeCollaboration, disconnectCollaboration } = useCollaborationStore();
  const [room, setRoom] = useState('');
  const [expanded, setExpanded] = useState(false);
  function connect(host: boolean) {
    if (!confirm('Experimental peer collaboration uses a public signaling server. Anyone with the room ID can access shared file contents. Joining can replace a matching file buffer with shared text: save your work first. Only share non-sensitive code. Continue?')) return;
    try { initializeCollaboration(host ? crypto.randomUUID() : room.trim(), host); }
    catch (error) { useEditorStore.getState().setMessage((error as Error).message); }
  }
  return <section className="collaboration">
    <button className="text-button" onClick={() => setExpanded(!expanded)}>Peer collaboration (experimental)</button>
    {expanded && <><p className="muted">Peers must open matching file paths. This shares text, not files or a terminal. Internet and a reachable signaling server are required.</p>
      {roomId ? <><code className="room-id">{roomId}</code><button onClick={() => void navigator.clipboard.writeText(roomId).catch(() => useEditorStore.getState().setMessage('Clipboard unavailable. Select and copy the room ID.'))}>Copy room ID</button><button onClick={disconnectCollaboration}>Disconnect</button></> : <><button onClick={() => connect(true)}>Start room</button><input aria-label="Room ID" placeholder="Room ID" value={room} onChange={e => setRoom(e.target.value)} /><button disabled={!room.trim()} onClick={() => connect(false)}>Join room</button></>}
    </>}
  </section>;
}
