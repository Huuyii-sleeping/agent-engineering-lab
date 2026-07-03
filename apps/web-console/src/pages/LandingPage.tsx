import { ArrowRight, Bot, Blocks, Sparkles, Terminal } from "lucide-react";

export function LandingPage({ onStart }: { onStart: () => void }) {
  return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="项目导航">
        <div className="landing-nav-inner">
          <span className="landing-brand">
            <Bot size={22} strokeWidth={1.8} className="landing-brand-icon" />
            <span className="landing-brand-text">AI Studio</span>
          </span>
          <button className="landing-nav-cta" type="button" onClick={onStart}>
            开始
          </button>
        </div>
      </nav>

      <section className="landing-hero" aria-label="项目介绍">
        <div className="landing-hero-mesh" />
        <div className="landing-hero-content">
          <div className="landing-hero-badge">
            <Sparkles size={14} strokeWidth={2} className="landing-badge-icon" />
            <span>本地 Agent 全栈工作台</span>
          </div>
          <h1>AI Studio</h1>
          <p>在本地构建、测试和部署 AI Agent。多 Agent 协作、技能编排、实时聊天 —— 全部运行在你的机器上。</p>
          <button className="landing-hero-cta" type="button" onClick={onStart}>
            <span>立即开始</span>
            <ArrowRight size={16} strokeWidth={2} className="landing-cta-arrow" />
          </button>
        </div>
      </section>

      <section className="landing-features" aria-label="核心能力">
        <div className="landing-features-inner">
          <div className="landing-feature-card">
            <div className="landing-feature-icon">
              <Bot size={22} strokeWidth={1.8} />
            </div>
            <h3>多 Agent 协作</h3>
            <p>创建多个专业 Agent，配置不同角色与技能，让它们协同完成复杂任务。</p>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon">
              <Blocks size={22} strokeWidth={1.8} />
            </div>
            <h3>技能编排</h3>
            <p>从 Skill Hub 安装社区技能，或自定义工具链，灵活组合你的 Agent 能力。</p>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon">
              <Terminal size={22} strokeWidth={1.8} />
            </div>
            <h3>本地优先</h3>
            <p>全部数据存储在本地，零网络延迟，完全控制隐私。无需云端，安全可靠。</p>
          </div>
        </div>
      </section>

      <section className="landing-stats" aria-label="关键指标">
        <div className="landing-stats-inner">
          <div className="landing-stat-item">
            <span className="landing-stat-number">100%</span>
            <span className="landing-stat-label">本地运行</span>
          </div>
          <div className="landing-stat-divider" />
          <div className="landing-stat-item">
            <span className="landing-stat-number">0ms</span>
            <span className="landing-stat-label">零延迟</span>
          </div>
          <div className="landing-stat-divider" />
          <div className="landing-stat-item">
            <span className="landing-stat-number">&infin;</span>
            <span className="landing-stat-label">多 Agent</span>
          </div>
          <div className="landing-stat-divider" />
          <div className="landing-stat-item">
            <span className="landing-stat-number">灵活</span>
            <span className="landing-stat-label">可扩展</span>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <span>&copy; 2026 AI Studio. 本地优先，开放构建。</span>
      </footer>
    </main>
  );
}
