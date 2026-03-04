import { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';
import { generateQuestions, generatePromo, analyzeHistory } from './lib/ai';

const STATUS = ['计划中', '进行中', '已完成'];
const STATUS_STYLE = {
  '计划中': { bg: '#1a2744', text: '#60a5fa', border: '#2563eb' },
  '进行中': { bg: '#1a3320', text: '#4ade80', border: '#16a34a' },
  '已完成': { bg: '#2d1f00', text: '#fbbf24', border: '#d97706' },
};

const EMPTY_FORM = {
  project_name: '', episode: '', date: '', status: '计划中',
  theme: '', questions: '', kols: '', channels: '', notes: '',
  poster_url: '',
};

export default function App() {
  const [records, setRecords] = useState([]);
  const [view, setView] = useState('list'); // list | form | detail | analysis
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);
  const [aiLoading, setAiLoading] = useState(null); // 'questions' | 'promo' | 'analysis'
  const [aiResult, setAiResult] = useState('');
  const [analysisText, setAnalysisText] = useState('');
  const fileRef = useRef();

  useEffect(() => { fetchRecords(); }, []);

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  async function fetchRecords() {
    setLoading(true);
    const { data, error } = await supabase
      .from('ama_records')
      .select('*')
      .order('date', { ascending: false });
    if (error) showToast('加载失败：' + error.message, 'err');
    else setRecords(data || []);
    setLoading(false);
  }

  async function handleSave() {
    if (!form.project_name || !form.date) {
      showToast('项目名称和日期为必填项', 'err'); return;
    }
    setSaving(true);
    let error;
    if (editId) {
      ({ error } = await supabase.from('ama_records').update(form).eq('id', editId));
    } else {
      ({ error } = await supabase.from('ama_records').insert(form));
    }
    if (error) { showToast('保存失败：' + error.message, 'err'); }
    else { showToast('保存成功 ✓'); await fetchRecords(); setView('list'); resetForm(); }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!window.confirm('确认删除？')) return;
    const { error } = await supabase.from('ama_records').delete().eq('id', id);
    if (error) showToast('删除失败', 'err');
    else { showToast('已删除'); fetchRecords(); if (view === 'detail') setView('list'); }
  }

  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('ama-posters').upload(path, file);
    if (upErr) { showToast('图片上传失败', 'err'); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('ama-posters').getPublicUrl(path);
    setForm(f => ({ ...f, poster_url: publicUrl }));
    showToast('海报上传成功 ✓');
    setUploading(false);
  }

  function resetForm() { setForm(EMPTY_FORM); setEditId(null); setAiResult(''); }

  function openEdit(r) {
    setForm({ ...EMPTY_FORM, ...r });
    setEditId(r.id);
    setAiResult('');
    setView('form');
  }

  // AI: 生成问题
  async function handleGenQuestions() {
    setAiLoading('questions');
    try {
      const text = await generateQuestions({
        projectName: form.project_name,
        theme: form.theme,
        notes: form.notes,
        history: records,
      });
      setForm(f => ({ ...f, questions: text }));
      setAiResult('questions');
      showToast('AI 问题已生成 ✓');
    } catch (e) { showToast('AI 调用失败：' + e.message, 'err'); }
    setAiLoading(null);
  }

  // AI: 生成宣传文案
  async function handleGenPromo() {
    setAiLoading('promo');
    try {
      const text = await generatePromo({
        projectName: form.project_name,
        theme: form.theme,
        date: form.date,
        kols: form.kols,
        questions: form.questions,
      });
      setAiResult('promo_text');
      setForm(f => ({ ...f, _promo: text }));
      showToast('宣传文案已生成 ✓');
    } catch (e) { showToast('AI 调用失败：' + e.message, 'err'); }
    setAiLoading(null);
  }

  // AI: 历史分析
  async function handleAnalysis() {
    setAiLoading('analysis');
    setView('analysis');
    try {
      const text = await analyzeHistory(records);
      setAnalysisText(text);
    } catch (e) { setAnalysisText('分析失败：' + e.message); }
    setAiLoading(null);
  }

  const filtered = records.filter(r =>
    [r.project_name, r.theme, r.kols, r.episode].some(f => f?.includes(search))
  );

  return (
    <div style={{ minHeight: '100vh', background: '#080e1a', color: '#e2e8f0', fontFamily: "'PingFang SC','Noto Sans SC',sans-serif" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          padding: '10px 20px', borderRadius: 8,
          background: toast.type === 'err' ? '#450a0a' : '#052e16',
          border: `1px solid ${toast.type === 'err' ? '#dc2626' : '#16a34a'}`,
          color: '#fff', fontSize: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
        }}>{toast.msg}</div>
      )}

      {/* Topbar */}
      <div style={{ background: '#0c1524', borderBottom: '1px solid #1e2d45', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18, color: '#fff' }}>A</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', letterSpacing: 1 }}>AMA 档案库</div>
            <div style={{ fontSize: 11, color: '#475569' }}>大树财经 · {records.length} 条记录</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {view !== 'analysis' && (
            <button onClick={handleAnalysis} style={btnStyle('#1a2744', '#60a5fa', '#2563eb')}>
              🤖 AI 历史分析
            </button>
          )}
          {view !== 'form' && (
            <button onClick={() => { resetForm(); setView('form'); }} style={btnStyle('linear-gradient(135deg,#2563eb,#7c3aed)', '#fff', 'none', true)}>
              + 新建 AMA
            </button>
          )}
          {view !== 'list' && (
            <button onClick={() => setView('list')} style={btnStyle('transparent', '#94a3b8', '#334155')}>
              返回列表
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>

        {/* LIST */}
        {view === 'list' && (
          <>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜索项目名、主题、KOL..."
              style={{ ...inputS, width: '100%', marginBottom: 20, boxSizing: 'border-box' }} />
            {loading ? <Center>加载中...</Center>
              : filtered.length === 0 ? <Empty search={search} />
              : filtered.map(r => <RecordCard key={r.id} r={r} onOpen={() => { setDetail(r); setView('detail'); }} onEdit={() => openEdit(r)} onDelete={() => handleDelete(r.id)} />)
            }
          </>
        )}

        {/* DETAIL */}
        {view === 'detail' && detail && (() => {
          const r = records.find(x => x.id === detail.id) || detail;
          const sc = STATUS_STYLE[r.status] || STATUS_STYLE['计划中'];
          return (
            <div>
              <div style={{ display: 'flex', gap: 24, marginBottom: 24, flexWrap: 'wrap' }}>
                {r.poster_url && <img src={r.poster_url} alt="海报" style={{ width: 120, height: 120, borderRadius: 10, objectFit: 'cover', border: '1px solid #1e2d45' }} />}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>{r.project_name}</h1>
                    {r.episode && <Tag>{r.episode} 期</Tag>}
                    <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 5, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>{r.status}</span>
                  </div>
                  <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 6 }}>📅 {r.date}</div>
                  {r.theme && <div style={{ fontSize: 15, color: '#cbd5e1', fontWeight: 500 }}>{r.theme}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button onClick={() => openEdit(r)} style={btnStyle('#1a2744', '#60a5fa', '#2563eb')}>编辑</button>
                    <button onClick={() => handleDelete(r.id)} style={btnStyle('transparent', '#ef4444', '#7f1d1d')}>删除</button>
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {[
                  { label: '❓ AMA 问题', value: r.questions, full: true },
                  { label: '🎤 KOL / 嘉宾', value: r.kols },
                  { label: '📢 宣发渠道', value: r.channels },
                  { label: '📝 备注 / 复盘', value: r.notes, full: true },
                ].filter(x => x.value).map(({ label, value, full }) => (
                  <div key={label} style={{ gridColumn: full ? '1/-1' : 'auto', background: '#0c1524', border: '1px solid #1e2d45', borderRadius: 10, padding: '16px 18px' }}>
                    <div style={{ fontSize: 11, color: '#475569', marginBottom: 8, fontWeight: 700, letterSpacing: 1 }}>{label}</div>
                    <pre style={{ margin: 0, fontSize: 14, color: '#cbd5e1', whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.8 }}>{value}</pre>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* FORM */}
        {view === 'form' && (
          <div>
            <h2 style={{ margin: '0 0 24px', fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>
              {editId ? '编辑 AMA 记录' : '新建 AMA 记录'}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <F label="项目名称 *"><input value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))} placeholder="如：OracleX、MemeRush" style={inputS} /></F>
              <F label="期数"><input value={form.episode} onChange={e => setForm(f => ({ ...f, episode: e.target.value }))} placeholder="如：001" style={inputS} /></F>
              <F label="日期 *"><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inputS} /></F>
              <F label="状态">
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inputS}>
                  {STATUS.map(s => <option key={s}>{s}</option>)}
                </select>
              </F>
              <F label="AMA 主题" full>
                <input value={form.theme} onChange={e => setForm(f => ({ ...f, theme: e.target.value }))} placeholder="本期主题" style={inputS} />
              </F>

              {/* AI 问题生成 */}
              <F label={
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  问题列表
                  <button onClick={handleGenQuestions} disabled={!form.project_name || aiLoading === 'questions'}
                    style={{ ...btnStyle('#1a2744', '#a78bfa', '#7c3aed'), fontSize: 11, padding: '2px 10px' }}>
                    {aiLoading === 'questions' ? '生成中...' : '🤖 AI 生成'}
                  </button>
                </span>
              } full>
                <textarea value={form.questions} onChange={e => setForm(f => ({ ...f, questions: e.target.value }))}
                  placeholder="每行一个问题，或点击「AI 生成」自动创建" rows={7} style={{ ...inputS, resize: 'vertical' }} />
              </F>

              <F label="KOL / 嘉宾">
                <textarea value={form.kols} onChange={e => setForm(f => ({ ...f, kols: e.target.value }))} placeholder={"每行一位\n@crypto_kol"} rows={4} style={{ ...inputS, resize: 'vertical' }} />
              </F>
              <F label="宣发渠道">
                <textarea value={form.channels} onChange={e => setForm(f => ({ ...f, channels: e.target.value }))} placeholder={"每行一个渠道\nTelegram 大树财经群"} rows={4} style={{ ...inputS, resize: 'vertical' }} />
              </F>

              {/* 海报上传 */}
              <F label="海报图片" full>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <button onClick={() => fileRef.current.click()} disabled={uploading}
                    style={btnStyle('#1a2744', '#60a5fa', '#2563eb', false, true)}>
                    {uploading ? '上传中...' : '📎 上传海报'}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                  {form.poster_url && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <img src={form.poster_url} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }} />
                      <button onClick={() => setForm(f => ({ ...f, poster_url: '' }))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                    </div>
                  )}
                </div>
              </F>

              <F label="备注 / 复盘" full>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="效果数据、复盘总结、下次注意事项..." rows={3} style={{ ...inputS, resize: 'vertical' }} />
              </F>

              {/* AI 宣传文案 */}
              {(form.project_name && form.theme) && (
                <F label={
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    宣传文案（AI 生成）
                    <button onClick={handleGenPromo} disabled={aiLoading === 'promo'}
                      style={{ ...btnStyle('#1a2744', '#a78bfa', '#7c3aed'), fontSize: 11, padding: '2px 10px' }}>
                      {aiLoading === 'promo' ? '生成中...' : '🤖 生成文案'}
                    </button>
                  </span>
                } full>
                  {form._promo
                    ? <pre style={{ margin: 0, padding: '12px 16px', background: '#0f1c2e', border: '1px solid #7c3aed', borderRadius: 8, fontSize: 13, color: '#c4b5fd', whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.8 }}>{form._promo}</pre>
                    : <div style={{ padding: '12px 16px', background: '#0f1c2e', border: '1px dashed #334155', borderRadius: 8, fontSize: 13, color: '#475569' }}>填写项目名、主题、KOL 后点击生成</div>
                  }
                </F>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button onClick={handleSave} disabled={saving} style={btnStyle('linear-gradient(135deg,#2563eb,#7c3aed)', '#fff', 'none', true)}>
                {saving ? '保存中...' : (editId ? '保存修改' : '创建记录')}
              </button>
              <button onClick={() => { setView('list'); resetForm(); }} style={btnStyle('transparent', '#94a3b8', '#334155')}>取消</button>
            </div>
          </div>
        )}

        {/* ANALYSIS */}
        {view === 'analysis' && (
          <div>
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>🤖 AI 历史分析报告</h2>
            <div style={{ background: '#0c1524', border: '1px solid #1e2d45', borderRadius: 12, padding: '24px 28px' }}>
              {aiLoading === 'analysis'
                ? <div style={{ color: '#60a5fa', textAlign: 'center', padding: 40 }}>AI 分析中，请稍候...</div>
                : <pre style={{ margin: 0, fontSize: 14, color: '#cbd5e1', whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.9 }}>{analysisText || '点击「AI 历史分析」按钮开始'}</pre>
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function RecordCard({ r, onOpen, onEdit, onDelete }) {
  const sc = STATUS_STYLE[r.status] || STATUS_STYLE['计划中'];
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: '#0c1524', border: `1px solid ${hover ? '#2563eb' : '#1e2d45'}`, borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', marginBottom: 12, transition: 'border-color 0.2s' }}>
      <div style={{ width: 56, height: 56, borderRadius: 8, background: '#1e2d45', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {r.poster_url ? <img src={r.poster_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 24 }}>🎙️</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>{r.project_name}</span>
          {r.episode && <Tag>{r.episode} 期</Tag>}
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>{r.status}</span>
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.theme || '（暂无主题）'}</div>
        <div style={{ fontSize: 12, color: '#475569', display: 'flex', gap: 16 }}>
          <span>📅 {r.date}</span>
          {r.kols && <span>🎤 {r.kols.split('\n')[0]}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <button onClick={onEdit} style={btnStyle('#1e2d45', '#94a3b8', '#2d3f5c')}>编辑</button>
        <button onClick={onDelete} style={btnStyle('transparent', '#ef4444', '#3f1515')}>删除</button>
      </div>
    </div>
  );
}

function F({ label, children, full }) {
  return (
    <div style={{ gridColumn: full ? '1/-1' : 'auto' }}>
      <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 }}>{label}</label>
      {children}
    </div>
  );
}

function Tag({ children }) {
  return <span style={{ fontSize: 11, color: '#60a5fa', background: '#1a2744', padding: '2px 7px', borderRadius: 4 }}>{children}</span>;
}

function Center({ children }) {
  return <div style={{ textAlign: 'center', padding: 60, color: '#475569' }}>{children}</div>;
}

function Empty({ search }) {
  return (
    <div style={{ textAlign: 'center', padding: 80, color: '#334155', border: '1px dashed #1e2d45', borderRadius: 12 }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
      <div style={{ fontSize: 16, marginBottom: 6 }}>{search ? '没有找到匹配记录' : '还没有 AMA 记录'}</div>
      <div style={{ fontSize: 13, color: '#475569' }}>点击右上角「新建 AMA」开始添加</div>
    </div>
  );
}

// ── Style helpers ───────────────────────────────────────────

const inputS = {
  width: '100%', padding: '10px 14px', borderRadius: 7,
  background: '#0f1c2e', border: '1px solid #1e2d45',
  color: '#e2e8f0', fontSize: 14, outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit',
};

function btnStyle(bg, color, border, gradient = false, dashed = false) {
  return {
    padding: '7px 14px', borderRadius: 7,
    background: bg, color, fontSize: 13, fontWeight: 600,
    border: border === 'none' ? 'none' : `1px ${dashed ? 'dashed' : 'solid'} ${border}`,
    cursor: 'pointer',
  };
}
