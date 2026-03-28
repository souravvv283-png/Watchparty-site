/**
 * Controls.jsx
 * Host: YouTube URL, play/pause/seek, screen share
 * Viewers: screen share button + ready button
 */
import { useState } from 'react';
import styles from './Controls.module.css';

function extractVideoId(input) {
  input = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  try {
    const url = new URL(input);
    if (url.searchParams.has('v'))           return url.searchParams.get('v');
    if (url.hostname === 'youtu.be')         return url.pathname.slice(1).split('?')[0];
    if (url.pathname.startsWith('/embed/'))  return url.pathname.split('/embed/')[1].split('?')[0];
    if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/shorts/')[1].split('?')[0];
  } catch (_) {}
  return null;
}

export default function Controls({
  isHost,
  onSetVideo,
  onPlay,
  onPause,
  onSeek,
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

  // ── Screen share button (shown to EVERYONE) ────────────────────────────────
  const screenShareBtn = isScreenSharing ? (
    <button className={`btn btn-danger btn-sm ${styles.ssBtn}`} onClick={onStopScreenShare}>
      ⏹ Stop Sharing
    </button>
  ) : (
    <button className={`btn btn-secondary btn-sm ${styles.ssBtn}`} onClick={onStartScreenShare}>
      🖥 Share Screen
    </button>
  );

  // ── Viewer bar ─────────────────────────────────────────────────────────────
  if (!isHost) {
    return (
      <div className={styles.bar}>
        <span className={styles.viewerNote}>👁 Viewer — host controls playback</span>
        <div className={styles.barRight}>
          {screenShareBtn}
          <button
            className={`btn ${isReady ? 'btn-success' : 'btn-secondary'} btn-sm`}
            onClick={onToggleReady}
          >
            {isReady ? '✓ Ready!' : 'Ready'}
          </button>
        </div>
      </div>
    );
  }

  // ── Host panel ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.panel}>
      {/* Row 1: URL + screen share */}
      <div className={styles.topRow}>
        <form className={styles.urlForm} onSubmit={handleSetVideo}>
          <input
            className={`input ${styles.urlInput}`}
            type="text"
            placeholder={isScreenSharing ? 'Stop screen share to load YouTube' : 'Paste YouTube URL…'}
            value={urlInput}
            disabled={isScreenSharing}
            onChange={(e) => { setUrlInput(e.target.value); setUrlError(''); }}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={isScreenSharing}>
            Load
          </button>
        </form>
        {screenShareBtn}
      </div>

      {urlError && <p className={styles.urlError}>{urlError}</p>}

      {/* Row 2: playback controls (YouTube only) */}
      {!isScreenSharing && (
        <div className={styles.playRow}>
          <button className="btn btn-primary btn-sm"   onClick={onPlay}>▶ Play</button>
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

          <span className={styles.hostBadge}>👑 Host</span>
        </div>
      )}

      {/* Screen sharing status */}
      {isScreenSharing && (
        <div className={styles.sharingRow}>
          <span className={styles.sharingDot} />
          <span className={styles.sharingText}>Broadcasting your screen to all viewers</span>
          <span className={styles.hostBadge}>👑 Host</span>
        </div>
      )}
    </div>
  );
}
