import { getClaudeCodeCliStatus } from "@docket/ai";
import { getDocketSnapshot } from "@docket/domain";

import { PageHeader, Section, StatusBadge } from "../../../src/components/docket-ui";
import { openClaudeCodeAuthAction } from "./actions";

export default function SettingsPage() {
  const data = getDocketSnapshot();
  const claudeStatus = getClaudeCodeCliStatus();
  return (
    <>
      <PageHeader eyebrow="Settings" title="Firm policy, consent, integrations, and security posture" />
      <Section title="Local AI provider">
        <div className="grid-3">
          <div className="item-card">
            <div className="item-card-title">
              <h3>Claude Code CLI</h3>
              <StatusBadge label={claudeStatus.available ? "Installed" : "Not installed"} tone={claudeStatus.available ? "green" : "red"} />
            </div>
            <p>{claudeStatus.version ?? "Claude Code CLI was not found on PATH."}</p>
            <p>Provider selected: {claudeStatus.selectedByEnv ? "yes" : "no"} · Local CLI enabled: {claudeStatus.enabledByEnv ? "yes" : "no"}</p>
            <form action={openClaudeCodeAuthAction}>
              <button type="submit">Open Claude auth</button>
            </form>
            <small>Command: {claudeStatus.authCommand}</small>
          </div>
          <div className="item-card">
            <div className="item-card-title">
              <h3>Activation flags</h3>
              <StatusBadge label="Local only" tone="yellow" />
            </div>
            <p>Set DOCKET_AI_PROVIDER=claude_code_cli and DOCKET_ENABLE_LOCAL_AI_CLI=true to use the local CLI provider.</p>
            <p>Docket does not store a Claude API key; Claude Code uses your local Claude authentication.</p>
          </div>
          <div className="item-card">
            <div className="item-card-title">
              <h3>Safety boundary</h3>
              <StatusBadge label="Review gated" tone="green" />
            </div>
            <p>CLI output is still treated as AI-prepared work. Facts need evidence, conclusions need knowledge snapshots, and filing readiness still requires human approval.</p>
          </div>
        </div>
      </Section>
      <Section title="Firm policies">
        <div className="grid-3">
          {data.firmPolicies.map((policy) => (
            <div className="item-card" key={policy.id}>
              <div className="item-card-title">
                <h3>{policy.name}</h3>
                <StatusBadge label={policy.action} tone={policy.severity === "RED" ? "red" : "yellow"} />
              </div>
              <p>{policy.description}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Integrations">
        <div className="grid-3">
          {data.integrationConnections.map((integration) => (
            <div className="item-card" key={integration.id}>
              <div className="item-card-title">
                <h3>{integration.provider.replaceAll("_", " ")}</h3>
                <StatusBadge label={integration.status.replaceAll("_", " ")} tone={integration.status === "CONNECTED" ? "green" : "yellow"} />
              </div>
              <p>External calls {integration.externalCallsAllowed ? "enabled" : "disabled"}</p>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
