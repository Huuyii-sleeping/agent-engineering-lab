import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../../../api";
import { messageText } from "../lib/chat-format";

const markdownComponents: Components = {
  a({ children, href }) {
    return (
      <a href={href} rel="noreferrer" target="_blank">
        {children}
      </a>
    );
  },
};

export function MessageBody({ message }: { message: ChatMessage }) {
  const content = messageText(message);
  if (message.role === "assistant" && message.name === "streaming" && !message.content?.trim()) {
    return <p className="typing-placeholder">正在等待本地 agent 返回结果...</p>;
  }
  if (message.role === "user") {
    return <p>{content}</p>;
  }
  return (
    <div className="markdown-body">
      <ReactMarkdown components={markdownComponents} rehypePlugins={[rehypeHighlight]} remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
