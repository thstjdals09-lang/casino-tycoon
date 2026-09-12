import { sendChatMessage, subscribeChat, type ChatMessage } from '../game/chat';
import { emitStateChanged } from '../game/events';
import type { GameState } from '../game/GameState';

export class ChatWidget {
  private root: HTMLElement;
  private gameState: GameState;
  private expanded = false;
  private messages: ChatMessage[] = [];

  constructor(root: HTMLElement, gameState: GameState) {
    this.root = root;
    this.gameState = gameState;
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('submit', (e) => this.onSubmit(e));

    // 채팅창을 펼친 상태에서 게임 화면의 다른 빈 곳을 탭하면 접히게.
    document.addEventListener('pointerdown', (e) => {
      if (this.expanded && !this.root.contains(e.target as Node)) {
        this.expanded = false;
        this.render();
      }
    });

    subscribeChat((messages) => {
      this.messages = messages;
      this.render();
      this.scrollToBottom();
    });

    this.render();
  }

  private onClick(e: Event) {
    const target = e.target as HTMLElement;
    if (target.closest('#chat-collapsed')) {
      this.expanded = true;
      this.render();
      this.scrollToBottom();
      return;
    }
    if (target.closest('[data-action="collapse-chat"]')) {
      this.expanded = false;
      this.render();
    }
  }

  private onSubmit(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const input = form.querySelector<HTMLInputElement>('#chat-input');
    if (!input || !input.value.trim()) return;
    sendChatMessage(this.gameState.venueName, input.value);
    input.value = '';
    this.gameState.recordChatSent();
    this.gameState.save();
    emitStateChanged();
  }

  private scrollToBottom() {
    const log = this.root.querySelector('#chat-log');
    if (log) log.scrollTop = log.scrollHeight;
  }

  private render(): void {
    const last = this.messages[this.messages.length - 1];

    if (!this.expanded) {
      this.root.innerHTML = `
        <div id="chat-collapsed" class="chat-collapsed">
          💬 ${last ? `<b>${last.username}</b>: ${escapeHtml(last.text)}` : '채팅을 눌러 대화에 참여해보세요'}
        </div>
      `;
      return;
    }

    const lines = this.messages
      .map((m) => `<div class="chat-line"><b>${escapeHtml(m.username)}</b>: ${escapeHtml(m.text)}</div>`)
      .join('');

    this.root.innerHTML = `
      <div class="chat-expanded">
        <div class="chat-header">
          <span>💬 실시간 채팅</span>
          <button type="button" data-action="collapse-chat">▲ 접기</button>
        </div>
        <div id="chat-log" class="chat-log">${lines || '<p class="empty">아직 메시지가 없어요. 첫 메시지를 남겨보세요!</p>'}</div>
        <form class="chat-form">
          <input id="chat-input" type="text" placeholder="메시지 입력..." maxlength="200" autocomplete="off" />
          <button type="submit">전송</button>
        </form>
      </div>
    `;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
