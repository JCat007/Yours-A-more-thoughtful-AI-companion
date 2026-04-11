import BellaAgentChat from './BellaAgentChat';

export default function AgentModeView() {
  return (
    <div className="bella-page-shell flex flex-col flex-1 min-h-0 w-full h-full overflow-hidden">
      <div className="bella-page-inner flex-1 min-h-0 w-full flex">
        <div className="bella-responsive-card w-full h-full flex-1 min-h-0">
          <BellaAgentChat />
        </div>
      </div>
    </div>
  );
}
