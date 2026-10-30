import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldAlert, Shield, Lock, User, Users, AlertTriangle, HeartHandshake, ArrowRight } from 'lucide-react';
import { authService } from '../services/authService.ts';

// Scattered "zone" nodes the protection network radiates out to, as
// percentage coordinates of the viewport — purely decorative, symbolizing
// the AI pipeline watching over multiple school zones at once.
const NETWORK_NODES = [
  { x: 14, y: 18 },
  { x: 86, y: 14 },
  { x: 8, y: 72 },
  { x: 92, y: 68 },
  { x: 24, y: 88 },
  { x: 78, y: 90 },
  { x: 50, y: 8 },
];

// Faint icons that slowly drift upward across the background — a gentle
// nod to the app's "watching over / supporting students" purpose rather
// than any literal depiction of an incident.
const FLOATING_ICONS = [
  { Icon: Shield, left: 10, delay: 0, duration: 16, size: 20 },
  { Icon: HeartHandshake, left: 22, delay: 4, duration: 20, size: 18 },
  { Icon: Users, left: 78, delay: 2, duration: 18, size: 18 },
  { Icon: Shield, left: 88, delay: 7, duration: 15, size: 16 },
  { Icon: HeartHandshake, left: 55, delay: 10, duration: 22, size: 16 },
  { Icon: Users, left: 40, delay: 6, duration: 19, size: 14 },
];

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    // Tiny delay so the submit feels like it actually checked something,
    // rather than an instant client-side if-statement.
    setTimeout(() => {
      const user = authService.login(username, password);
      if (!user) {
        setError('Incorrect staff username or password.');
        setIsSubmitting(false);
        return;
      }
      const redirectTo = location.state?.from || '/';
      navigate(redirectTo, { replace: true });
    }, 250);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 flex items-center justify-center p-4">
      {/* Decorative animated background layer — a quiet "protection
          network" motif: zones being watched over, connected to a
          central guardian node, with supportive icons drifting past.
          Purely atmospheric, nothing literal or distressing. */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Slow-shifting aurora wash */}
        <div
          className="absolute inset-0 login-aurora-bg opacity-70"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(8,145,178,0.25), transparent 45%), radial-gradient(circle at 80% 75%, rgba(14,116,144,0.3), transparent 50%), radial-gradient(circle at 50% 50%, rgba(2,6,23,0) , rgba(2,6,23,0.4) 80%)',
          }}
        />

        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Protection network — faint lines from each watched zone to the
            central guardian node, with a traveling dash representing
            live monitoring */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {NETWORK_NODES.map((node, i) => (
            <line
              key={i}
              x1={node.x}
              y1={node.y}
              x2={50}
              y2={38}
              stroke="rgba(34,211,238,0.28)"
              strokeWidth="0.15"
              vectorEffect="non-scaling-stroke"
              className="login-dash"
              style={{ animationDelay: `${i * 0.3}s` }}
            />
          ))}
        </svg>

        {/* Zone nodes with their own soft pulse rings */}
        {NETWORK_NODES.map((node, i) => (
          <div
            key={i}
            className="absolute"
            style={{ left: `${node.x}%`, top: `${node.y}%`, transform: 'translate(-50%, -50%)' }}
          >
            <span className="absolute inset-0 -m-1.5 rounded-full border border-cyan-400/40 login-pulse-ring" style={{ animationDelay: `${i * 0.5}s` }} />
            <span className="block h-1.5 w-1.5 rounded-full bg-cyan-400/70" />
          </div>
        ))}

        {/* Central guardian pulse, behind the shield badge */}
        <div className="absolute left-1/2 top-[15%] -translate-x-1/2 -translate-y-1/2">
          <span className="absolute inset-0 -m-6 rounded-full border border-cyan-400/30 login-pulse-ring" />
          <span className="absolute inset-0 -m-6 rounded-full border border-cyan-400/30 login-pulse-ring" style={{ animationDelay: '1.1s' }} />
          <span className="absolute inset-0 -m-6 rounded-full border border-cyan-400/30 login-pulse-ring" style={{ animationDelay: '2.2s' }} />
        </div>

        {/* Softly drifting support icons */}
        {FLOATING_ICONS.map(({ Icon, left, delay, duration, size }, i) => (
          <Icon
            key={i}
            size={size}
            className="absolute bottom-0 text-cyan-200/25 login-float"
            style={{ left: `${left}%`, animationDelay: `${delay}s`, animationDuration: `${duration}s` }}
          />
        ))}

        {/* Soft glow blobs for depth */}
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-cyan-700/15 blur-3xl" />

        {/* Oversized faded shield, matching the dashboard hero's motif,
            rotating almost imperceptibly slowly */}
        <ShieldAlert
          size={620}
          strokeWidth={1}
          className="absolute -right-24 top-1/2 -translate-y-1/2 text-white/5 login-slow-spin"
        />
      </div>

      <div className="relative w-full max-w-sm space-y-5">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-cyan-600 text-white shadow-lg shadow-cyan-600/30">
            <ShieldAlert size={26} />
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">SafeZone Staff Login</h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xl space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Staff Username / Email</label>
            <div className="relative">
              <User size={14} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="m.vance@oakwood-schools.edu"
                autoComplete="username"
                className="w-full pl-9 pr-3 py-2.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full pl-9 pr-3 py-2.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs shadow-md transition-colors disabled:opacity-60"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => navigate('/student-report')}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
        >
          <HeartHandshake size={13} />
          <span>Student? Go to the Student Support Portal instead</span>
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
};