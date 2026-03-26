/**
 * Controls.jsx
 * Host controls: YouTube URL loader, playback buttons, and Screen Share toggle.
 * Non-hosts see viewer mode with a Ready button.
 */
import { useState } from 'react';
import styles from './Controls.module.css';

function extractVideoId(input) {
  input = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  try {
    const url = new URL(input);
    if (url.searchParams.has('v'))          return url.searchParams.get('v');
    if (url.hostname === 'youtu.be')        return url.pathname.slice(1).split('?')[0];
    if (url.pathname.startsWith('/embed/')) return url.pathname.split('/embed/')[1].split('?')[0];
    if (url.pathname.startsWith('/shorts/'))return url.pathname.split('/shorts/')[1].split('?')[0];
  } catch (_) {}
  return null;
}

export default function Controls({
  isHost,
  onSetVideo,
  onPlay,
  onPause,
  onSeek,
  playerRef,
  isReady,
  onToggleReady,
  isScreenSharing,
  onStartScreenShare,
  onStopScreenShare,
}) {
  const [urlInput,  setUrlInput]  = useState('');
  const [urlError,  setUrlError]  = useState('');
  const [seekInput, setSeekInput] = useState('');

  function handleSetVideo(e) {
    e.preventDefault();
    setUrlError('');
    const videoId = extractVideoId(urlInput);
    if (!videoId) {
      setUrlError('Invalid YouTube URL. Try: https://www.youtube.com/watch?v=...');
      return;
    }
    onSetVideo(videoId);
    setUrlInput('');
  }

  function handleSeek(e) {
    e.preventDefault();
    const seconds = parseFloat(seekInput);
    if (isNaN(seconds) || seconds < 0) return;
    onSeek(seconds);
    setSeekInput('');
  }

  // ── Viewer bar ─────────────────────────────────────────────────────────────
  if (!isHost) {
    return (
      <div className={styles.bar}>
        <span className={styles.viewerNote}>👁 Viewer — host controls playback</span>
        <button
          className={`btn ${isReady ? 'btn-success' : 'btn-secondary'} btn-sm`}
          onClick={onToggleReady}
        >
          {isReady ? '✓ Ready!' : 'Mark Ready'}
        </button>
      </div>
    );
  }

  // ── Host panel ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.panel}>

      {/* ── Row 1: YouTube URL + Screen Share toggle ── */}
      <div className={styles.topRow}>
        {/* YouTube URL — disabled while screen sharing */}
        <form className={styles.urlForm} onSubmit={handleSetVideo}>
          <input
            className={`input ${styles.urlInput}`}
            type="text"
            placeholder={isScreenSharing ? 'Stop screen share to load YouTube' : 'Paste YouTube URL…'}
            value={urlInput}
            disabled={isScreenSharing}
            onChange={(e) => { setUrlInput(e.target.value); setUrlError(''); }}
          />
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={isScreenSharing}
          >
            Load
          </button>
        </form>

        {/* Screen share button */}
        {isScreenSharing ? (
          <button
            className={`btn btn-danger btn-sm ${styles.ssBtn}`}
            onClick={onStopScreenShare}
          >
            ⏹ Stop Sharing
          </button>
        ) : (
          <button
            className={`btn btn-secondary btn-sm ${styles.ssBtn}`}
            onClick={onStartScreenShare}
          >
            🖥 Share Screen
          </button>
        )}
      </div>

      {urlError && <p className={styles.urlError}>{urlError}</p>}

      {/* ── Row 2: Playback controls (YouTube only) ── */}
      {!isScreenSharing && (
        <div className={styles.playRow}>
          <button className="btn btn-primary btn-sm" onClick={onPlay}>▶ Play</button>
          <button className="btn btn-secondary btn-sm" onClick={onPause}>⏸ Pause</button>

          <form className={styles.seekForm} onSubmit={handleSeek}>
            <input
              className={`input ${styles.seekInput}`}
              type="number"
              placeholder="Seek (s)"
              value={seekInput}
              min="0"
              onChange={(e) => setSeekInput(e.target.value)}
            />
            <button type="submit" className="btn btn-secondary btn-sm">⏩</button>
          </form>

          <span className={styles.hostBadge}>👑 You are the host</span>
        </div>
      )}

      {/* ── Screen sharing status row ── */}
      {isScreenSharing && (
        <div className={styles.sharingRow}>
          <span className={styles.sharingDot} />
          <span className={styles.sharingText}>Broadcasting your screen to all viewers</span>
          <span className={styles.hostBadge}>👑 You are the host</span>
        </div>
      )}
    </div>
  );
}
