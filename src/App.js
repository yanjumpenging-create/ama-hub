import { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';
import { generatePromo, analyzeHistory, generateSummary } from './lib/ai';

const STATUS = ['计划中', '进行中', '已完成'];
const STATUS_STYLE = {
  '计划中': { bg: '#f0fdf4', text: '#34d399', border: '#059669' },
  '进行中': { bg: '#dcfce7', text: '#34d399', border: '#059669' },
  '已完成': { bg: '#2d1f00', text: '#fbbf24', border: '#d97706' },
};
const PLATFORMS = ['Telegram', 'Twitter Space', 'Discord', 'YouTube Live', 'Zoom', '其他'];

const EMPTY_FORM = {
  project_name: '', episode: '', date: '', time: '', status: '计划中',
  platform: 'Telegram', owner: '', theme: '', questions: '',
  kols: '', channels: '', replay_url: '', notes: '', poster_url: '',
};

export default function App() {
  const [records, setRecords] = useState([]);
  const [view, setView] = useState('list');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);
  const [aiLoading, setAiLoading] = useState(null);
  const [analysisText, setAnalysisText] = useState('');
  const [summaryPeriod, setSummaryPeriod] = useState('monthly');
  const fileRef = useRef();

  useEffect(() => { fetchRecords(); }, []);

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  async function fetchRecords() {
    setLoading(true);
    const { data, error } = await supabase.from('ama_records').select('*').order('date', { ascending: false });
    if (error) showToast('加载失败：' + error.message, 'err');
    else setRecords(data || []);
    setLoading(false);
  }

  async function handleSave() {
    if (!form.project_name || !form.date) { showToast('项目名称和日期为必填项', 'err'); return; }
    setSaving(true);
    const payload = { ...form };
    delete payload._promo;
    let error;
    if (editId) {
      ({ error } = await supabase.from('ama_records').update(payload).eq('id', editId));
    } else {
      ({ error } = await supabase.from('ama_records').insert(payload));
    }
    if (error) showToast('保存失败：' + error.message, 'err');
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
    const path = `${Date.now()}.${file.name.split('.').pop()}`;
    const { error: upErr } = await supabase.storage.from('ama-posters').upload(path, file);
    if (upErr) { showToast('图片上传失败', 'err'); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('ama-posters').getPublicUrl(path);
    setForm(f => ({ ...f, poster_url: publicUrl }));
    showToast('海报上传成功 ✓');
    setUploading(false);
  }

  function resetForm() { setForm(EMPTY_FORM); setEditId(null); }
  function openEdit(r) { setForm({ ...EMPTY_FORM, ...r }); setEditId(r.id); setView('form'); }

  async function handleGenPromo() {
    setAiLoading('promo');
    try {
      const text = await generatePromo({ projectName: form.project_name, theme: form.theme, date: form.date, kols: form.kols, questions: form.questions });
      setForm(f => ({ ...f, _promo: text }));
      showToast('宣传文案已生成 ✓');
    } catch (e) { showToast('AI 调用失败：' + e.message, 'err'); }
    setAiLoading(null);
  }

  async function handleAnalysis() {
    setAiLoading('analysis'); setView('analysis');
    try { setAnalysisText(await analyzeHistory(records)); }
    catch (e) { setAnalysisText('分析失败：' + e.message); }
    setAiLoading(null);
  }

  async function handleSummary() {
    setAiLoading('summary'); setView('analysis');
    try { setAnalysisText(await generateSummary(records, summaryPeriod)); }
    catch (e) { setAnalysisText('生成失败：' + e.message); }
    setAiLoading(null);
  }

  const filtered = records.filter(r =>
    [r.project_name, r.theme, r.kols, r.episode, r.owner, r.platform].some(f => f?.includes(search))
  );

  const completed = records.filter(r => r.status === '已完成');
  const planned = records.filter(r => r.status === '计划中');
  const monthlyData = getMonthlyData(records);
  const kolFreq = getKolFrequency(records);
  const platformDist = getPlatformDist(records);

  return (
    <div style={{ minHeight: '100vh', background: '#f0faf5', color: '#1f2937', fontFamily: "'PingFang SC','Noto Sans SC',sans-serif", fontSize: 15 }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '10px 20px', borderRadius: 8, background: toast.type === 'err' ? '#fef2f2' : '#f0fdf4', border: `1px solid ${toast.type === 'err' ? '#dc2626' : '#059669'}`, color: toast.type === 'err' ? '#dc2626' : '#065f46', fontSize: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}>{toast.msg}</div>
      )}

      <div style={{ background: 'linear-gradient(180deg,#ffffff 0%,#f9fffe 100%)', borderBottom: '1px solid #bbf7d0', borderTop: '4px solid #059669', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 16px rgba(5,150,105,0.10)', minHeight: 80 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img src="/logo.png" alt="Tree Finance" style={{ height: 56, width: 'auto', maxWidth: 200, objectFit: 'contain' }} />
          <div style={{ borderLeft: '2px solid #bbf7d0', paddingLeft: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#064e3b', letterSpacing: 0.5, lineHeight: 1.2 }}>AMA Archives</div>
            <div style={{ fontSize: 13, color: '#059669', letterSpacing: 0.3, marginTop: 3 }}>{records.length} Records</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {view !== 'dashboard' && <button onClick={() => setView('dashboard')} style={btnS('#f0fdf4','#34d399','#059669')}>📊 数据看板</button>}
          {view !== 'analysis' && <button onClick={handleAnalysis} style={btnS('#f0fdf4','#6ee7b7','#065f46')}>🤖 深度分析</button>}
          {view !== 'form' && <button onClick={() => { resetForm(); setView('form'); }} style={btnS('linear-gradient(135deg,#059669,#065f46)','#fff','none',true)}>+ 新建 AMA</button>}
          {view !== 'list' && <button onClick={() => setView('list')} style={btnS('transparent','#6b7280','#e5e7eb')}>返回列表</button>}
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 16px' }}>

        {view === 'list' && (
          <>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索项目名、主题、KOL、负责人..." style={{ ...inputS, width: '100%', marginBottom: 20, fontSize: 15, boxSizing: 'border-box' }} />
            {loading ? <Center>加载中...</Center>
              : filtered.length === 0 ? <Empty search={search} />
              : filtered.map(r => <RecordCard key={r.id} r={r} onOpen={() => { setDetail(r); setView('detail'); }} onEdit={() => openEdit(r)} onDelete={() => handleDelete(r.id)} />)}
          </>
        )}

        {view === 'detail' && detail && (() => {
          const r = records.find(x => x.id === detail.id) || detail;
          const sc = STATUS_STYLE[r.status] || STATUS_STYLE['计划中'];
          return (
            <div>
              <div style={{ display: 'flex', gap: 24, marginBottom: 24, flexWrap: 'wrap' }}>
                {r.poster_url && <img src={r.poster_url} alt="海报" style={{ width: 120, height: 120, borderRadius: 10, objectFit: 'cover', border: '1px solid #bbf7d0' }} />}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#111827' }}>{r.project_name}</h1>
                    {r.episode && <Tag>{r.episode} 期</Tag>}
                    <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 5, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>{r.status}</span>
                    {r.platform && <Tag color="#dcfce7">{r.platform}</Tag>}
                  </div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
                    📅 {r.date}{r.time ? ` ${r.time}` : ''}{r.owner ? `　👤 ${r.owner}` : ''}
                  </div>
                  {r.theme && <div style={{ fontSize: 15, color: '#374151', fontWeight: 500 }}>{r.theme}</div>}
                  {r.replay_url && <a href={r.replay_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#34d399', display: 'block', marginTop: 6 }}>▶ 查看回放</a>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button onClick={() => openEdit(r)} style={btnS('#f0fdf4','#34d399','#059669')}>编辑</button>
                    <button onClick={() => handleDelete(r.id)} style={btnS('#fff5f5','#ef4444','#fecaca')}>删除</button>
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
                  <div key={label} style={{ gridColumn: full ? '1/-1' : 'auto', background: '#ffffff', border: '1px solid #bbf7d0', borderRadius: 10, padding: '16px 18px' }}>
                    <div style={{ fontSize: 11, color: '#059669', marginBottom: 8, fontWeight: 700, letterSpacing: 1 }}>{label}</div>
                    <pre style={{ margin: 0, fontSize: 14, color: '#374151', whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.8 }}>{value}</pre>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {view === 'form' && (
          <div>
            <h2 style={{ margin: '0 0 24px', fontSize: 20, fontWeight: 700, color: '#111827' }}>{editId ? '编辑 AMA 记录' : '新建 AMA 记录'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <F label="项目名称 *"><input value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))} placeholder="如：OracleX" style={inputS} /></F>
              <F label="期数"><input value={form.episode} onChange={e => setForm(f => ({ ...f, episode: e.target.value }))} placeholder="如：001" style={inputS} /></F>
              <F label="日期 *"><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inputS} /></F>
              <F label="开始时间"><input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} style={inputS} /></F>
              <F label="平台">
                <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} style={inputS}>
                  {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                </select>
              </F>
              <F label="状态">
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inputS}>
                  {STATUS.map(s => <option key={s}>{s}</option>)}
                </select>
              </F>
              <F label="负责人分工" full>
                <input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} placeholder="如：内容-阿Yan / 美工-小美 / 宣发-晓东" style={inputS} />
              </F>
              <F label="AMA 主题" full>
                <input value={form.theme} onChange={e => setForm(f => ({ ...f, theme: e.target.value }))} placeholder="本期主题" style={inputS} />
              </F>
              <F label="问题列表" full>
                <textarea value={form.questions} onChange={e => setForm(f => ({ ...f, questions: e.target.value }))} placeholder="每行一个问题" rows={7} style={{ ...inputS, resize: 'vertical' }} />
              </F>
              <F label="KOL / 嘉宾">
                <textarea value={form.kols} onChange={e => setForm(f => ({ ...f, kols: e.target.value }))} placeholder={"每行一位\n@crypto_kol"} rows={4} style={{ ...inputS, resize: 'vertical' }} />
              </F>
              <F label="宣发渠道">
                <textarea value={form.channels} onChange={e => setForm(f => ({ ...f, channels: e.target.value }))} placeholder="每行一个渠道" rows={4} style={{ ...inputS, resize: 'vertical' }} />
              </F>
              <F label="回放链接" full>
                <input value={form.replay_url} onChange={e => setForm(f => ({ ...f, replay_url: e.target.value }))} placeholder="https://..." style={inputS} />
              </F>
              <F label="海报图片" full>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <button onClick={() => fileRef.current.click()} disabled={uploading} style={btnS('#f0fdf4','#34d399','#059669',false,true)}>
                    {uploading ? '上传中...' : '📎 上传海报'}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                  {form.poster_url && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <img src={form.poster_url} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }} />
                      <button onClick={() => setForm(f => ({ ...f, poster_url: '' }))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 18 }}>×</button>
                    </div>
                  )}
                </div>
              </F>
              <F label="备注 / 复盘" full>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="效果数据、复盘总结..." rows={3} style={{ ...inputS, resize: 'vertical' }} />
              </F>
              {(form.project_name && form.theme) && (
                <F label={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>宣传文案 <button onClick={handleGenPromo} disabled={aiLoading === 'promo'} style={{ ...btnS('#f0fdf4','#6ee7b7','#065f46'), fontSize: 11, padding: '2px 10px' }}>{aiLoading === 'promo' ? '生成中...' : '🤖 AI 生成'}</button></span>} full>
                  {form._promo
                    ? <pre style={{ margin: 0, padding: '12px 16px', background: '#f0fdf4', border: '1px solid #065f46', borderRadius: 8, fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.8 }}>{form._promo}</pre>
                    : <div style={{ padding: '12px 16px', background: '#f0fdf4', border: '1px dashed #1a3a2a', borderRadius: 8, fontSize: 13, color: '#059669' }}>填写项目名和主题后点击生成</div>}
                </F>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button onClick={handleSave} disabled={saving} style={btnS('linear-gradient(135deg,#059669,#065f46)','#fff','none',true)}>
                {saving ? '保存中...' : (editId ? '保存修改' : '创建记录')}
              </button>
              <button onClick={() => { setView('list'); resetForm(); }} style={btnS('transparent','#6b7280','#e5e7eb')}>取消</button>
            </div>
          </div>
        )}

        {view === 'dashboard' && (
          <div>
            <h2 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 700, color: '#111827' }}>📊 数据看板</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
              {[
                { label: '总 AMA 数', value: records.length, color: '#10b981', bar: '#059669' },
                { label: '已完成', value: completed.length, color: '#34d399', bar: '#10b981' },
                { label: '计划中', value: planned.length, color: '#fbbf24', bar: '#d97706' },
                { label: '完成率', value: records.length ? Math.round(completed.length / records.length * 100) + '%' : '0%', color: '#6ee7b7', bar: '#059669' },
              ].map(({ label, value, color, bar }) => (
                <div key={label} style={{ background: 'linear-gradient(180deg,#f9fffe 0%,#ffffff 100%)', border: '1px solid #bbf7d0', borderTop: `3px solid ${bar}`, borderRadius: 12, padding: '20px 16px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}>
                  <div style={{ fontSize: 36, fontWeight: 900, color, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                  <div style={{ fontSize: 13, color: '#059669', marginTop: 6, fontWeight: 500 }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ background: 'linear-gradient(180deg,#f9fffe 0%,#ffffff 100%)', border: '1px solid #134d2a', borderRadius: 12, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.25)' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#6b7280', marginBottom: 16 }}>📈 每月 AMA 数量</div>
                {monthlyData.length === 0 ? <div style={{ color: '#e5e7eb', fontSize: 13, textAlign: 'center', padding: 20 }}>暂无数据</div> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {monthlyData.map(({ month, count, max }) => (
                      <div key={month} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ fontSize: 13, color: '#6b7280', width: 55, flexShrink: 0 }}>{month}</div>
                        <div style={{ flex: 1, background: '#dcfce7', borderRadius: 4, height: 20, overflow: 'hidden' }}>
                          <div style={{ width: `${(count / max) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#059669,#065f46)', borderRadius: 4 }} />
                        </div>
                        <div style={{ fontSize: 13, color: '#34d399', width: 22, textAlign: 'right' }}>{count}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ background: '#ffffff', border: '1px solid #bbf7d0', borderRadius: 10, padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#6b7280', marginBottom: 16 }}>🎤 KOL 出现频次 Top 10</div>
                {kolFreq.length === 0 ? <div style={{ color: '#e5e7eb', fontSize: 13, textAlign: 'center', padding: 20 }}>暂无数据</div> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {kolFreq.slice(0, 10).map(({ kol, count }, i) => (
                      <div key={kol} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ fontSize: 11, color: i < 3 ? '#fbbf24' : '#059669', width: 18, textAlign: 'center' }}>{i + 1}</div>
                        <div style={{ fontSize: 13, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kol}</div>
                        <div style={{ fontSize: 12, color: '#34d399', background: '#f0fdf4', padding: '2px 8px', borderRadius: 4 }}>{count}次</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ background: '#ffffff', border: '1px solid #bbf7d0', borderRadius: 10, padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#6b7280', marginBottom: 16 }}>📡 平台分布</div>
                {platformDist.length === 0 ? <div style={{ color: '#e5e7eb', fontSize: 13, textAlign: 'center', padding: 20 }}>暂无数据</div> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {platformDist.map(({ platform, count, pct }) => (
                      <div key={platform} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ fontSize: 12, color: '#6b7280', width: 90, flexShrink: 0 }}>{platform}</div>
                        <div style={{ flex: 1, background: '#dcfce7', borderRadius: 4, height: 16, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#0891b2,#059669)', borderRadius: 4 }} />
                        </div>
                        <div style={{ fontSize: 12, color: '#34d399', width: 30, textAlign: 'right' }}>{count}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ background: '#ffffff', border: '1px solid #bbf7d0', borderRadius: 10, padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#6b7280', marginBottom: 16 }}>🤖 AI 智能总结</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <select value={summaryPeriod} onChange={e => setSummaryPeriod(e.target.value)} style={{ ...inputS, marginBottom: 4 }}>
                    <option value="monthly">月度总结</option>
                    <option value="quarterly">季度总结</option>
                    <option value="yearly">年度总结</option>
                  </select>
                  <button onClick={handleSummary} disabled={aiLoading === 'summary'} style={btnS('linear-gradient(135deg,#065f46,#059669)','#fff','none',true)}>
                    {aiLoading === 'summary' ? '生成中...' : '🤖 生成 AI 总结'}
                  </button>
                  <button onClick={handleAnalysis} disabled={aiLoading === 'analysis'} style={btnS('#f0fdf4','#6ee7b7','#065f46')}>
                    {aiLoading === 'analysis' ? '分析中...' : '📋 深度运营分析'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'analysis' && (
          <div>
            <h2 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 700, color: '#111827' }}>🤖 AI 分析报告</h2>
            <div style={{ background: '#ffffff', border: '1px solid #bbf7d0', borderRadius: 12, padding: '24px 28px' }}>
              {(aiLoading === 'analysis' || aiLoading === 'summary')
                ? <div style={{ color: '#34d399', textAlign: 'center', padding: 40 }}>AI 分析中，请稍候...</div>
                : <pre style={{ margin: 0, fontSize: 14, color: '#374151', whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.9 }}>{analysisText || '点击「深度分析」或「AI 总结」按钮开始'}</pre>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getMonthlyData(records) {
  const map = {};
  records.forEach(r => { if (!r.date) return; const m = r.date.slice(0, 7); map[m] = (map[m] || 0) + 1; });
  const sorted = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  const max = Math.max(...sorted.map(([, c]) => c), 1);
  return sorted.map(([month, count]) => ({ month: month.slice(2), count, max }));
}

function getKolFrequency(records) {
  const map = {};
  records.forEach(r => { if (!r.kols) return; r.kols.split('\n').forEach(k => { const kol = k.trim(); if (kol) map[kol] = (map[kol] || 0) + 1; }); });
  return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([kol, count]) => ({ kol, count }));
}

function getPlatformDist(records) {
  const map = {};
  records.forEach(r => { if (r.platform) map[r.platform] = (map[r.platform] || 0) + 1; });
  const total = Object.values(map).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([platform, count]) => ({ platform, count, pct: Math.round(count / total * 100) }));
}

function RecordCard({ r, onOpen, onEdit, onDelete }) {
  const sc = STATUS_STYLE[r.status] || STATUS_STYLE['计划中'];
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: hover ? '#f6fef9' : '#ffffff', border: `1px solid ${hover ? '#10b981' : '#86efac'}`,
        borderLeft: `4px solid ${hover ? '#10b981' : '#059669'}`,
        borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', marginBottom: 10,
        transition: 'all 0.2s ease', boxShadow: hover ? '0 4px 20px rgba(16,185,129,0.18)' : '0 1px 6px rgba(0,0,0,0.07)' }}>
      <div style={{ width: 56, height: 56, borderRadius: 10, background: '#dcfce7', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #134d2a' }}>
        {r.poster_url ? <img src={r.poster_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 24 }}>🎙️</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{r.project_name}</span>
          {r.episode && <Tag>{r.episode} 期</Tag>}
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>{r.status}</span>
          {r.platform && <Tag color="#dcfce7">{r.platform}</Tag>}
        </div>
        <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.theme || '（暂无主题）'}</div>
        <div style={{ fontSize: 13, color: '#059669', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span>📅 {r.date}{r.time ? ` ${r.time}` : ''}</span>
          {r.owner && <span>👤 {r.owner}</span>}
          {r.kols && <span>🎤 {r.kols.split('\n')[0]}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <button onClick={onEdit} style={btnS('#dcfce7','#6b7280','#2d3f5c')}>编辑</button>
        <button onClick={onDelete} style={btnS('#fff5f5','#ef4444','#fecaca')}>删除</button>
      </div>
    </div>
  );
}

function F({ label, children, full }) {
  return (
    <div style={{ gridColumn: full ? '1/-1' : 'auto' }}>
      <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 }}>{label}</label>
      {children}
    </div>
  );
}

function Tag({ children, color = '#f0fdf4' }) {
  return <span style={{ fontSize: 11, color: color === '#f0fdf4' ? '#34d399' : '#c4b5fd', background: color, padding: '2px 7px', borderRadius: 4 }}>{children}</span>;
}

function Center({ children }) {
  return <div style={{ textAlign: 'center', padding: 60, color: '#059669' }}>{children}</div>;
}

function Empty({ search }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 40px', border: '1px dashed #86efac', borderRadius: 16, background: 'linear-gradient(135deg,#f0fdf4 0%,#ffffff 100%)' }}>
      <div style={{ fontSize: 48, marginBottom: 16, filter: 'drop-shadow(0 0 12px rgba(16,185,129,0.4))' }}>🎙️</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#059669', marginBottom: 8 }}>{search ? '没有找到匹配记录' : '还没有 AMA 记录'}</div>
      <div style={{ fontSize: 14, color: '#059669' }}>{search ? '换个关键词试试' : '点击右上角「+ 新建 AMA」开始添加'}</div>
    </div>
  );
}

const inputS = {
  width: '100%', padding: '10px 14px', borderRadius: 8,
  background: '#ffffff', border: '1px solid #134d2a',
  color: '#1a1a1a', fontSize: 15, outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit',
  transition: 'border-color 0.2s',
};

function btnS(bg, color, border, gradient = false, dashed = false) {
  return { padding: '8px 16px', borderRadius: 8, background: bg, color, fontSize: 14, fontWeight: 600,
    border: border === 'none' ? 'none' : `1px ${dashed ? 'dashed' : 'solid'} ${border}`,
    cursor: 'pointer', transition: 'opacity 0.15s, transform 0.1s', letterSpacing: '0.02em' };
}
