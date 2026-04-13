import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  Bot, Terminal, RefreshCw, Sparkles, FolderSync,
  GitBranch, GitCommit, CheckCircle, XCircle, Clock,
  Code, Database, Cpu, Activity, AlertTriangle, Zap,
  Wifi, WifiOff, Copy, ClipboardCheck
} from 'lucide-react';
import './index.css';

const API = "http://localhost:5000";
const REPOS = (process.env.REACT_APP_GITHUB_REPOS || "")
  .split(',').map(r => r.trim()).filter(Boolean);

/* ── Sub-Components ─────────────────────────────────── */
function StatusBadge({ status }) {
  const map = {
    'in-progress': { label: 'Running', cls: 'badge-running' },
    'completed': { label: 'Done', cls: 'badge-success' },
    'failed': { label: 'Failed', cls: 'badge-error' },
  };
  const { label, cls } = map[status] || { label: status, cls: 'badge-pending' };
  return <span className={`badge ${cls}`}>{label}</span>;
}

function RepoCard({ repo, isActive }) {
  const parts = repo.split('/');
  const name = parts[1] || repo;
  const owner = parts[0] || '';
  return (
    <div className={`repo-card ${isActive ? 'repo-card-active' : ''}`}>
      <div className="repo-card-header">
        <GitBranch size={16} className="repo-icon" />
        <div style={{ flex: 1 }}>
          <div className="repo-name">{name}</div>
          <div className="repo-owner">{owner}</div>
        </div>
        {isActive && <div className="pulse-dot" title="AI Active" />}
      </div>
      <div className="repo-meta">
        <Code size={11} />
        <span>{owner}/{name}</span>
        {isActive && <span className="active-label">⚡ AI Active</span>}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="stat-card">
      <Icon size={22} color={color} />
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

/* ── Planning Chat ──────────────────────────────────── */
function PlanningChat({ repository, onResolved, isAgentRunning }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I am your code planning assistant. What would you like me to improve in this repository? I can help clarify your requirements before we start.' }
  ]);
  const [input, setInput] = useState('');
  const [chatId, setChatId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resolvedPlan, setResolvedPlan] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repository, message: userMsg, chatId }),
      });
      const data = await res.json();
      if (data.messages) {
        setChatId(data._id);
        setMessages(data.messages);
        if (data.status === 'resolved') {
          setResolvedPlan(data.resolvedInstructions);
        }
      } else if (data.error) {
        throw new Error(data.error);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Error: " + err.message }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-section">
      <div className="chat-container">
        <div className="chat-messages">
          {Array.isArray(messages) && messages.map((m, i) => (
            <div key={i} className={`chat-bubble ${m.role}`}>
              {m.content.replace('[PLAN_READY]', '')}
            </div>
          ))}
          {loading && <div className="chat-bubble assistant">Thinking...</div>}
          <div ref={chatEndRef} />
        </div>
        <form className="chat-input-area" onSubmit={handleSend}>
          <input
            className="chat-input"
            placeholder="Type your requirements..."
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
          />
          <button type="submit" className="chat-send-btn" disabled={loading || !input.trim()}>
            Send
          </button>
        </form>
      </div>

      {resolvedPlan && !isAgentRunning && (
        <div className="plan-ready-banner">
          <div>
            <b>Plan Clarified!</b>
            <p>{resolvedPlan.substring(0, 100)}...</p>
          </div>
          <button onClick={() => onResolved(resolvedPlan)}>
            <Sparkles size={16} /> Start Agent Execution
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Main App ───────────────────────────────────────── */
export default function App() {
  const [logs, setLogs] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [activeRepo, setActiveRepo] = useState(null);
  const [stats, setStats] = useState({ total: 0, completed: 0, prs: 0 });
  const [copied, setCopied] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState(REPOS[0] || null);
  const logsEndRef = useRef(null);

  /* Auto-scroll terminal (only if user is already at bottom) */
  useEffect(() => {
    if (!logsEndRef.current) return;
    const container = logsEndRef.current.parentElement;
    if (!container) return;

    // Is the user currently at the bottom (within 100px)? 
    // Increased threshold for reliability
    const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;

    // Always scroll on the very first log, otherwise only if they were at bottom
    if (logs.length === 1 || isAtBottom) {
      logsEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [logs]);

  /* Fetch job history */
  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/agent/jobs`);
      const data = await res.json();
      setJobs(Array.isArray(data) ? data : []);
      setStats({
        total: data.length,
        completed: data.filter(j => j.status === 'completed').length,
        prs: data.filter(j => j.tempBranch).length,
      });
    } catch { /* backend may not be ready yet */ }
  }, []);

  useEffect(() => {
    fetchJobs();
    const t = setInterval(fetchJobs, 10000);
    return () => clearInterval(t);
  }, [fetchJobs]);

  /* Socket.io — always-on global listener */
  useEffect(() => {
    const socket = io(API, { reconnection: true, reconnectionDelay: 1000 });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('global-activity', (data) => {
      const entry = { ...data, timestamp: data.timestamp || new Date().toISOString() };

      setLogs(prev => {
        const last = prev[prev.length - 1];
        if (last && last.message === entry.message) return prev;
        return [...prev, entry];
      });


      /* Detect which repo is active */
      const parts = entry.message.split('??');
      if (parts.length >= 2) {
        const repoMatch = parts[1].trim().match(/([^/\s]+\/[^\s]+)/);
        if (repoMatch) setActiveRepo(repoMatch[1]);
      }

      /* Job lifecycle signals */
      if (entry.message.includes('Agent started')) setIsRunning(true);

      if (entry.message.includes('Job complete')) {
        setIsRunning(false);
        setActiveRepo(null);
        fetchJobs();
      }
    });

    return () => socket.disconnect();
  }, [fetchJobs]);

  /* Manual run trigger */
  const startAgent = async (finalInstructions) => {
  setIsRunning(true);
  setLogs([]);
  try {
    const repoUrl = `https://github.com/${selectedRepo}`;
    const res = await fetch(`${API}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repoUrl,
        instructions: finalInstructions
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start agent');
    fetchJobs(); // Immediate refresh
  } catch (err) {
    setLogs([{ message: err.message, type: 'error', timestamp: new Date().toISOString() }]);
    setIsRunning(false);
  }
};

  /* Copy terminal logs to clipboard */
  const copyLogs = async () => {
    const text = logs
      .map(l => `[${new Date(l.timestamp).toLocaleTimeString([], { hour12: false })}] ${l.message}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard API may not be available */
    }
  };

  /* Log icon helper */
  const logIcon = (type) => {
    if (type === 'success') return <CheckCircle size={13} color="var(--success-color)" />;
    if (type === 'error') return <XCircle size={13} color="var(--error-color)" />;
    if (type === 'warning') return <AlertTriangle size={13} color="var(--warning-color)" />;
    return <Zap size={13} color="var(--accent-color)" />;
  };

  /* ── Render ─────────────────────────────────────────── */
  return (
    <div className="app-container">

      {/* ── Header ── */}
      <header className="header">
        <div className="header-logo">
          <Bot size={40} />
          <div>
            <h1>Quantum Code Agent</h1>
            <p>Autonomous AI Developer Platform · MERN Stack</p>
          </div>
        </div>
        <div className="header-status">
          <div className={`status-pill ${connected ? '' : 'pill-error'}`}>
            {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {connected ? 'Backend Live' : 'Disconnected'}
          </div>
          <div className="status-pill">
            <RefreshCw size={12} className={isRunning ? 'spin' : ''} />
            {isRunning ? 'Agent Running' : 'Cron Active (5min)'}
          </div>
          <div className="status-pill">
            <Database size={12} />
            MongoDB + Pinecone
          </div>
        </div>
      </header>

      {/* ── Stats ── */}
      <div className="stats-row">
        <StatCard icon={Activity} label="Total Jobs" value={stats.total} color="#4a9df8" />
        <StatCard icon={CheckCircle} label="Completed" value={stats.completed} color="#2da44e" />
        <StatCard icon={GitCommit} label="PRs Opened" value={stats.prs} color="#a371f7" />
        <StatCard icon={Cpu} label="LLM Chain" value="Groq → Llama" color="#d4a72c" />
      </div>

      {/* ── Repos + Control ── */}
      <div className="two-col">

        {/* Repos */}
        <div className="glass-panel">
          <h2 className="panel-title"><GitBranch size={16} /> Tracked Repositories</h2>
          <div className="repo-list">
            {REPOS.map(r => (
              <div key={r} onClick={() => !isRunning && setSelectedRepo(r)} style={{ cursor: isRunning ? 'default' : 'pointer' }}>
                <RepoCard repo={r} isActive={selectedRepo === r || activeRepo === r} />
              </div>
            ))}
          </div>
        </div>

        {/* Control Panel */}
        <div className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 className="panel-title" style={{ margin: 0 }}><Sparkles size={16} /> Planning Chat</h2>
            <button
              className={`fetch-btn ${isRunning ? 'btn-running' : ''}`}
              onClick={() => startAgent('Deep research and upgrade.')}
              disabled={isRunning || !selectedRepo}
              title="Skip chat and run Phase 1-6 immediately"
            >
              <FolderSync size={14} />
              <span>{isRunning ? 'Running...' : 'Fetch & Run'}</span>
            </button>
          </div>

          {selectedRepo ? (
            <PlanningChat
              repository={selectedRepo}
              onResolved={startAgent}
              isAgentRunning={isRunning}
            />
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Select a repository to start planning.</p>
          )}
        </div>
      </div>

      {/* ── Live Terminal ── (always rendered) */}
      <div className="glass-panel terminal-panel">
        <div className="terminal-header">
          <h2 className="panel-title" style={{ margin: 0 }}>
            <Terminal size={16} /> Live Agent Terminal
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {isRunning && <span className="live-badge">● LIVE</span>}
            {!isRunning && logs.length > 0 && <span className="done-badge">✓ Done</span>}
            {logs.length > 0 && (
              <button
                type="button"
                className="clear-btn"
                onClick={copyLogs}
                title="Copy all logs to clipboard"
                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                {copied ? <ClipboardCheck size={13} /> : <Copy size={13} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
            {logs.length > 0 && (
              <button
                type="button"
                className="clear-btn"
                onClick={() => setLogs([])}
              >Clear</button>
            )}
          </div>
        </div>

        <div className="terminal-body" style={{ marginTop: '1rem' }}>
          {logs.length === 0 && !isRunning ? (
            <div className="terminal-placeholder">
              <Terminal size={28} opacity={0.2} />
              <p>Waiting for agent activity…<br />
                <span>Planning Chat above determines the goal.</span>
              </p>
            </div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className={`log-item ${log.type || 'info'}`}>
                <span className="log-icon">{logIcon(log.type)}</span>
                <span className="log-time">
                  {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
                </span>
                <span className="log-message">{log.message}</span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* ── Job History ── */}
      {jobs.length > 0 && (
        <div className="glass-panel">
          <h2 className="panel-title"><Clock size={16} /> Job History</h2>
          <div className="job-table-wrapper">
            <table className="job-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Repos</th>
                  <th>Branch / PR</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {jobs.slice(0, 12).map(job => (
                  <tr key={job._id}>
                    <td><StatusBadge status={job.status} /></td>
                    <td className="td-repo">
                      <span style={{ color: 'var(--text-muted)' }}>{job.repoOwner}/</span>
                      <span style={{ fontWeight: 600 }}>{job.repoName}</span>
                    </td>
                    <td className="td-branch">{job.tempBranch || '—'}</td>
                    <td className="td-time">{new Date(job.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
