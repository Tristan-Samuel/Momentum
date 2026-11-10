import { Capacitor, registerPlugin } from '@capacitor/core';
import { SYNC_URL } from '@/sync/api';
import { sha256 } from '@/sync/sha256';

type WebAuthPlugin = {
  start(options: { url: string; callbackScheme: string }): Promise<{ url: string }>;
};

const WebAuth = registerPlugin<WebAuthPlugin>('WebAuth');

export const APP_SCHEME = 'com.momentum.workout';
export const NATIVE_REDIRECT = `${APP_SCHEME}://auth/callback`;
const PENDING_KEY = 'momentum.pendingSignIn';

export type SignInResult = { code: string; verifier: string; redirectUri: string };

export class SignInCancelled extends Error {}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const bytes = new TextEncoder().encode(verifier);
  if (globalThis.crypto?.subtle) {
    return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
  }
  return base64Url(sha256(bytes));
}

export function webRedirect(): string {
  return `${window.location.origin}/auth/callback`;
}

async function startUrl(redirectUri: string, state: string, verifier: string): Promise<string> {
  const params = new URLSearchParams({
    redirect_uri: redirectUri,
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
  });
  return `${SYNC_URL}/auth/app/start?${params.toString()}`;
}

export function readCallback(url: string, expectedState: string): string {
  const params = new URL(url).searchParams;
  const code = params.get('code');
  if (!code || params.get('state') !== expectedState) {
    throw new Error('Sign-in could not be verified. Try again.');
  }
  return code;
}

/**
 * On iOS this opens tssamuel.com in a system sign-in sheet (sharing Safari's cookies)
 * and resolves with the handoff code. On the web it navigates away and never resolves;
 * the /auth/callback route finishes the job with `takeWebCallback`.
 */
export async function beginSignIn(): Promise<SignInResult> {
  const verifier = randomToken(48);
  const state = randomToken(16);
  if (Capacitor.isNativePlatform()) {
    let result: { url: string };
    try {
      result = await WebAuth.start({
        url: await startUrl(NATIVE_REDIRECT, state, verifier),
        callbackScheme: APP_SCHEME,
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'CANCELLED') throw new SignInCancelled('Sign-in was cancelled.');
      throw err;
    }
    return { code: readCallback(result.url, state), verifier, redirectUri: NATIVE_REDIRECT };
  }
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state }));
  window.location.assign(await startUrl(webRedirect(), state, verifier));
  return new Promise<SignInResult>(() => undefined);
}

export function takeWebCallback(url: string): SignInResult {
  const raw = sessionStorage.getItem(PENDING_KEY);
  sessionStorage.removeItem(PENDING_KEY);
  if (!raw) throw new Error('Sign-in expired. Start again from Settings.');
  const pending = JSON.parse(raw) as { verifier: string; state: string };
  return { code: readCallback(url, pending.state), verifier: pending.verifier, redirectUri: webRedirect() };
}

export function deviceLabel(): string {
  if (Capacitor.isNativePlatform()) return `Momentum for ${Capacitor.getPlatform() === 'ios' ? 'iPhone' : 'Android'}`;
  return `Momentum web · ${navigator.userAgent.slice(0, 80)}`;
}
