/**
 * VideoPlayer.jsx
 * Wraps the YouTube IFrame Player API (mode="youtube")
 * OR shows the host's own screen share preview (mode="screenshare").
 *
 * Exposes an imperative handle via forwardRef so Room can call:
 *   playerRef.current.play()
 *   playerRef.current.pause()
 *   playerRef.current.seekTo(seconds)
 *   playerRef.current.getCurrentTime()
 *   playerRef.current.isPlaying()
 */
import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import styles from './VideoPlayer.module.css';

// Load the YouTube IFrame API script once, returns a Promise
function loadYTScript() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  return new Promise((resolve) => {
    if (document.getElementById('yt-api-script')) {
      const orig = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (orig) orig(); resolve(); };
      return;
    }
    window.onYouTubeIframeAPIReady = resolve;
    const tag = document.createElement('script');
    tag.id = 'yt-api-script';
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
}

const VideoPlayer = forwardRef(function VideoPlayer(
  { videoId, isHost, onPlay, onPause, onSeek, mode, localStream },
  ref
) {
  const containerRef  = useRef(null);
  const previewRef    = useRef(null);
  const playerRef     = useRef(null);
  const readyRef      = useRef(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [apiError,    setApiError]    = useState(false);

  const cbRef = useRef({ onPlay, onPause, onSeek });
  useEffect(() => { cbRef.current = { onPlay, onPause, onSeek }; }, [onPlay, onPause, onSeek]);

  // ── Imperative API ─────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    play()           { if (readyRef.current) playerRef.current?.playVideo(); },
    pause()          { if (readyRef.current) playerRef.current?.pauseVideo(); },
    seekTo(s)        { if (readyRef.current) playerRef.current?.seekTo(s, true); },
    getCurrentTime() { return readyRef.current ? (playerRef.current?.getCurrentTime() ?? 0) : 0; },
    isPlaying()      { return readyRef.current && playerRef.current?.getPlayerState() === 1; },
  }));

  // ── Host screen share preview ──────────────────────────────────────────────
  useEffect(() => {
    if (previewRef.current && localStream) {
      previewRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // ── YouTube player lifecycle ───────────────────────────────────────────────
  useEffect(() => {
    if (!videoId || mode === 'screenshare') return;
    let destroyed = false;

    loadYTScript().then(() => {
      if (destroyed) return;
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
        readyRef.current = false;
        setPlayerReady(false);
      }
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          autoplay: 0,
          controls:    isHost ? 1 : 0,
          disablekb:   isHost ? 0 : 1,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady() {
            if (destroyed) return;
            readyRef.current = true;
            setPlayerReady(true);
          },
          onStateChange(event) {
            if (!isHost) return;
            const { YT } = window;
            if (event.data === YT.PlayerState.PLAYING) cbRef.current.onPlay();
            else if (event.data === YT.PlayerState.PAUSED) cbRef.current.onPause();
          },
          onError() { setApiError(true); },
        },
      });
    }).catch(() => setApiError(true));

    return () => {
      destroyed = true;
      try { playerRef.current?.destroy(); } catch (_) {}
      playerRef.current = null;
      readyRef.current  = false;
    };
  }, [videoId, isHost, mode]);

  // ── Screen-share mode: host preview ───────────────────────────────────────
  if (mode === 'screenshare') {
    return (
      <div className={styles.wrapper}>
        {localStream ? (
          <>
            <video ref={previewRef} className={styles.player} autoPlay playsInline muted />
            <div className={styles.hostPreviewBadge}>
              📡 Sharing your screen — viewers see this live
            </div>
          </>
        ) : (
          <div className={styles.placeholder}>
            <div className={styles.placeholderIcon}>📡</div>
            <p className={styles.placeholderText}>Starting screen capture…</p>
          </div>
        )}
      </div>
    );
  }

  // ── YouTube mode ───────────────────────────────────────────────────────────
  if (!videoId) {
    return (
      <div className={styles.placeholder}>
        <div className={styles.placeholderIcon}>📺</div>
        <p className={styles.placeholderText}>
          {isHost
            ? 'Paste a YouTube URL below — or start Screen Share'
            : 'Waiting for the host to pick a video or start screen sharing…'}
        </p>
      </div>
    );
  }

  if (apiError) {
    return (
      <div className={styles.placeholder}>
        <div className={styles.placeholderIcon}>⚠️</div>
        <p className={styles.placeholderText}>
          Failed to load video. Make sure the YouTube URL is valid and the video is public.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div ref={containerRef} className={styles.player} />
      {!playerReady && (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading player…</span>
        </div>
      )}
      {!isHost && playerReady && (
        <div className={styles.overlay} title="Only the host controls playback" />
      )}
    </div>
  );
});

export default VideoPlayer;
