import {
  ArrowRight,
  Boxes,
  Check,
  Download,
  GitBranch,
  Layers,
  LayoutDashboard,
  Lock,
  MessageSquare,
  ScrollText,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  Workflow,
} from "lucide-react";
import { BrandMark } from "../components/BrandMark";

type Feature = {
  icon: typeof Bot;
  title: string;
  desc: string;
  tag: string;
};

type Step = {
  index: string;
  title: string;
  desc: string;
};

type Tier = {
  icon: typeof Bot;
  name: string;
  role: string;
  desc: string;
  stack: string;
};

const features: Feature[] = [
  {
    icon: Workflow,
    title: "多 Agent 编排",
    desc: "子代理委派、Worktree 隔离并行开发、团队分工协作，复杂任务自动收敛交付。",
    tag: "orchestration",
  },
  {
    icon: Download,
    title: "技能市场 Skill Hub",
    desc: "一键安装 / 更新 / 回滚 / 卸载社区技能，支持上传技能包、来源筛选与技能预检（preflight）。",
    tag: "skills",
  },
  {
    icon: SlidersHorizontal,
    title: "Agent Builder",
    desc: "可视化构建 Agent：身份、提示词、工具与技能配置，本地持久化，开箱即用。",
    tag: "builder",
  },
  {
    icon: MessageSquare,
    title: "流式对话",
    desc: "基于 SSE 的实时流式回复，会话可重命名、置顶、隐藏与批量管理，标题自动摘要。",
    tag: "chat",
  },
  {
    icon: Lock,
    title: "本地优先",
    desc: "全部数据存储在本地，零云端依赖，隐私完全可控，无网络延迟。",
    tag: "local-first",
  },
  {
    icon: ScrollText,
    title: "审计与可观测",
    desc: "技能操作审计事件、运行时健康检查与连接状态，行为全程可追溯。",
    tag: "audit",
  },
  {
    icon: ShieldCheck,
    title: "协议化审批与安全",
    desc: "危险命令拦截、路径越界校验、自治代理与协议化关停，运行可控。",
    tag: "safety",
  },
  {
    icon: Layers,
    title: "上下文压缩与持久任务",
    desc: "长任务、后台任务与上下文压缩，跨会话保留进度，稳定处理大规模上下文。",
    tag: "runtime",
  },
];

const steps: Step[] = [
  {
    index: "01",
    title: "构建",
    desc: "在 Agent Builder 中定义身份、提示词与工具，或导入已有配置，本地持久化。",
  },
  {
    index: "02",
    title: "接入技能",
    desc: "从 Skill Hub 安装技能并完成技能预检（preflight），按来源绑定到目标 Agent。",
  },
  {
    index: "03",
    title: "测试",
    desc: "进入工作台，基于 SSE 与 Agent 流式对话，管理多轮会话与标题摘要。",
  },
  {
    index: "04",
    title: "编排",
    desc: "多 Agent 协作、Worktree 并行开发，协议化审批后收敛交付。",
  },
];

const tiers: Tier[] = [
  {
    icon: Terminal,
    name: "Agent CLI",
    role: "TypeScript 终端运行时",
    desc: "主循环、工具调用、子代理委派与多 Agent 平台。`pnpm dev:agent` 启动开发模式。",
    stack: "TypeScript · Node 22",
  },
  {
    icon: Server,
    name: "BFF",
    role: "Nest 业务服务",
    desc: "REST + SSE 接口、运行时健康检查、技能注册中心同步与审计日志。",
    stack: "NestJS · SSE",
  },
  {
    icon: LayoutDashboard,
    name: "Web Console",
    role: "React 展示端",
    desc: "工作台、Skill Hub、Agent Builder 与设置，统一管理工作流与运行状态。",
    stack: "React · Vite",
  },
];

const capabilities = [
  "本地优先 · 零云端依赖",
  "多 Agent 编排",
  "SSE 实时流式",
  "技能一键安装 / 回滚",
  "数据本地 · 隐私可控",
];

