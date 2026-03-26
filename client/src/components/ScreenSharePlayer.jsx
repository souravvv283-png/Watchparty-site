/**
 * ScreenSharePlayer.jsx
 * Renders the host's screen share stream in a <video> element.
 * Used by non-host viewers only.
 */
import { useEffect, useRef } from 'react';
import styles from './ScreenSharePlayer.module.css';

export default function ScreenSharePlayer({ stream }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream) {
    return (
      <div className={styles.waiting}>
        <div className={styles.pulse}>📡</div>
        <p>Connecting to screen share…</p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <video
        ref={videoRef}
        className={styles.video}
        autoPlay
        playsInline
        muted={false}
      />
      <div className={styles.liveTag}>● LIVE</div>
    </div>
  );
}
