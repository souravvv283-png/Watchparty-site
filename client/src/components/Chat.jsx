/**
 * Chat.jsx
 * Real-time chat panel.
 * Auto-scrolls to the latest message.
 * Distinguishes system messages from user messages.
 */
import { useState, useEffect, useRef } from 'react';
import styles from './Chat.module.css';

/** Format a timestamp to HH:MM */
function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Pick a consistent colour per username */
const COLORS = [
  '#7c5cbf', '#5b8dd9', '#4caf87', '#e09252',
  '#d97474', '#74b8d9', '#a074d9', '#74d9a0',
];
function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function Chat({ messages, onSend }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  // Auto-scroll whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSend(e) {
    e.preventDefault();
    const msg = input.trim();
    if (!msg) return;
    onSend(msg);
    setInput('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSend(e);
    }
  }

  return (
    <div className={styles.chat}>
      <div className={styles.header}>
        <span>💬 Chat</span>
        <span className={styles.msgCount}>{messages.filter(m => !m.system).length}</span>
      </div>

      <div className={styles.messages}>
        {messages.length === 0 && (
          <p className={styles.empty}>No messages yet. Say hello! 👋</p>
        )}

        {messages.map((msg) =>
          msg.system ? (
            <div key={msg.id} className={styles.system}>
              {msg.message}
            </div>
          ) : (
            <div key={msg.id} className={styles.message}>
              <div className={styles.msgMeta}>
                <span
                  className={styles.msgName}
                  style={{ color: colorForName(msg.userName) }}
                >
                  {msg.userName}
                </span>
                <span className={styles.msgTime}>{formatTime(msg.timestamp)}</span>
              </div>
              <p className={styles.msgText}>{msg.message}</p>
            </div>
          )
        )}
        <div ref={bottomRef} />
      </div>

      <form className={styles.inputRow} onSubmit={handleSend}>
        <input
          className={`input ${styles.chatInput}`}
          type="text"
          placeholder="Type a message…"
          value={input}
          maxLength={500}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="submit"
          className={`btn btn-primary btn-sm ${styles.sendBtn}`}
          disabled={!input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}