export function LandingPage({ onStart }: { onStart: () => void }) {
  return (
    <main className="lp-shell">
      <nav className="lp-nav" aria-label="项目导航">
        <div className="lp-nav-inner">
          <a className="lp-brand" href="#top" aria-label="Orbit 首页">
            <span className="lp-brand-mark">
              <BrandMark size={18} />
            </span>
            <span className="lp-brand-text">Orbit</span>
          </a>
          <div className="lp-nav-links">
            <a className="lp-nav-link" href="#features">功能</a>
            <a className="lp-nav-link" href="#flow">工作流</a>
            <a className="lp-nav-link" href="#arch">架构</a>
          </div>
          <button className="lp-nav-cta" type="button" onClick={onStart}>
            进入工作台
          </button>
        </div>
      </nav>

      <section className="lp-hero" id="top" aria-label="产品介绍">
        <div className="lp-hero-glow" aria-hidden="true" />
        <div className="lp-hero-grid">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow">
              <span className="lp-eyebrow-dot" />
              本地优先 · 开源构建 · 隐私可控
            </span>
            <h1 className="lp-title">
              本地构建、测试与编排
              <span className="lp-title-accent">你的 AI Agent 团队</span>
            </h1>
            <p className="lp-lead">
              Orbit 是一个运行在你本机的 Agent 全栈工作台。多 Agent 协作、技能市场、SSE 流式对话与可视化构建
              —— 全部数据本地存储，零云端依赖。
            </p>
            <div className="lp-actions">
              <button className="lp-btn-primary" type="button" onClick={onStart}>
                <span>进入工作台</span>
                <ArrowRight size={16} strokeWidth={2} className="lp-btn-arrow" />
              </button>
              <a className="lp-btn-ghost" href="#arch">
                查看架构
              </a>
            </div>
            <ul className="lp-meta-row" aria-label="技术栈">
              <li className="lp-meta-chip">React + Vite</li>
              <li className="lp-meta-chip">Nest BFF</li>
              <li className="lp-meta-chip">TypeScript CLI</li>
              <li className="lp-meta-chip">pnpm monorepo</li>
            </ul>
          </div>

          <div className="lp-hero-visual" aria-hidden="true">
            <div className="lp-window">
              <div className="lp-window-bar">
                <span className="lp-dots" />
                <span className="lp-window-title">agent.config.ts</span>
                <span className="lp-window-tag">本地运行</span>
              </div>
              <pre className="lp-code">
                <code>
                  <span className="lp-c">{"// 定义一个协作型 Agent"}</span>
                  {"\n"}
                  <span className="lp-k">export const</span> reviewer{" "}
                  <span className="lp-k">=</span> {"{"}
                  {"\n  "}
                  <span className="lp-p">name</span>:{" "}
                  <span className="lp-s">"代码审查员"</span>,{"\n  "}
                  <span className="lp-p">model</span>: process.env.
                  <span className="lp-p">MODEL_ID</span>,{"\n  "}
                  <span className="lp-p">skills</span>: [<span className="lp-s">"code-review"</span>,{" "}
                  <span className="lp-s">"lint"</span>, <span className="lp-s">"unit-test"</span>],{"\n  "}
                  <span className="lp-p">tools</span>: [<span className="lp-s">"read_file"</span>,{" "}
                  <span className="lp-s">"edit_file"</span>, <span className="lp-s">"bash"</span>],{"\n  "}
                  <span className="lp-p">orchestrate</span>: {"{"}{" "}
                  <span className="lp-p">teammates</span>: [<span className="lp-s">"planner"</span>,{" "}
                  <span className="lp-s">"tester"</span>] {"}"}
                  {"\n"}
                  {"}"}
                  {"\n\n"}
                  <span className="lp-c">{"// $ pnpm dev:agent → SSE 流式对话"}</span>
                </code>
              </pre>
              <div className="lp-window-foot">
                <span className="lp-foot-dot" />
                已就绪 · 等待会话
              </div>
            </div>
          </div>
        </div>

        <ul className="lp-strip" aria-label="核心能力">
          {capabilities.map((item) => (
            <li className="lp-strip-item" key={item}>
              <Check size={14} strokeWidth={2.4} className="lp-strip-check" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="lp-section" id="features" aria-labelledby="features-title">
        <header className="lp-section-head">
          <span className="lp-eyebrow-sm">功能矩阵</span>
          <h2 className="lp-section-title" id="features-title">
            一个工作台，覆盖 Agent 全生命周期
          </h2>
          <p className="lp-section-sub">
            从构建、接入技能、流式测试到多 Agent 编排，每一步都在本地完成，可控、可追溯。
          </p>
        </header>
        <div className="lp-feature-grid">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article className="lp-feature" key={feature.title}>
                <div className="lp-feature-top">
                  <span className="lp-feature-icon">
                    <Icon size={20} strokeWidth={1.8} />
                  </span>
                  <span className="lp-feature-tag">{feature.tag}</span>
                </div>
                <h3 className="lp-feature-title">{feature.title}</h3>
                <p className="lp-feature-desc">{feature.desc}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="lp-section lp-section--alt" id="flow" aria-labelledby="flow-title">
        <header className="lp-section-head">
          <span className="lp-eyebrow-sm">工作流</span>
          <h2 className="lp-section-title" id="flow-title">
            四步，把想法变成能交付的 Agent
          </h2>
          <p className="lp-section-sub">
            标准化流程让构建、测试与编排可复用，每一次迭代都留下清晰的痕迹。
          </p>
        </header>
        <ol className="lp-flow">
          {steps.map((step, index) => (
            <li className="lp-step" key={step.index}>
              <span className="lp-step-num">{step.index}</span>
              <h3 className="lp-step-title">{step.title}</h3>
              <p className="lp-step-desc">{step.desc}</p>
              {index < steps.length - 1 ? (
                <span className="lp-step-arrow" aria-hidden="true">
                  <ArrowRight size={16} strokeWidth={2} />
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-section" id="arch" aria-labelledby="arch-title">
        <header className="lp-section-head">
          <span className="lp-eyebrow-sm">架构</span>
          <h2 className="lp-section-title" id="arch-title">
            三层架构，统一在同一仓库
          </h2>
          <p className="lp-section-sub">
            Agent CLI、BFF 与 Web Console 通过 Monorepo（pnpm workspaces）组织，遵循 OpenSpec + PRD 增量开发流程。
          </p>
        </header>
        <div className="lp-arch-grid">
          {tiers.map((tier) => {
            const Icon = tier.icon;
            return (
              <article className="lp-arch-card" key={tier.name}>
                <span className="lp-arch-icon">
                  <Icon size={20} strokeWidth={1.8} />
                </span>
                <div className="lp-arch-head">
                  <h3 className="lp-arch-name">{tier.name}</h3>
                  <span className="lp-arch-role">{tier.role}</span>
                </div>
                <p className="lp-arch-desc">{tier.desc}</p>
                <span className="lp-arch-stack">{tier.stack}</span>
              </article>
            );
          })}
        </div>
        <div className="lp-arch-note">
          <GitBranch size={15} strokeWidth={2} className="lp-arch-note-icon" />
          <span>Monorepo（pnpm workspaces） · OpenSpec 规范化变更 · PRD 增量开发 · 发布前 lint / test / build 检查</span>
        </div>
      </section>

      <section className="lp-cta" aria-label="开始使用">
        <div className="lp-cta-inner">
          <div className="lp-cta-glow" aria-hidden="true" />
          <h2 className="lp-cta-title">把 Agent 装进你的机器</h2>
          <p className="lp-cta-sub">
            无需账号、无需云端。安装依赖，启动 Agent 开发模式，立即进入本地工作台。
          </p>
          <div className="lp-actions lp-actions--center">
            <button className="lp-btn-primary" type="button" onClick={onStart}>
              <span>进入工作台</span>
              <ArrowRight size={16} strokeWidth={2} className="lp-btn-arrow" />
            </button>
            <a className="lp-btn-ghost" href="#features">
              浏览功能
            </a>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <span className="lp-brand-mark">
              <BrandMark size={18} />
            </span>
            <div className="lp-footer-brand-copy">
              <strong>Orbit</strong>
              <span>本地优先的 AI Agent 全栈工作台</span>
            </div>
          </div>
          <div className="lp-footer-cols">
            <div className="lp-footer-col">
              <h4>产品</h4>
              <a href="#features">功能矩阵</a>
              <a href="#flow">工作流</a>
              <a href="#arch">架构</a>
              <a href="#top" onClick={onStart}>工作台</a>
            </div>
            <div className="lp-footer-col">
              <h4>资源</h4>
              <a href="#arch">快速启动</a>
              <a href="#flow">PRD 流程</a>
              <a href="#arch">OpenSpec</a>
              <a href="#top">发布检查</a>
            </div>
            <div className="lp-footer-col">
              <h4>技术栈</h4>
              <a href="#arch">Agent CLI</a>
              <a href="#arch">BFF</a>
              <a href="#arch">Web Console</a>
              <a href="#arch">Monorepo</a>
            </div>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <span>© 2026 Orbit · 本地优先，开放构建</span>
          <span className="lp-footer-status">
            <Boxes size={13} strokeWidth={2} />
            本地运行 · 开源
          </span>
        </div>
      </footer>
    </main>
  );
}
