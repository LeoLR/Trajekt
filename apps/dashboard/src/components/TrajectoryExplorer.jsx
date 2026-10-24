import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Sparkles, Wrench, User, MessageSquare, GitBranch, CircleDot, UploadCloud, Clock, DollarSign, Layers, ChevronRight } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Mini-normalizer — même logique que @trajekt/core, portée ici       */
/* pour que le drop de fichier fonctionne réellement, 100% client-side */
/* ------------------------------------------------------------------ */

function isObj(v) { return typeof v === 'object' && v !== null; }

function detectFormat(v) {
  if (isObj(v) && 'schemaVersion' in v && Array.isArray(v.steps)) return 'trajekt';
  if (isObj(v) && Array.isArray(v.observations)) return 'langfuse';
  if (isObj(v) && Array.isArray(v.resourceSpans)) return 'otlp';
  if (isObj(v) && Array.isArray(v.steps) && v.steps.every(s => isObj(s) && ('toolCalls' in s || 'text' in s))) return 'ai-sdk';
  return 'unknown';
}

function fromLangfuse(v) {
  const obs = [...(v.observations || [])].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  return obs.map((o) => {
    if (o.type === 'GENERATION') {
      return { type: 'llm_call', title: o.model || 'llm call', subtitle: o.output?.content?.slice?.(0, 60) || '',
        detail: JSON.stringify({ input: o.input, output: o.output }, null, 2),
        cost: o.calculatedTotalCost, durationMs: o.endTime ? new Date(o.endTime) - new Date(o.startTime) : undefined };
    }
    if (o.type === 'SPAN') {
      return { type: 'tool_call', title: o.name || 'tool call', subtitle: '',
        detail: JSON.stringify({ input: o.input, output: o.output }, null, 2),
        durationMs: o.endTime ? new Date(o.endTime) - new Date(o.startTime) : undefined };
    }
    return { type: 'custom', title: o.type, subtitle: '', detail: JSON.stringify(o, null, 2) };
  });
}

function fromOtlp(v) {
  const spans = v.resourceSpans.flatMap(rs => rs.scopeSpans ?? []).flatMap(ss => ss.spans ?? [])
    .sort((a, b) => Number(a.startTimeUnixNano) - Number(b.startTimeUnixNano));
  const attr = (attrs = []) => Object.fromEntries(attrs.map(a => [a.key, a.value?.stringValue ?? a.value?.intValue ?? a.value?.doubleValue ?? a.value]));
  return spans.map((s) => {
    const a = attr(s.attributes);
    const durationMs = (Number(s.endTimeUnixNano) - Number(s.startTimeUnixNano)) / 1e6;
    if (a['gen_ai.request.model'] || a['gen_ai.operation.name']) {
      return { type: 'llm_call', title: a['gen_ai.request.model'] || 'llm call', subtitle: '', detail: JSON.stringify(a, null, 2), durationMs };
    }
    if (a['gen_ai.tool.name']) {
      return { type: 'tool_call', title: a['gen_ai.tool.name'], subtitle: '', detail: JSON.stringify(a, null, 2), durationMs };
    }
    return { type: 'custom', title: s.name, subtitle: '', detail: JSON.stringify(a, null, 2), durationMs };
  });
}

function fromAiSdk(v) {
  const out = [];
  for (const s of v.steps) {
    out.push({ type: 'llm_call', title: 'generateText', subtitle: (s.text || '').slice(0, 60), detail: JSON.stringify(s, null, 2) });
    for (const tc of s.toolCalls || []) {
      const res = (s.toolResults || []).find(r => r.toolCallId === tc.toolCallId);
      out.push({ type: 'tool_call', title: tc.toolName, subtitle: '', detail: JSON.stringify({ args: tc.args, result: res?.result }, null, 2) });
    }
  }
  return out;
}

function fromTrajekt(v) {
  return v.steps.map((s) => ({
    type: s.type === 'agent_message' ? 'agent_message' : s.type,
    title: s.type === 'llm_call' ? (s.model || 'llm call') : s.type === 'tool_call' ? s.name : s.type === 'user_message' ? 'user' : s.type,
    subtitle: s.content || s.output?.content || '',
    detail: JSON.stringify(s, null, 2),
    cost: s.costUsd, durationMs: s.durationMs,
  }));
}

