'use client';

import { useState, useEffect, useCallback } from 'react';
import { type User } from '@/types';

const SESSION_KEY = 'tty_secure_session';
const LOGIN_PASSWORD = 'appulinuappu';
const DECOY_PASSWORD = '12345678';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isDecoyMode, setIsDecoyMode] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const storedSession = sessionStorage.getItem(SESSION_KEY);
      if (storedSession) {
        const { isAuthenticated, user, password, sessionId: storedSessionId } = JSON.parse(storedSession);
        if (isAuthenticated === true && password === LOGIN_PASSWORD) {
          setIsAuthenticated(true);
          setUser(user);
          if (storedSessionId) {
            setSessionId(storedSessionId);
          } else {
            const newSessionId = Math.random().toString(36).substring(2);
            setSessionId(newSessionId);
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({ isAuthenticated, user, password, sessionId: newSessionId }));
          }
        } else {
          sessionStorage.removeItem(SESSION_KEY);
        }
      }
    } catch (error) {
      console.error("Failed to parse session from session storage", error);
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, []);

  const login = useCallback((password: string): boolean => {
    if (password === LOGIN_PASSWORD) {
      const loggedInUser: User = { username: 'root' };
      const newSessionId = Math.random().toString(36).substring(2);
      
      setIsAuthenticated(true);
      setIsDecoyMode(false);
      setUser(loggedInUser);
      setSessionId(newSessionId);
      
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        isAuthenticated: true,
        user: loggedInUser,
        password: LOGIN_PASSWORD,
        sessionId: newSessionId,
      }));
      return true;
    }

    if (password === DECOY_PASSWORD) {
        const decoyUser: User = { username: 'admin' };
        setIsAuthenticated(true);
        setIsDecoyMode(true);
        setUser(decoyUser);
        setSessionId(null);
        sessionStorage.removeItem(SESSION_KEY);
        return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setIsDecoyMode(false);
    setUser(null);
    setSessionId(null);
    sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const enterDecoyMode = useCallback(() => {
    const decoyUser: User = { username: 'admin' };
    setIsAuthenticated(true);
    setIsDecoyMode(true);
    setUser(decoyUser);
    setSessionId(null);
    sessionStorage.removeItem(SESSION_KEY);
  }, []);
  
  return { isAuthenticated, isDecoyMode, user, login, logout, secret: LOGIN_PASSWORD, sessionId, enterDecoyMode };
}
