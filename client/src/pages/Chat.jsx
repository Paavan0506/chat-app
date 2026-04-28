import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { socket } from '../socket';
import { useAuth } from '../context/AuthContext';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
const ROOMS = ['general', 'tech', 'random', 'gaming', 'music'];

export default function Chat() {
  const { user, logout } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [currentRoom, setCurrentRoom] = useState('general');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUser, setTypingUser] = useState('');
  const bottomRef = useRef(null);
  const typingTimeout = useRef(null);

  useEffect(() => {
    if (!socket.connected) socket.connect();
    socket.emit('user_online', { username: user.username, room: currentRoom });
    loadHistory(currentRoom);

    socket.on('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });
    socket.on('online_users', (users) => setOnlineUsers(users));
    socket.on('user_typing', (username) => setTypingUser(username));
    socket.on('user_stop_typing', () => setTypingUser(''));
    socket.on('message_seen', ({ messageId, username }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId
            ? { ...m, seenBy: [...(m.seenBy || []), username] }
            : m
        )
      );
    });

    return () => {
      socket.off('receive_message');
      socket.off('online_users');
      socket.off('user_typing');
      socket.off('user_stop_typing');
      socket.off('message_seen');
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadHistory = async (room) => {
    try {
      const { data } = await axios.get(`${SERVER_URL}/api/messages/${room}`);
      const formatted = data.map((m) => ({
        _id: m._id,
        room: m.room,
        sender: m.sender?.username || 'Unknown',
        senderId: m.sender?._id,
        text: m.text,
        createdAt: m.createdAt,
        seenBy: [],
      }));
      setMessages(formatted);
    } catch (err) {
      console.error('Failed to load history:', err.message);
    }
  };

  const switchRoom = (newRoom) => {
    if (newRoom === currentRoom) return;
    socket.emit('leave_room', currentRoom);
    socket.emit('join_room', newRoom);
    socket.emit('user_online', { username: user.username, room: newRoom });
    setCurrentRoom(newRoom);
    setMessages([]);
    setTypingUser('');
    loadHistory(newRoom);
  };

  const sendMessage = () => {
    if (!text.trim()) return;
    socket.emit('send_message', {
      room: currentRoom,
      sender: user.username,
      senderId: user.id,
      text: text.trim(),
    });
    clearTimeout(typingTimeout.current);
    socket.emit('stop_typing', { room: currentRoom });
    setText('');
  };

  const handleTyping = (e) => {
    setText(e.target.value);
    socket.emit('typing', { room: currentRoom, username: user.username });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit('stop_typing', { room: currentRoom });
    }, 1500);
  };

  const MessageItem = ({ msg }) => {
    const ref = useRef();
    const isOwn = msg.sender === user.username;

    useEffect(() => {
      if (isOwn) return;
      const observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          socket.emit('message_seen', {
            messageId: msg._id,
            room: currentRoom,
            username: user.username,
          });
          observer.disconnect();
        }
      });
      if (ref.current) observer.observe(ref.current);
      return () => observer.disconnect();
    }, []);

    return (
      <div ref={ref} style={{ ...styles.messageRow, justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
        <div style={{
          ...styles.bubble,
          background: isOwn ? '#4f46e5' : '#1e293b',
          color: '#fff',
          borderRadius: isOwn ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        }}>
          {!isOwn && <p style={styles.senderName}>{msg.sender}</p>}
          <p style={{ margin: 0, fontSize: 14 }}>{msg.text}</p>
          <div style={styles.meta}>
            <span>{formatTime(msg.createdAt)}</span>
            {isOwn && <span style={{ marginLeft: 6 }}>{msg.seenBy?.length > 0 ? '✓✓' : '✓'}</span>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={styles.layout}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarTop}>
          <h2 style={styles.logo}>💬 ChatApp</h2>
          <p style={styles.loggedAs}>@{user.username}</p>
        </div>

        <p style={styles.sectionLabel}>ROOMS</p>
        {ROOMS.map((room) => (
          <div key={room} onClick={() => switchRoom(room)} style={{
            ...styles.roomItem,
            background: currentRoom === room ? '#4f46e5' : 'transparent',
            color: currentRoom === room ? '#fff' : '#94a3b8',
          }}>
            # {room}
          </div>
        ))}

        <p style={{ ...styles.sectionLabel, marginTop: 24 }}>
          ONLINE — {onlineUsers.length}
        </p>
        {onlineUsers.map((u, i) => (
          <div key={i} style={styles.onlineUser}>
            <span style={styles.dot} />{u}
          </div>
        ))}

        <button onClick={() => { socket.disconnect(); logout(); }} style={styles.logoutBtn}>
          Logout
        </button>
      </div>

      {/* Main */}
      <div style={styles.main}>
        <div style={styles.header}>
          <h3 style={{ margin: 0 }}># {currentRoom}</h3>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>{onlineUsers.length} online</span>
        </div>

        <div style={styles.messages}>
          {messages.length === 0 && (
            <p style={styles.emptyMsg}>No messages yet. Say hello! 👋</p>
          )}
          {messages.map((msg, i) => (
            <MessageItem key={msg._id || i} msg={msg} />
          ))}
          <div ref={bottomRef} />
        </div>

        <div style={styles.typingArea}>
          {typingUser && (
            <span style={styles.typingText}>{typingUser} is typing...</span>
          )}
        </div>

        <div style={styles.inputBar}>
          <input
            style={styles.input}
            value={text}
            onChange={handleTyping}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder={`Message #${currentRoom}`}
          />
          <button style={styles.sendBtn} onClick={sendMessage}>Send ➤</button>
        </div>
      </div>
    </div>
  );
}

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const styles = {
  layout: { display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#0f172a', color: '#e2e8f0' },
  sidebar: { width: 220, background: '#1e293b', display: 'flex', flexDirection: 'column', padding: '20px 12px', gap: 4, flexShrink: 0 },
  sidebarTop: { marginBottom: 16 },
  logo: { margin: '0 0 2px', fontSize: 18, color: '#fff' },
  loggedAs: { margin: 0, fontSize: 12, color: '#64748b' },
  sectionLabel: { fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: 1, margin: '8px 0 4px 8px' },
  roomItem: { padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500 },
  onlineUser: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', fontSize: 13, color: '#94a3b8' },
  dot: { width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 },
  logoutBtn: { marginTop: 'auto', padding: '8px 12px', background: 'transparent', border: '1px solid #334155', color: '#94a3b8', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
  main: { flex: 1, display: 'flex', flexDirection: 'column', background: '#0f172a' },
  header: { padding: '16px 24px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  messages: { flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 8 },
  emptyMsg: { textAlign: 'center', color: '#475569', marginTop: 40, fontSize: 14 },
  messageRow: { display: 'flex', width: '100%' },
  bubble: { maxWidth: '65%', padding: '10px 14px', wordBreak: 'break-word' },
  senderName: { margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: 0.5 },
  meta: { marginTop: 4, fontSize: 10, opacity: 0.6, display: 'flex', justifyContent: 'flex-end', gap: 2 },
  typingArea: { height: 20, paddingLeft: 24 },
  typingText: { fontSize: 12, color: '#64748b', fontStyle: 'italic' },
  inputBar: { display: 'flex', gap: 10, padding: '12px 24px 20px' },
  input: { flex: 1, padding: '12px 16px', background: '#1e293b', border: '1px solid #334155', borderRadius: 12, color: '#e2e8f0', fontSize: 14, outline: 'none' },
  sendBtn: { padding: '12px 20px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 600, fontSize: 14 },
};