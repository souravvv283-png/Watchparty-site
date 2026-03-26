/**
 * Room.jsx
 * Main watch-party room.
 * Handles Socket.io events, YouTube sync, and WebRTC screen sharing.
 *
 * Screen Share Architecture:
 *   HOST side:
 *     - getDisplayMedia() → localStream
 *     - For each viewer: create RTCPeerConnection → addTrack → createOffer → send via socket
 *     - On 'screen-share-answer' → setRemoteDescription
 *     - On 'ice-candidate' → addIceCandidate
 *     - On stream end (browser stop button) → stopScreenShare()
 *
 *   VIEWER side:
 *     - On 'screen-share-start' → emit 'screen-share-ready' to host
 *     - On 'screen-share-offer' → create RTCPeerConnection → setRemoteDesc → createAnswer → send
 *     - On 'ice-candidate' → addIceCandidate
 *     - peer.ontrack → set remoteStream → render in <ScreenSharePlayer>
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

// Free/public STUN servers — enough for most networks
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export default function Room() {
  const { roomId }   = useParams();
  const navigate     = useNavigate();
  const location     = useLocation();

  const [userName] = useState(() => {
    const fromState = location.state?.userName;
    if (fromState) return fromState;
    return window.prompt('Enter your display name:') || 'Guest';
  });

  // ── Room state ─────────────────────────────────────────────────────────────
  const [connected,       setConnected]       = useState(false);
  const [isHost,          setIsHost]          = useState(false);
  const [hostId,          setHostId]          = useState(null);
  const [users,           setUsers]           = useState([]);
  const [videoId,         setVideoId]         = useState(null);
  const [messages,        setMessages]        = useState([]);
  const [error,           setError]           = useState('');
  const [copied,          setCopied]          = useState(false);
  const [isReady,         setIsReady]         = useState(false);

  // ── Screen share state ─────────────────────────────────────────────────────
  const [isScreenSharing, setIsScreenSharing] = useState(false); // host is currently sharing
  const [localStream,     setLocalStream]     = useState(null);  // host's capture stream
  const [remoteStream,    setRemoteStream]    = useState(null);  // viewer's received stream
  const [viewMode,        setViewMode]        = useState('youtube'); // 'youtube' | 'screenshare'

  // WebRTC: host keeps one RTCPeerConnection per viewer
  const peerConns = useRef(new Map()); // viewerId → RTCPeerConnection

  // YouTube player imperative handle
  const playerRef = useRef(null);

  // Keep latest isHost value accessible inside socket callbacks
  const isHostRef = useRef(isHost);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  // ─────────────────────────────────────────────────────────────────────────
  // Utility: create a peer connection for one viewer (HOST side)
  // ─────────────────────────────────────────────────────────────────────────
  function createHostPeer(viewerId, stream) {
    // Clean up any existing connection to this viewer
    if (peerConns.current.has(viewerId)) {
      peerConns.current.get(viewerId).close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConns.current.set(viewerId, pc);

    // Add all tracks from the capture stream
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    // Relay ICE candidates to this viewer
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit('ice-candidate', { targetId: viewerId, candidate });
      }
    };

    // Create and send offer
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        socket.emit('screen-share-offer', {
          roomId,
          offer: pc.localDescription,
          targetId: viewerId,
        });
      })
      .catch(console.error);

    return pc;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Utility: create a peer connection for receiving (VIEWER side)
  // ─────────────────────────────────────────────────────────────────────────
  function createViewerPeer(hostSocketId, offer) {
    // Clean up previous peer if any
    if (peerConns.current.has('host')) {
      peerConns.current.get('host').close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConns.current.set('host', pc);

    // When we get a track, display it
    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
      setViewMode('screenshare');
    };

    // Relay ICE candidates back to host
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit('ice-candidate', { targetId: hostSocketId, candidate });
      }
    };

    // Set remote description → create answer → send back
    pc.setRemoteDescription(new RTCSessionDescription(offer))
      .then(() => pc.createAnswer())
      .then((answer) => pc.setLocalDescription(answer))
      .then(() => {
        socket.emit('screen-share-answer', {
          roomId,
          answer: pc.localDescription,
          hostId: hostSocketId,
        });
      })
      .catch(console.error);

    return pc;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Stop screen sharing (HOST): clean up stream + peer connections
  // ─────────────────────────────────────────────────────────────────────────
  const stopScreenShare = useCallback(() => {
    // Stop all media tracks
    localStream?.getTracks().forEach((t) => t.stop());

    // Close all peer connections
    peerConns.current.forEach((pc) => pc.close());
    peerConns.current.clear();

    setLocalStream(null);
    setIsScreenSharing(false);
    setViewMode('youtube');

    socket.emit('screen-share-stop', { roomId });
  }, [localStream, roomId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Start screen sharing (HOST)
  // ─────────────────────────────────────────────────────────────────────────
  async function startScreenShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      alert('Screen sharing is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true, // capture system audio if browser supports it
      });

      setLocalStream(stream);
      setIsScreenSharing(true);
      setViewMode('screenshare');

      // When user clicks the browser's native "Stop sharing" button
      stream.getVideoTracks()[0].onended = () => stopScreenShare();

      // Notify viewers to prepare peer connections
      socket.emit('screen-share-start', { roomId });
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        console.error('getDisplayMedia error:', err);
        alert('Could not start screen sharing: ' + err.message);
      }
      // User cancelled the picker — do nothing
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Socket event registration
  // ─────────────────────────────────────────────────────────────────────────
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

    // ── YouTube playback events ──
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

    // ── Screen share signaling ──────────────────────────────────────────────
    // VIEWER: host started sharing → tell host we're ready
    function onScreenShareStart({ hostId: hid }) {
      setViewMode('screenshare');
      // Let the host know we're ready to receive an offer
      socket.emit('screen-share-ready', { roomId, hostId: hid });
    }

    // HOST: a viewer is ready → create offer for them
    function onScreenShareReady({ viewerId }) {
      if (!isHostRef.current) return;
      // Use the latest localStream via closure captured in a ref
      const stream = localStreamRef.current;
      if (!stream) return;
      createHostPeer(viewerId, stream);
    }

    // VIEWER: received offer from host → answer it
    function onScreenShareOffer({ offer, hostId: hid }) {
      createViewerPeer(hid, offer);
    }

    // HOST: received answer from a viewer
    function onScreenShareAnswer({ answer, viewerId }) {
      const pc = peerConns.current.get(viewerId);
      if (!pc) return;
      pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(console.error);
    }

    // Both sides: received an ICE candidate
    function onIceCandidate({ candidate, fromId }) {
      // Determine which peer connection this is for
      const key = isHostRef.current ? fromId : 'host';
      const pc  = peerConns.current.get(key);
      if (!pc) return;
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
    }

    // VIEWER: host stopped sharing
    function onScreenShareStop() {
      peerConns.current.get('host')?.close();
      peerConns.current.delete('host');
      setRemoteStream(null);
      setViewMode('youtube');
      addSystemMessage('Host stopped screen sharing');
    }

    // ── Chat & users ────────────────────────────────────────────────────────
    function onChatMessage(msg)       { setMessages((p) => [...p, msg]); }
    function onUsersUpdated({ users: us }) { setUsers(us); }

    // Register all handlers
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

  // ── Keep localStream accessible in socket handlers without re-registering ──
  const localStreamRef = useRef(localStream);
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);

  // ── Host periodic YouTube sync ─────────────────────────────────────────────
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

  // ── Clean up on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      peerConns.current.forEach((pc) => pc.close());
    };
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function addSystemMessage(text) {
    setMessages((p) => [
      ...p,
      { id: Date.now().toString(), system: true, message: text, timestamp: Date.now() },
    ]);
  }

  function sendChatMessage(message) { socket.emit('chat-message', { roomId, message }); }

  function handleSetVideo(vid) {
    socket.emit('set-video', { roomId, videoId: vid });
  }

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

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={styles.errorPage}>
        <div className={styles.errorCard}>
          <div style={{ fontSize: 48 }}>😕</div>
          <h2>Oops!</h2>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // ── Decide what to render in the video area ────────────────────────────────
  // - Host in screenshare mode → VideoPlayer with mode="screenshare" + localStream preview
  // - Viewer in screenshare mode → ScreenSharePlayer with remoteStream
  // - Otherwise → YouTube VideoPlayer
  const showScreenShareViewer = !isHost && viewMode === 'screenshare';

  // ── Main UI ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.layout}>
      {/* Header */}
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
          {isScreenSharing && (
            <span className={styles.liveChip}>● LIVE</span>
          )}
        </div>

        <div className={styles.headerRight}>
          {isHost && <span className="badge badge-host">👑 Host</span>}
          <span className={styles.headerUser}>{userName}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/')}>
            Leave
          </button>
        </div>
      </header>

      {/* Body */}
      <div className={styles.body}>
        {/* Left: video + controls */}
        <div className={styles.mainCol}>
          <div className={styles.videoWrap}>
            {showScreenShareViewer ? (
              <ScreenSharePlayer stream={remoteStream} />
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

        {/* Right: users + chat */}
        <div className={styles.sideCol}>
          <UserList users={users} hostId={hostId} myId={socket.id} />
          <Chat messages={messages} onSend={sendChatMessage} />
        </div>
      </div>
    </div>
  );
}
