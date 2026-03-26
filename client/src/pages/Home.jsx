/**
 * Home.jsx
 * Landing page — create a new room or join an existing one.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Home.module.css';

export default function Home() {
  const navigate = useNavigate();

  const [userName, setUserName] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [tab, setTab] = useState('create'); // 'create' | 'join'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Create room ────────────────────────────────────────────────────────────
  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    if (!userName.trim()) return setError('Please enter your name');

    setLoading(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: userName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create room');

      // Pass userName via navigation state
      navigate(`/room/${data.roomId}`, { state: { userName: userName.trim() } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Join room ──────────────────────────────────────────────────────────────
  async function handleJoin(e) {
    e.preventDefault();
    setError('');
    if (!userName.trim()) return setError('Please enter your name');
    if (!joinRoomId.trim()) return setError('Please enter a Room ID');

    const roomId = joinRoomId.trim().toUpperCase();
    setLoading(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}`);
      if (res.status === 404) throw new Error('Room not found. Check the ID and try again.');
      if (!res.ok) throw new Error('Something went wrong');

      navigate(`/room/${roomId}`, { state: { userName: userName.trim() } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      {/* ── Hero ── */}
      <div className={styles.hero}>
        <div className={styles.logo}>🎬</div>
        <h1 className={styles.title}>Watch Party</h1>
        <p className={styles.subtitle}>
          Watch YouTube videos together in perfect sync
        </p>
      </div>

      {/* ── Card ── */}
      <div className={styles.card}>
        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'create' ? styles.tabActive : ''}`}
            onClick={() => { setTab('create'); setError(''); }}
          >
            Create Room
          </button>
          <button
            className={`${styles.tab} ${tab === 'join' ? styles.tabActive : ''}`}
            onClick={() => { setTab('join'); setError(''); }}
          >
            Join Room
          </button>
        </div>

        {/* Name input (shared) */}
        <div className={styles.field}>
          <label className={styles.label}>Your Name</label>
          <input
            className="input"
            type="text"
            placeholder="Enter your display name"
            value={userName}
            maxLength={30}
            onChange={(e) => setUserName(e.target.value)}
            autoFocus
          />
        </div>

        {/* Create tab */}
        {tab === 'create' && (
          <form onSubmit={handleCreate}>
            {error && <p className={styles.error}>{error}</p>}
            <button
              type="submit"
              className={`btn btn-primary btn-lg ${styles.fullBtn}`}
              disabled={loading}
            >
              {loading ? 'Creating…' : '✨ Create New Room'}
            </button>
          </form>
        )}

        {/* Join tab */}
        {tab === 'join' && (
          <form onSubmit={handleJoin}>
            <div className={styles.field}>
              <label className={styles.label}>Room ID</label>
              <input
                className="input"
                type="text"
                placeholder="e.g. A1B2C3D4"
                value={joinRoomId}
                maxLength={8}
                onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
              />
            </div>
            {error && <p className={styles.error}>{error}</p>}
            <button
              type="submit"
              className={`btn btn-primary btn-lg ${styles.fullBtn}`}
              disabled={loading}
            >
              {loading ? 'Joining…' : '🚀 Join Room'}
            </button>
          </form>
        )}
      </div>

      <p className={styles.footer}>No account needed · Free forever</p>
    </div>
  );
}
