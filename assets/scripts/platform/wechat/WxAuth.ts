import { GameSession } from '../../core/GameSession';
import type { LoginResponse, UserVO } from '../../types/GameTypes';
import { callFunction } from '../../network/CloudService';

export async function login(nickname?: string, avatarUrl?: string): Promise<UserVO> {
  const res = await callFunction<LoginResponse>('login', { nickname, avatarUrl });
  if (!res.ok || !res.user) {
    throw new Error(res.message || res.code || 'LOGIN_FAILED');
  }
  GameSession.user = res.user;
  return res.user;
}

export async function fetchProfile(): Promise<UserVO> {
  const res = await callFunction<LoginResponse>('login', { action: 'profile' });
  if (!res.ok || !res.user) {
    throw new Error(res.message || res.code || 'PROFILE_FAILED');
  }
  GameSession.user = res.user;
  return res.user;
}
