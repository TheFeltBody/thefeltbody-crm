// AuthGate: shows a magic-link sign-in form until there's a session, then
// renders children. supabase-js handles session persistence in localStorage and
// the magic-link callback hash automatically. We just listen for state changes.
//
// The visual style mirrors the rest of the CRM (dark forest green, gold accent,
// Cormorant for the wordmark, Jost for body) so the login lands cleanly into
// the app aesthetic on first visit.

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const C = {
  bg: '#0c1c13', card: '#192c1f', border: '#243b2b',
  gold: '#c9a84c', text: '#f0ece4', muted: '#698a78',
  red: '#c97070', green: '#4db879',
};

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Pick up an existing session at mount (covers page reload + the magic-link
    // callback, which Supabase parses out of window.location.hash automatically).
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Stay subscribed for sign-in / sign-out / token-refresh events.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: C.bg, color: C.muted,
        fontFamily: "'Jost', sans-serif", fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  if (!session) return <SignInScreen />;
  return children;
}

function SignInScreen() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');  // 'idle' | 'sending' | 'sent' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  const sendLink = async () => {
    if (!email.trim()) return;
    setStatus('sending');
    setErrorMsg('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // After clicking the link, return to whatever URL the app is served from.
        // Works for both localhost dev and the Pages deploy.
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
    } else {
      setStatus('sent');
    }
  };

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Jost:wght@300;400;500;600&display=swap');`}</style>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: C.bg, padding: 20,
        fontFamily: "'Jost', sans-serif" }}>
        <div style={{ width: '100%', maxWidth: 380, background: C.card,
          border: `1px solid ${C.border}`, borderRadius: 10, padding: '36px 32px' }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28,
            color: C.gold, marginBottom: 4, letterSpacing: '0.5px' }}>
            The Felt Body
          </div>
          <div style={{ color: C.muted, fontSize: 12, letterSpacing: '1px',
            textTransform: 'uppercase', marginBottom: 28 }}>
            CRM
          </div>

          {status === 'sent' ? (
            <div style={{ color: C.green, fontSize: 14, lineHeight: 1.6 }}>
              Check <span style={{ color: C.text }}>{email}</span> for a sign-in link.
              You can close this tab — the link will bring you back here logged in.
            </div>
          ) : (
            <>
              <label style={{ display: 'block', color: C.muted, fontSize: 10,
                letterSpacing: '0.5px', marginBottom: 6 }}>
                EMAIL
              </label>
              <input type="email" value={email} autoFocus
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendLink()}
                placeholder="you@example.com"
                style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`,
                  borderRadius: 6, color: C.text, fontSize: 14, padding: '10px 12px',
                  fontFamily: "'Jost', sans-serif", outline: 'none', marginBottom: 14 }} />

              <button onClick={sendLink}
                disabled={status === 'sending' || !email.trim()}
                style={{ width: '100%', background: C.gold, color: C.bg, border: 'none',
                  borderRadius: 6, fontSize: 13, fontWeight: 600, padding: '11px 14px',
                  cursor: status === 'sending' ? 'wait' : 'pointer',
                  opacity: !email.trim() ? 0.5 : 1, fontFamily: "'Jost', sans-serif",
                  letterSpacing: '0.3px' }}>
                {status === 'sending' ? 'Sending…' : 'Send sign-in link'}
              </button>

              {status === 'error' && (
                <div style={{ color: C.red, fontSize: 12, marginTop: 12 }}>{errorMsg}</div>
              )}
              <div style={{ color: C.muted, fontSize: 11, marginTop: 18, lineHeight: 1.5 }}>
                We'll email you a one-time link. No password needed.
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
