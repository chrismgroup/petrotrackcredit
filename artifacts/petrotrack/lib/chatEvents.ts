type ChatChangeListener = (conversationId: number | null) => void;

const listeners = new Set<ChatChangeListener>();

/** Subscribes to realtime chat changes; returns an unsubscribe function. */
export function subscribeChatChanges(listener: ChatChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitChatChange(conversationId: number | null): void {
  for (const listener of [...listeners]) {
    try {
      listener(conversationId);
    } catch {
      // A failing screen listener must not stop the others.
    }
  }
}
