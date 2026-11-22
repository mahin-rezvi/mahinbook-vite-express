import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';

const SocketCtx = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const listeners = useRef(new Map());
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const uid = user?.id;

  useEffect(() => {
    if (!uid) return;
    let closed = false;
    let retry = 0;
    let timer;
    const connect = () => {
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      wsRef.current = ws;
      ws.onopen = () => { retry = 0; setConnected(true); dispatch('reconnect', {}); };
      ws.onmessage = (e) => {
        try {
          const { type, payload } = JSON.parse(e.data);
          dispatch(type, payload);
        } catch { /* ignore malformed frames */ }
      };
      ws.onclose = () => {
        setConnected(false);
        if (closed) return;
        timer = setTimeout(connect, Math.min(1000 * 2 ** retry++, 15000));
      };
    };
    const dispatch = (type, payload) => listeners.current.get(type)?.forEach((fn) => fn(payload));
    connect();
    return () => { closed = true; clearTimeout(timer); wsRef.current?.close(); };
  }, [uid]);

  const api = useRef({
    on(type, fn) {
      if (!listeners.current.has(type)) listeners.current.set(type, new Set());
      listeners.current.get(type).add(fn);
      return () => listeners.current.get(type)?.delete(fn);
    },
    send(obj) {
      if (wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify(obj));
    },
  }).current;

  return <SocketCtx.Provider value={{ ...api, connected }}>{children}</SocketCtx.Provider>;
}

export const useSocket = () => useContext(SocketCtx);

/** Subscribe to a socket event for the lifetime of the component. */
export function useSocketEvent(type, handler) {
  const socket = useSocket();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => socket.on(type, (p) => ref.current(p)), [socket, type]);
}
