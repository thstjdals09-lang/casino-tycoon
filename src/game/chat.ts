import { addDoc, collection, limitToLast, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export interface ChatMessage {
  username: string;
  text: string;
  createdAt: number | null;
}

const COLLECTION = 'chat_messages';

export async function sendChatMessage(displayName: string, text: string): Promise<void> {
  const trimmed = text.trim().slice(0, 200);
  if (!displayName || !trimmed) return;
  await addDoc(collection(db, COLLECTION), {
    username: displayName,
    text: trimmed,
    createdAt: serverTimestamp(),
  });
}

/** 최근 메시지 N개를 실시간 구독. 반환값은 구독 해제 함수. */
export function subscribeChat(onUpdate: (messages: ChatMessage[]) => void, count = 50): () => void {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'asc'), limitToLast(count));
  return onSnapshot(
    q,
    (snap) => {
      const messages = snap.docs.map((d) => {
        const data = d.data();
        return {
          username: data.username as string,
          text: data.text as string,
          createdAt: data.createdAt?.toMillis?.() ?? null,
        };
      });
      onUpdate(messages);
    },
    () => {
      onUpdate([]);
    }
  );
}
