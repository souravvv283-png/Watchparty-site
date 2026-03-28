/**
 * Room.jsx — Watch Party main room
 * - Anyone can screen share (not just host)
 * - Chat notification sound via Web Audio API
 * - Mobile optimised layout
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import socket from '../socket';
import VideoPlayer from '../components/VideoPlayer';
import ScreenSharePlayer from '../components/ScreenSharePlayer';
import Chat from '../components/Chat';
import UserList from '../components/UserList';
import Controls from '../components/Controls';
import styles from './Room.module.css';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export default function Room() {
  const { roomId }  = useParams();
  const navigate    = useNavigate();
  const location    = useLocation();

  const [userName] = useState(() => {
    const fromState = location.state?.userName;
    if (fromState) return fromState;
    return window.prompt('Enter your display name:') || 'Guest';
  });

  // ── Room state ──────────────────────────────────────────────────────────────
  const [connected,       setConnected]       = useState(false);
  const [isHost,          setIsHost]          = useState(false);
  const [hostId,          setHostId]          = useState(null);
  const [users,           setUsers]           = useState([]);
  const [videoId,         setVideoId]         = useState(null);
  const [messages,        setMessages]        = useState([]);
  const [error,           setError]           = useState('');
  const [copied,          setCopied]          = useState(false);
  const [isReady,         setIsReady]         = useState(false);

  // ── Screen share state ──────────────────────────────────────────────────────
  const [isScreenSharing, setIsScreenSharing] = useState(false); // THIS user is sharing
  const [localStream,     setLocalStream]     = useState(null);  // this user's capture stream
  const [remoteStream,    setRemoteStream]    = useState(null);  // received stream
  const [viewMode,        setViewMode]        = useState('youtube');
  const [sharerName,      setSharerName]      = useState('');

  // WebRTC peer connections (sharer → one per viewer)
  const peerConns     = useRef(new Map());
  const playerRef     = useRef(null);
  const isSharingRef  = useRef(false);
  const isHostRef     = useRef(isHost);
  const localStreamRef = useRef(localStream);

  useEffect(() => { isSharingRef.current  = isScreenSharing; }, [isScreenSharing]);
  useEffect(() => { isHostRef.current     = isHost;          }, [isHost]);
  useEffect(() => { localStreamRef.current = localStream;    }, [localStream]);

  // ── WebRTC: sharer → send offer to one viewer ───────────────────────────────
  function createSharerPeer(viewerId, stream) {
    if (peerConns.current.has(viewerId)) {
      peerConns.current.get(viewerId).close();
    }
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConns.current.set(viewerId, pc);

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('ice-candidate', { targetId: viewerId, candidate });
    };

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => socket.emit('screen-share-offer', {
        roomId, offer: pc.localDescription, targetId: viewerId,
      }))
      .catch(console.error);

    return pc;
  }

  // ── WebRTC: viewer → answer offer from sharer ───────────────────────────────
  function createViewerPeer(sharerId, offer) {
    if (peerConns.current.has('sharer')) {
      peerConns.current.get('sharer').close();
    }
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConns.current.set('sharer', pc);

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
      setViewMode('screenshare');
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('ice-candidate', { targetId: sharerId, candidate });
    };

    pc.setRemoteDescription(new RTCSessionDescription(offer))
      .then(() => pc.createAnswer())
      .then((answer) => pc.setLocalDescription(answer))
      .then(() => socket.emit('screen-share-answer', {
        roomId, answer: pc.localDescription, sharerId,
      }))
      .catch(console.error);

    return pc;
  }

  // ── Stop sharing ────────────────────────────────────────────────────────────
  const stopScreenShare = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    peerConns.current.forEach((pc) => pc.close());
    peerConns.current.clear();
    setLocalStream(null);
    setIsScreenSharing(false);
    setViewMode('youtube');
    socket.emit('screen-share-stop', { roomId });
  }, [roomId]);

  // ── Start sharing — available to EVERYONE ───────────────────────────────────
  async function startScreenShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      alert('Screen sharing is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });
      setLocalStream(stream);
      setIsScreenSharing(true);
      setViewMode('screenshare');
      stream.getVideoTracks()[0].onended = () => stopScreenShare();
      socket.emit('screen-share-start', { roomId });
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        console.error('getDisplayMedia error:', err);
        alert('Could not start screen sharing: ' + err.message);
      }
    }
  }

  // ── Chat notification sound (Web Audio API — no external files needed) ──────
  function playChatSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } catch (_) {}
  }

  // ── Socket events ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket.connected) socket.connect();

    function onConnect() {
      setConnected(true);
      socket.emit('join-room', { roomId, userName });
    }
    function onDisconnect() { setConnected(false); }

    function onRoomJoined({ isHost: host, hostId: hid, users: us, videoId: vid }) {
      setIsHost(host);
      isHostRef.current = host;
      setHostId(hid);
      setUsers(us);
      if (vid) setVideoId(vid);
    }

    function onErrorMsg({ message }) { setError(message); }

    function onUserJoined({ users: us }) {
      setUsers(us);
      addSystemMessage('A new viewer joined 👋');
    }

    function onUserLeft({ userName: name, users: us, newHostId }) {
      setUsers(us);
      addSystemMessage(`${name} left the room`);
      if (newHostId === socket.id) {
        setIsHost(true);
        isHostRef.current = true;
        setHostId(newHostId);
        addSystemMessage("You're now the host 👑");
      } else {
        setHostId(newHostId);
      }
    }

    function onVideoChanged({ videoId: vid }) { setVideoId(vid); }

    function onPlay({ currentTime }) {
      playerRef.current?.seekTo(currentTime);
      playerRef.current?.play();
    }
    function onPause({ currentTime }) {
      playerRef.current?.seekTo(currentTime);
      playerRef.current?.pause();
    }
    function onSeek({ currentTime }) { playerRef.current?.seekTo(currentTime); }

    function onSync({ currentTime, isPlaying }) {
      const player = playerRef.current;
      if (!player) return;
      const local = player.getCurrentTime?.() ?? 0;
      if (Math.abs(local - currentTime) > 2) player.seekTo(currentTime);
      if (isPlaying) player.play(); else player.pause();
    }

    // ── Screen share ──────────────────────────────────────────────────────────
    function onScreenShareStart({ sharerId, sharerName: sName }) {
      setViewMode('screenshare');
      setSharerName(sName);
      addSystemMessage(`${sName} started screen sharing 📡`);
      socket.emit('screen-share-ready', { roomId, sharerId });
    }

    function onScreenShareReady({ viewerId }) {
      if (!isSharingRef.current) return;
      const stream = localStreamRef.current;
      if (!stream) return;
      createSharerPeer(viewerId, stream);
    }

    function onScreenShareOffer({ offer, sharerId }) {
      createViewerPeer(sharerId, offer);
    }

    function onScreenShareAnswer({ answer, viewerId }) {
      const pc = peerConns.current.get(viewerId);
      if (!pc) return;
      pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(console.error);
    }

    function onIceCandidate({ candidate, fromId }) {
      const key = isSharingRef.current ? fromId : 'sharer';
      const pc  = peerConns.current.get(key);
      if (!pc) return;
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
    }

    function onScreenShareStop() {
      peerConns.current.get('sharer')?.close();
      peerConns.current.delete('sharer');
      setRemoteStream(null);
      setViewMode('youtube');
      setSharerName('');
      addSystemMessage('Screen sharing ended');
    }

    // ── Chat — play sound for incoming messages ────────────────────────────────
    function onChatMessage(msg) {
      setMessages((p) => [...p, msg]);
      // Only play sound if message is from someone else
      if (msg.userId !== socket.id) playChatSound();
    }

    function onUsersUpdated({ users: us }) { setUsers(us); }

    socket.on('connect',             onConnect);
    socket.on('disconnect',          onDisconnect);
    socket.on('room-joined',         onRoomJoined);
    socket.on('error-msg',           onErrorMsg);
    socket.on('user-joined',         onUserJoined);
    socket.on('user-left',           onUserLeft);
    socket.on('video-changed',       onVideoChanged);
    socket.on('play',                onPlay);
    socket.on('pause',               onPause);
    socket.on('seek',                onSeek);
    socket.on('sync',                onSync);
    socket.on('screen-share-start',  onScreenShareStart);
    socket.on('screen-share-ready',  onScreenShareReady);
    socket.on('screen-share-offer',  onScreenShareOffer);
    socket.on('screen-share-answer', onScreenShareAnswer);
    socket.on('ice-candidate',       onIceCandidate);
    socket.on('screen-share-stop',   onScreenShareStop);
    socket.on('chat-message',        onChatMessage);
    socket.on('users-updated',       onUsersUpdated);

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect',             onConnect);
      socket.off('disconnect',          onDisconnect);
      socket.off('room-joined',         onRoomJoined);
      socket.off('error-msg',           onErrorMsg);
      socket.off('user-joined',         onUserJoined);
      socket.off('user-left',           onUserLeft);
      socket.off('video-changed',       onVideoChanged);
      socket.off('play',                onPlay);
      socket.off('pause',               onPause);
      socket.off('seek',                onSeek);
      socket.off('sync',                onSync);
      socket.off('screen-share-start',  onScreenShareStart);
      socket.off('screen-share-ready',  onScreenShareReady);
      socket.off('screen-share-offer',  onScreenShareOffer);
      socket.off('screen-share-answer', onScreenShareAnswer);
      socket.off('ice-candidate',       onIceCandidate);
      socket.off('screen-share-stop',   onScreenShareStop);
      socket.off('chat-message',        onChatMessage);
      socket.off('users-updated',       onUsersUpdated);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Host periodic YouTube sync ──────────────────────────────────────────────
  useEffect(() => {
    if (!isHost || isScreenSharing) return;
    const id = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      socket.emit('sync', {
        roomId,
        currentTime: player.getCurrentTime?.() ?? 0,
        isPlaying:   player.isPlaying?.() ?? false,
      });
    }, 3000);
    return () => clearInterval(id);
  }, [isHost, isScreenSharing, roomId]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      peerConns.current.forEach((pc) => pc.close());
    };
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function addSystemMessage(text) {
    setMessages((p) => [
      ...p,
      { id: Date.now().toString(), system: true, message: text, timestamp: Date.now() },
    ]);
  }

  function sendChatMessage(message) { socket.emit('chat-message', { roomId, message }); }
  function handleSetVideo(vid)      { socket.emit('set-video', { roomId, videoId: vid }); }

  function handlePlay() {
    const t = playerRef.current?.getCurrentTime?.() ?? 0;
    socket.emit('play', { roomId, currentTime: t });
  }
  function handlePause() {
    const t = playerRef.current?.getCurrentTime?.() ?? 0;
    socket.emit('pause', { roomId, currentTime: t });
  }
  function handleSeek(time) {
    socket.emit('seek', { roomId, currentTime: time });
    playerRef.current?.seekTo(time);
  }
  function handleToggleReady() {
    const next = !isReady;
    setIsReady(next);
    socket.emit('toggle-ready', { roomId, isReady: next });
  }
  function copyRoomId() {
    navigator.clipboard.writeText(roomId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Error page ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={styles.errorPage}>
        <div className={styles.errorCard}>
          <div style={{ fontSize: 48 }}>😕</div>
          <h2>Oops!</h2>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>Back to Home</button>
        </div>
      </div>
    );
  }

  const showScreenShareViewer = !isScreenSharing && viewMode === 'screenshare';

  return (
    <div className={styles.layout}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.brandIcon}>🎬</span>
          <span className={styles.brand}>Watch Party</span>
        </div>

        <div className={styles.headerCenter}>
          <span className={styles.roomLabel}>Room</span>
          <button className={styles.roomId} onClick={copyRoomId} title="Click to copy">
            {roomId}
            <span className={styles.copyIcon}>{copied ? '✓' : '⎘'}</span>
          </button>
          {!connected && <span className={styles.offlineDot} title="Reconnecting…" />}
          {(isScreenSharing || viewMode === 'screenshare') && (
            <span className={styles.liveChip}>
              ● {isScreenSharing ? 'You are sharing' : `${sharerName} sharing`}
            </span>
          )}
        </div>

        <div className={styles.headerRight}>
          {isHost && <span className="badge badge-host">👑 Host</span>}
          <span className={styles.headerUser}>{userName}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/')}>Leave</button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className={styles.body}>
        <div className={styles.mainCol}>
          <div className={styles.videoWrap}>
            {showScreenShareViewer ? (
              <ScreenSharePlayer stream={remoteStream} sharerName={sharerName} />
            ) : (
              <VideoPlayer
                ref={playerRef}
                videoId={videoId}
                isHost={isHost}
                onPlay={handlePlay}
                onPause={handlePause}
                onSeek={handleSeek}
                mode={viewMode}
                localStream={localStream}
              />
            )}
          </div>

          <Controls
            isHost={isHost}
            onSetVideo={handleSetVideo}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeek={handleSeek}
            playerRef={playerRef}
            isReady={isReady}
            onToggleReady={handleToggleReady}
            isScreenSharing={isScreenSharing}
            onStartScreenShare={startScreenShare}
            onStopScreenShare={stopScreenShare}
          />
        </div>

        <div className={styles.sideCol}>
          <UserList users={users} hostId={hostId} myId={socket.id} />
          <Chat messages={messages} onSend={sendChatMessage} />
        </div>
      </div>
    </div>
  );
}
