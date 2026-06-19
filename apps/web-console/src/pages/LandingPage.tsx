import { BrainCircuit, ChevronRight, Sparkles } from "lucide-react";

export function LandingPage({ onStart }: { onStart: () => void }) {
  return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="项目导航">
        <span className="landing-brand">
          <span className="brand-mark" aria-hidden="true">
            <BrainCircuit size={21} strokeWidth={2.4} />
          </span>
          <strong>AI Studio</strong>
        </span>
        <button className="landing-nav-action" type="button" onClick={onStart}>
          立即开始
        </button>
      </nav>

      <section className="landing-hero" aria-label="项目介绍">
        <div className="landing-kicker">
          <Sparkles size={16} strokeWidth={2.2} aria-hidden="true" />
          <span>All-in-one local agent workspace</span>
        </div>
        <h1>把对话、技能和流程装进一个本地 Agent 工作台</h1>
        <p>
          AI Studio 面向本地研发与自动化执行场景，把 Agent 测试、Skill 加载、SOP 编排和未来的 Agent 组装放到同一个可扩展控制台里。
        </p>
        <div className="landing-actions">
          <button className="landing-primary-action" type="button" onClick={onStart}>
            <span>立即开始</span>
            <ChevronRight size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <span>进入 Agent 管理界面，创建、配置并测试你的本地 agent</span>
        </div>
      </section>

      <section className="landing-preview" aria-label="能力概览">
        <div className="landing-preview-card landing-preview-card--main">
          <span>Agent 管理</span>
          <strong>管理不同角色的 agent</strong>
          <small>创建、编辑、删除 agent，并为每个 agent 保存独立配置。</small>
        </div>
        <div className="landing-preview-card">
          <span>Skill 与 Action</span>
          <strong>组合可复用能力</strong>
          <small>按 agent 选择技能，维护自定义操作和个性化说明。</small>
        </div>
        <div className="landing-preview-card">
          <span>Agent 测试</span>
          <strong>保留原聊天链路</strong>
          <small>从具体 agent 进入测试页，验证本地 Agent service、BFF 和 SSE。</small>
        </div>
      </section>
    </main>
  );
}
