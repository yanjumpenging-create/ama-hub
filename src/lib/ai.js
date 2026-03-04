async function callClaude(systemPrompt, userPrompt) {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || '调用 AI 失败');
  return data.content[0].text;
}

export async function generateQuestions({ projectName, theme, notes, history }) {
  const historyContext = history?.length
    ? `\n\n历史 AMA 参考（避免重复）：\n${history.slice(0, 3).map(r => `- ${r.theme}：${r.questions?.slice(0, 200)}`).join('\n')}`
    : '';
  return callClaude(
    `你是 Tree Finance 大树财经的 Web3 内容编辑，擅长设计专业、有深度、能引发讨论的 AMA 问题。风格要求：问题要有层次感，从项目背景→核心产品→市场策略→未来规划递进，语气专业但不晦涩，适合中文 Web3 社区。直接输出问题列表，每个问题单独一行，编号格式：1. 2. 3. 不需要其他解释。`,
    `项目名：${projectName}\n本期主题：${theme || '项目介绍与近期进展'}\n背景备注：${notes || '无'}${historyContext}\n\n请生成 8-10 个 AMA 问题。`
  );
}

export async function generatePromo({ projectName, theme, date, kols, questions }) {
  return callClaude(
    `你是 Tree Finance 大树财经的运营，负责写 AMA 预热推文和社群宣传文案。风格：简洁有力，带一点 Web3 氛围感，包含关键信息，结尾带行动号召。输出两个版本：1) Telegram/Twitter 英文版（100字内）2) 微信/中文社群版（150字内）`,
    `项目：${projectName}\n主题：${theme}\n时间：${date}\n嘉宾KOL：${kols || '待定'}\n核心问题预告：${questions?.slice(0, 300) || '精彩议题'}\n\n请输出宣传文案。`
  );
}

export async function analyzeHistory(records) {
  if (!records?.length) return '暂无足够历史数据，请先录入至少 3 条 AMA 记录。';
  const summary = records.slice(0, 10).map(r =>
    `[${r.date}] ${r.project_name}（${r.status}）\n主题：${r.theme}\nKOL：${r.kols?.slice(0, 80)}`
  ).join('\n\n');
  return callClaude(
    `你是 Web3 内容策略分析师，擅长从 AMA 历史数据中找规律、给出可落地的改进建议。分析维度：题材分布、节奏规律、KOL 策略、问题质量模式。输出格式：结构清晰的中文分析报告，要有具体洞察，不要废话。`,
    `以下是 Tree Finance 近期 AMA 历史记录：\n\n${summary}\n\n请给出深度分析和 3-5 条优化建议。`
  );
}