function normalizeAny(raw) {
  const fmt = detectFormat(raw);
  let steps = [];
  if (fmt === 'trajekt') steps = fromTrajekt(raw);
  else if (fmt === 'langfuse') steps = fromLangfuse(raw);
  else if (fmt === 'otlp') steps = fromOtlp(raw);
  else if (fmt === 'ai-sdk') steps = fromAiSdk(raw);
  else throw new Error('Format non reconnu — trajekt, langfuse, otlp ou ai-sdk attendu.');
  return { format: fmt, steps };
}

/* ------------------------------------------------------------------ */
/* Exemple : le pipeline Sentry → Jira → GitLab → Slack                */
/* ------------------------------------------------------------------ */

const SAMPLE = {
  format: 'trajekt',
  steps: [
    { type: 'user_message', title: 'sentry-webhook', subtitle: 'NullPointerException dans checkout/payment.ts — 42 occurrences, dernière il y a 3 min', detail: '{\n  "issue": "checkout/payment.ts:118",\n  "level": "error",\n  "count": 42,\n  "environment": "production"\n}' },
    { type: 'llm_call', title: 'claude-sonnet-4-6', subtitle: "L'erreur vient d'un champ optionnel non vérifié dans le calcul de remise. Je crée un ticket et je vérifie s'il existe déjà une MR.", detail: '{\n  "reasoning": "Le champ discount.code peut être undefined quand aucun coupon n\'est appliqué. Le calcul accède directement à discount.code.length sans garde.",\n  "plan": ["create_jira_ticket", "search_gitlab_mr", "notify_slack"]\n}', cost: 0.0034, durationMs: 1400 },
    { type: 'tool_call', title: 'create_jira_ticket', subtitle: '', detail: '{\n  "args": { "project": "PROJ", "summary": "NPE in checkout discount calculation", "priority": "High" },\n  "result": { "key": "PROJ-482", "url": "https://jira.internal/PROJ-482" }\n}', durationMs: 620 },
    { type: 'tool_call', title: 'search_gitlab_mr', subtitle: '', detail: '{\n  "args": { "query": "checkout/payment.ts discount", "state": "opened" },\n  "result": { "found": false, "count": 0 }\n}', durationMs: 310 },
    { type: 'llm_call', title: 'claude-sonnet-4-6', subtitle: "Aucune MR en cours sur ce fichier. Je notifie l'équipe backend avec le lien du ticket.", detail: '{\n  "reasoning": "Pas de fix en cours détecté sur GitLab. L\'équipe backend doit être alertée directement.",\n  "channel": "#backend-alerts"\n}', cost: 0.0018, durationMs: 900 },
    { type: 'tool_call', title: 'send_slack_message', subtitle: '', detail: '{\n  "args": { "channel": "#backend-alerts", "text": "🚨 PROJ-482 créé — NPE checkout/payment.ts, 42 occurrences" },\n  "result": { "ok": true, "ts": "1752480042.001" }\n}', durationMs: 210 },
    { type: 'agent_message', title: 'résumé', subtitle: 'Ticket PROJ-482 créé et équipe notifiée sur #backend-alerts.', detail: '{\n  "totalDurationMs": 3440,\n  "totalCostUsd": 0.0052,\n  "outcome": "escalated"\n}' },
  ],
};

/* ------------------------------------------------------------------ */
/* Config visuelle par type de step                                    */
/* ------------------------------------------------------------------ */

const TYPE_CONFIG = {
  user_message: { icon: User, color: '#ECEAE4', label: 'message' },
  agent_message: { icon: MessageSquare, color: '#ECEAE4', label: 'résumé' },
  llm_call: { icon: Sparkles, color: '#6C8CFF', label: 'appel LLM' },
  tool_call: { icon: Wrench, color: '#FFB224', label: 'outil' },
  decision: { icon: GitBranch, color: '#4FB3A6', label: 'décision' },
  custom: { icon: CircleDot, color: '#7E8494', label: 'événement' },
};

/* ------------------------------------------------------------------ */
/* Géométrie du chemin — la trajectoire ondule, comme dans le logo     */
/* ------------------------------------------------------------------ */

const NODE_W = 172;
const NODE_H = 76;
const GAP = 88;
const BASE_Y = 150;
const AMPLITUDE = 38;

