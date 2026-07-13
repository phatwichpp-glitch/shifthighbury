// @ts-nocheck
import { useState, useEffect } from 'react';

const SIGNALING_URL = import.meta.env.VITE_WEBRTC_SIGNALING_URL;
const WAITING_TTL_MS = 5 * 60 * 1000;

export function useWaitingRoomStatus(studentIds = []) {
  const [statusMap, setStatusMap] = useState({});

  useEffect(() => {
    if (!studentIds.length) return;

    const poll = async () => {
      const next = {};
      const now = Date.now();

      if (SIGNALING_URL) {
        await Promise.all(studentIds.map(async (id) => {
          try {
            const res = await fetch(
              `${SIGNALING_URL}/room/poll?roomId=${encodeURIComponent(id)}&lastTimestamp=${now - WAITING_TTL_MS}&participantId=teacher`,
            );
            const body = await res.json();
            const waiting = (body.messages || []).some(
              m => m.signal?.type === 'student-waiting' && now - m.timestamp < WAITING_TTL_MS,
            );
            next[id] = waiting ? 'waiting' : '';
          } catch {
            next[id] = localStorage.getItem(`zw_room_${id}`) === 'waiting' ? 'waiting' : '';
          }
        }));
      } else {
        for (const id of studentIds) {
          next[id] = localStorage.getItem(`zw_room_${id}`) === 'waiting' ? 'waiting' : '';
        }
      }

      setStatusMap(prev => {
        const changed = studentIds.some(id => prev[id] !== next[id]);
        return changed ? next : prev;
      });
    };

    poll();
    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, [studentIds.join(',')]); // eslint-disable-line

  return statusMap;
}
