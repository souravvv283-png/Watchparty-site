/**
 * UserList.jsx
 * Shows all users in the room with host badge and ready status.
 */
import styles from './UserList.module.css';

export default function UserList({ users, hostId, myId }) {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>👥 Viewers</span>
        <span className={styles.count}>{users.length}</span>
      </div>
      <ul className={styles.list}>
        {users.map((user) => (
          <li key={user.id} className={styles.user}>
            <div className={styles.avatar} data-initial={user.name[0].toUpperCase()} />
            <span className={`${styles.name} ${user.id === myId ? styles.mine : ''}`}>
              {user.name}
              {user.id === myId && ' (you)'}
            </span>
            <div className={styles.badges}>
              {user.id === hostId && (
                <span className="badge badge-host">Host</span>
              )}
              <span className={`badge ${user.isReady ? 'badge-ready' : 'badge-waiting'}`}>
                {user.isReady ? '✓' : '…'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