function nodeCenter(i) {
  return { x: i * (NODE_W + GAP) + NODE_W / 2, y: BASE_Y + Math.sin(i * 1.05) * AMPLITUDE };
}

function buildPath(n) {
  if (n === 0) return '';
  const pts = Array.from({ length: n }, (_, i) => nodeCenter(i));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i], p1 = pts[i + 1];
    const midX = p0.x + (p1.x - p0.x) / 2;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  // Prolongement + harpon, dans le prolongement de la tendance
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2] || last;
  const dy = last.y - prev.y;
  const endX = last.x + 64, endY = last.y + dy * 0.6;
  d += ` L ${endX} ${endY}`;
  return { d, barbFrom: { x: endX, y: endY }, dy };
}

/* ------------------------------------------------------------------ */
/* Composant principal                                                 */
/* ------------------------------------------------------------------ */

export default function TrajektExplorer() {
  const [data, setData] = useState(SAMPLE);
  const [selected, setSelected] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const steps = data.steps;
  const stats = useMemo(() => {
    const cost = steps.reduce((s, x) => s + (x.cost || 0), 0);
    const duration = steps.reduce((s, x) => s + (x.durationMs || 0), 0);
    const tools = steps.filter(s => s.type === 'tool_call').length;
    return { cost, duration, tools, count: steps.length };
  }, [steps]);

  const path = useMemo(() => buildPath(steps.length), [steps.length]);
  const canvasWidth = steps.length ? steps.length * (NODE_W + GAP) + 100 : 400;
  const canvasHeight = BASE_Y * 2 + AMPLITUDE;

  const loadFile = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result);
        const normalized = normalizeAny(raw);
        setData(normalized);
        setSelected(0);
        setError(null);
      } catch (e) {
        setError(e.message || 'Impossible de lire ce fichier.');
      }
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  }, [loadFile]);

  const active = steps[selected];
  const activeConf = active ? (TYPE_CONFIG[active.type] || TYPE_CONFIG.custom) : null;

  return (
    <div className="tj-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=swap');

        .tj-root {
          --bg: #10131A;
          --panel: #171B24;
          --panel-hover: #1E2330;
          --border: #262B38;
          --text: #ECEAE4;
          --text-dim: #7E8494;
          --text-faint: #454B5C;
          --amber: #FFB224;
          --blue: #6C8CFF;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
          padding: 28px 20px 60px;
          box-sizing: border-box;
        }
        .tj-root * { box-sizing: border-box; }
        .tj-display { font-family: 'Space Grotesk', system-ui, sans-serif; }
        .tj-mono { font-family: ui-monospace, 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace; }

        .tj-header {
          display: flex; align-items: center; justify-content: space-between;
          max-width: 1040px; margin: 0 auto 6px; flex-wrap: wrap; gap: 14px;
        }
        .tj-brand { display: flex; align-items: center; gap: 10px; }
        .tj-brand-mark { flex-shrink: 0; }
        .tj-brand-name { font-size: 19px; font-weight: 700; letter-spacing: 0.2px; }
        .tj-brand-tag { font-size: 12.5px; color: var(--text-dim); margin-top: 1px; }

        .tj-upload-btn {
          display: flex; align-items: center; gap: 7px;
          background: var(--panel); border: 1px solid var(--border);
          color: var(--text); font-size: 13px; font-weight: 500;
          padding: 8px 14px; border-radius: 9px; cursor: pointer;
          transition: border-color .15s, background .15s;
        }
        .tj-upload-btn:hover { border-color: var(--amber); background: var(--panel-hover); }
        .tj-upload-btn:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }

        .tj-hero { max-width: 1040px; margin: 22px auto 20px; }
        .tj-hero-title { font-size: 26px; font-weight: 700; line-height: 1.25; max-width: 520px; }
        .tj-hero-sub { color: var(--text-dim); font-size: 14px; margin-top: 8px; max-width: 480px; line-height: 1.5; }

        .tj-stats {
          max-width: 1040px; margin: 0 auto 4px; display: flex; gap: 10px; flex-wrap: wrap;
        }
        .tj-stat {
          display: flex; align-items: center; gap: 7px;
          background: var(--panel); border: 1px solid var(--border);
          padding: 7px 12px; border-radius: 8px; font-size: 12.5px; color: var(--text-dim);
        }
        .tj-stat b { color: var(--text); font-weight: 600; }
        .tj-stat-pill {
          background: rgba(255,178,36,0.12); border: 1px solid rgba(255,178,36,0.35);
          color: var(--amber); font-weight: 600; text-transform: uppercase; font-size: 11px;
          letter-spacing: 0.4px; padding: 6px 10px; border-radius: 8px;
        }

        .tj-canvas-wrap {
          max-width: 1040px; margin: 20px auto 0;
          border: 1px solid var(--border); border-radius: 16px;
          background: linear-gradient(180deg, #12151D 0%, #0E1017 100%);
          overflow-x: auto; overflow-y: hidden;
          position: relative;
        }
        .tj-canvas-wrap.drag { border-color: var(--amber); background: linear-gradient(180deg, #171308 0%, #0E1017 100%); }
        .tj-canvas { position: relative; }

        .tj-node {
          position: absolute;
          width: ${NODE_W}px; height: ${NODE_H}px;
          background: var(--panel); border: 1px solid var(--border);
          border-radius: 12px; padding: 10px 12px;
          cursor: pointer; text-align: left;
          display: flex; flex-direction: column; gap: 4px;
          transition: border-color .15s, transform .15s, background .15s;
          animation: tj-fade-in .4s ease backwards;
        }
        .tj-node:hover { background: var(--panel-hover); transform: translateY(-2px); }
        .tj-node.active { border-color: var(--amber); box-shadow: 0 0 0 1px var(--amber), 0 8px 24px -8px rgba(255,178,36,0.35); }
        .tj-node:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
        .tj-node-top { display: flex; align-items: center; gap: 7px; }
        .tj-node-title { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tj-node-sub { font-size: 11px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        @keyframes tj-fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) { .tj-node { animation: none; } }

        .tj-drop-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 10px; padding: 60px 20px; color: var(--text-dim); text-align: center;
        }

        .tj-detail {
          max-width: 1040px; margin: 18px auto 0;
          border: 1px solid var(--border); border-radius: 14px;
          background: var(--panel); padding: 18px 20px;
        }
        .tj-detail-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .tj-detail-type { display: flex; align-items: center; gap: 9px; }
        .tj-detail-badge {
          width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .tj-detail-title { font-size: 14.5px; font-weight: 600; }
        .tj-detail-kind { font-size: 11.5px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.4px; }
        .tj-detail-meta { display: flex; gap: 14px; font-size: 12px; color: var(--text-dim); }
        .tj-detail-meta span { display: flex; align-items: center; gap: 4px; }
        .tj-pre {
          background: var(--bg); border: 1px solid var(--border); border-radius: 9px;
          padding: 13px 14px; font-size: 12px; line-height: 1.6; color: var(--text-dim);
          overflow-x: auto; white-space: pre; max-height: 220px;
        }
        .tj-pre b { color: var(--text); }

        .tj-footer-note {
          max-width: 1040px; margin: 16px auto 0; font-size: 12px; color: var(--text-faint);
          display: flex; align-items: center; gap: 6px;
        }

        .tj-error {
          max-width: 1040px; margin: 12px auto 0; padding: 10px 14px; border-radius: 9px;
          background: rgba(255,90,90,0.08); border: 1px solid rgba(255,90,90,0.3); color: #FF9A9A; font-size: 13px;
        }
      `}</style>

      {/* Header */}
      <div className="tj-header">
        <div className="tj-brand">
          <svg className="tj-brand-mark" width="34" height="34" viewBox="0 0 512 512">
            <rect width="512" height="512" rx="112" fill="#14161C" />
            <g stroke="#ECEAE4" strokeWidth="46" strokeLinecap="round" strokeLinejoin="round" fill="none">
              <path d="M 240 108 L 240 288 Q 240 336 290 336" />
              <path d="M 168 172 L 316 172" />
            </g>
            <g stroke="#FFB224" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" fill="none">
              <path d="M 116 414 L 396 414" />
              <path d="M 396 414 L 330 462" />
            </g>
          </svg>
          <div>
            <div className="tj-brand-name tj-display">trajekt</div>
            <div className="tj-brand-tag">trajectory explorer</div>
          </div>
        </div>
        <button className="tj-upload-btn" onClick={() => fileInputRef.current?.click()}>
          <UploadCloud size={15} />
          Charger une trace
        </button>
        <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
      </div>

      {/* Hero */}
      <div className="tj-hero">
        <div className="tj-hero-title tj-display">Ton agent, enfin lisible.</div>
        <div className="tj-hero-sub">
          Glisse un export Langfuse, OTLP ou Vercel AI SDK — ou explore l'exemple ci-dessous,
          le pipeline Sentry → Jira → Slack tel qu'il tourne en vrai.
        </div>
      </div>

      {/* Stats */}
      <div className="tj-stats">
        <span className="tj-stat-pill">{data.format}</span>
        <div className="tj-stat"><Layers size={13} /><b>{stats.count}</b>&nbsp;steps</div>
        <div className="tj-stat"><Wrench size={13} /><b>{stats.tools}</b>&nbsp;appels d'outils</div>
        {stats.cost > 0 && <div className="tj-stat"><DollarSign size={13} /><b>${stats.cost.toFixed(4)}</b></div>}
        {stats.duration > 0 && <div className="tj-stat"><Clock size={13} /><b>{(stats.duration / 1000).toFixed(1)}s</b>&nbsp;au total</div>}
      </div>

      {error && <div className="tj-error">{error}</div>}

      {/* Canvas */}
      <div
        className={`tj-canvas-wrap${dragOver ? ' drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {steps.length === 0 ? (
          <div className="tj-drop-empty">
            <UploadCloud size={28} />
            <div>Dépose un fichier JSON de trace ici</div>
          </div>
        ) : (
          <div className="tj-canvas" style={{ width: canvasWidth, height: canvasHeight }}>
            <svg width={canvasWidth} height={canvasHeight} style={{ position: 'absolute', top: 0, left: 0 }}>
              <path d={path.d} fill="none" stroke="#FFB224" strokeWidth="2.5" strokeDasharray="1 9" strokeLinecap="round" opacity="0.85" />
              {path.barbFrom && (
                <path
                  d={`M ${path.barbFrom.x} ${path.barbFrom.y} L ${path.barbFrom.x - 26} ${path.barbFrom.y + (path.dy >= 0 ? 26 : -26)}`}
                  stroke="#FFB224" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.85"
                />
              )}
            </svg>
            {steps.map((s, i) => {
              const conf = TYPE_CONFIG[s.type] || TYPE_CONFIG.custom;
              const Icon = conf.icon;
              const c = nodeCenter(i);
              return (
                <button
                  key={i}
                  className={`tj-node${selected === i ? ' active' : ''}`}
                  style={{ left: c.x - NODE_W / 2, top: c.y - NODE_H / 2, animationDelay: `${i * 45}ms` }}
                  onClick={() => setSelected(i)}
                >
                  <div className="tj-node-top">
                    <Icon size={14} color={conf.color} />
                    <span className="tj-node-title">{s.title}</span>
                  </div>
                  {s.subtitle && <span className="tj-node-sub">{s.subtitle}</span>}
                  {(s.cost || s.durationMs) && (
                    <span className="tj-node-sub tj-mono" style={{ marginTop: 'auto' }}>
                      {s.durationMs ? `${s.durationMs}ms` : ''}{s.cost ? `  ·  $${s.cost.toFixed(4)}` : ''}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {active && (
        <div className="tj-detail">
          <div className="tj-detail-head">
            <div className="tj-detail-type">
              <div className="tj-detail-badge" style={{ background: `${activeConf.color}1F` }}>
                <activeConf.icon size={16} color={activeConf.color} />
              </div>
              <div>
                <div className="tj-detail-title">{active.title}</div>
                <div className="tj-detail-kind">{activeConf.label}</div>
              </div>
            </div>
            <div className="tj-detail-meta">
              {active.durationMs != null && <span className="tj-mono"><Clock size={12} />{active.durationMs}ms</span>}
              {active.cost != null && <span className="tj-mono"><DollarSign size={12} />{active.cost.toFixed(4)}</span>}
            </div>
          </div>
          <pre className="tj-pre tj-mono">{active.detail}</pre>
        </div>
      )}

      <div className="tj-footer-note">
        <ChevronRight size={12} />
        propulsé par @trajekt/core — même moteur de normalisation, zéro config
      </div>
    </div>
  );
}
